import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError } from '../../../../errors/appError.ts';
import { firstJoined } from '../../../../utils/relations.ts';
import { loadAdminContentList } from '../../site/api/contentReads.ts';
type Client = Pick<SupabaseClient, 'from'>;
/** Complete response set required; not an atomic snapshot or a guaranteed exhaustive ledger. */
export async function loadDashboardSnapshot(branchId: string | null, month: string, { client }: { client: Client }) {
  try {
    if ((branchId !== null && (!branchId || branchId === 'all')) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new AppError('INPUT_INVALID');
    const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
    let students = client.from('academy_students').select(`id, student_name, admission_date, created_at, branch_id,
          child_id, child:children(deleted_at), parent_user_id, parent:users(status)`).is('archived_at', null);
    let schedules = client.from('class_schedules').select('id, target_class, day_of_week, start_time, end_time, branch_id, max_people').eq('is_active', true).order('start_time', { ascending: true });
    let reservations = client.from('reservations').select('id, child_id, schedule_id, class_date, status, attendance_status, branch_id').is('deleted_at', null).gte('class_date', `${month}-01`).lte('class_date', end);
    let logs = client.from('attendance_logs').select('id, child_id, date, status, check_in, check_out, branch_id').gte('date', `${month}-01`).lte('date', end);
    let bills = client.from('academy_bills').select('id, student_id, bill_month, amount_due, amount_paid, status, branch_id').eq('bill_month', month);
    let balance = client.from('academy_sms_balances').select('point_balance, branch_id');
    if (branchId) {
      students = students.eq('branch_id', branchId); schedules = schedules.eq('branch_id', branchId);
      reservations = reservations.eq('branch_id', branchId); logs = logs.eq('branch_id', branchId);
      bills = bills.eq('branch_id', branchId); balance = balance.eq('branch_id', branchId);
    }
    const hq = client.from('headquarter_notices').select('*').order('created_at', { ascending: false });
    const results = await Promise.all([students, schedules, reservations, logs, bills, balance, hq]);
    for (const result of results) {
      if (result.error) throw result.error;
      if (!Array.isArray(result.data)) throw new AppError('DASHBOARD_LOAD_FAILED');
    }
    return {
      students: (results[0].data ?? []).filter(row => (!row.child_id || firstJoined<{ deleted_at: string | null }>(row.child)?.deleted_at == null)
        && (!row.parent_user_id || firstJoined<{ status: string | null }>(row.parent)?.status !== 'deleted')),
      schedules: results[1].data ?? [], reservations: results[2].data ?? [], attendanceLogs: results[3].data ?? [],
      bills: results[4].data ?? [], pointBalance: (results[5].data ?? []).reduce((sum, row) => sum + (row.point_balance || 0), 0),
      hqNotices: results[6].data ?? [],
    };
  } catch (error: unknown) { throw normalizeError(error, 'DASHBOARD_LOAD_FAILED'); }
}

export async function loadLegacyDashboardTab(tab: string, { client }: { client: Client }) {
  try {
    if (tab === 'inquiries' || tab === 'videos') return { rows: await loadAdminContentList(tab, { client }), settings: null };
    if (tab !== 'settings') {
      if (!['payments', 'attendance'].includes(tab)) throw new AppError('INPUT_INVALID');
      return { rows: [], settings: null };
    }
    const { data, error } = await client.from('web_settings').select('*').eq('id', 'default').single();
    if (error) throw error;
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new AppError('DASHBOARD_LOAD_FAILED');
    return { rows: [], settings: {
      litePrice: String(data.lite_monthly_price || 99000), proPrice: String(data.pro_monthly_price || 118000),
      kakaoUrl: data.kakao_chat_url || 'https://pf.kakao.com/', contactPhone: data.contact_phone || '010-7563-2520',
      contactEmail: data.contact_email || 'groundcorp@naver.com',
    } };
  } catch (error: unknown) { throw normalizeError(error, 'DASHBOARD_LOAD_FAILED'); }
}
