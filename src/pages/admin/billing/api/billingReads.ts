import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeError } from '../../../../errors/appError.ts';
import { withBillingReminder } from '../../../../utils/billingReminder.ts';
import { billingMonthPeriod } from '../model/billingPeriod.ts';
import type { Bill, AppPaymentRequest } from '../types';

type Dependencies = { client: Pick<SupabaseClient, 'from'> };

/** Return invoice and app-request data together; never publish a partial ledger. */
export async function loadInvoiceData(activeBranchId: string | null, selectedMonth: string, { client }: Dependencies) {
  try {
    // 1. Fetch bills for the selected month
    let query = client
      .from('academy_bills')
      .select(`
        *,
        academy_students(
          student_name,
          parent_user_id,
          child_id,
          archived_at,
          child:children(deleted_at),
          parent:users(status)
        ),
        class_schedules(target_class),
        package_options(
          label,
          price,
          packages(name)
        )
      `)
      .eq('bill_month', selectedMonth);
    
    if (activeBranchId && activeBranchId !== 'all') {
      query = query.eq('branch_id', activeBranchId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    const linkedIds = Array.from(new Set((data || [])
      .map((bill: any) => bill.payment_request_id as string | null)
      .filter((id): id is string => Boolean(id))));
    const reminders = new Map<string, { reminder_count: number; last_reminded_at: string | null }>();
    // Batch reads avoid a separate request for each bill and oversized URL filters.
    for (let offset = 0; offset < linkedIds.length; offset += 100) {
      const { data: requests, error: reminderError } = await client
        .from('payment_requests')
        .select('id, reminder_count, last_reminded_at')
        .in('id', linkedIds.slice(offset, offset + 100));
      if (reminderError) throw reminderError;
      for (const request of requests || []) reminders.set(request.id, request);
    }

    const activeStudentBills = ((data || []) as Bill[]).filter((bill) => {
      const student = bill.academy_students;
      return student && (student.archived_at || (
        (!student.child_id || student.child?.deleted_at == null)
        && (!student.parent_user_id || student.parent?.status !== 'deleted')
      ));
    });
    const bills = activeStudentBills.map(bill => withBillingReminder(bill, reminders.get(bill.payment_request_id || '')));

    const period = billingMonthPeriod(selectedMonth);
    let appRequestQuery = client
      .from('payment_requests')
      .select('id, parent_id, parent_name, branch_id, final_amount, total_amount, status, request_title, request_type, issued_source, beneficiary_name, created_at, closed_at, reminder_count, last_reminded_at')
      .eq('issued_source', 'admin_app')
      .gte('created_at', `${period.start}T00:00:00+09:00`)
      .lte('created_at', `${period.end}T23:59:59+09:00`)
      .order('created_at', { ascending: false });
    if (activeBranchId && activeBranchId !== 'all') {
      appRequestQuery = appRequestQuery.eq('branch_id', activeBranchId);
    }
    const { data: appRequests, error: appRequestError } = await appRequestQuery;
    if (appRequestError) throw appRequestError;
    const linkedRequestIds = new Set((data || [])
      .map((bill: any) => bill.payment_request_id)
      .filter(Boolean));
    const appPaymentRequests = ((appRequests || []) as AppPaymentRequest[])
      .filter((request) => !linkedRequestIds.has(request.id));

    return { bills, appPaymentRequests };
  } catch (error: unknown) {
    throw normalizeError(error, 'BILL_LOAD_FAILED');
  }
}

export async function loadBillingAutomation(branchId: string | null, { client }: Dependencies) {
  try {
    if (!branchId || branchId === 'all') return { enabled: false, lastRunAt: null, targetStudentIds: [] as string[] };
    const [settingResult, targetResult] = await Promise.all([
      client.from('academy_billing_automation_settings').select('is_enabled, last_run_at').eq('branch_id', branchId).maybeSingle(),
      client.from('academy_billing_automation_targets').select('student_id').eq('branch_id', branchId).eq('is_enabled', true),
    ]);
    if (settingResult.error) throw settingResult.error;
    if (targetResult.error) throw targetResult.error;
    return {
      enabled: Boolean(settingResult.data?.is_enabled),
      lastRunAt: (settingResult.data?.last_run_at || null) as string | null,
      targetStudentIds: (targetResult.data || []).map(row => row.student_id as string),
    };
  } catch (error: unknown) {
    throw normalizeError(error, 'BILL_LOAD_FAILED');
  }
}
