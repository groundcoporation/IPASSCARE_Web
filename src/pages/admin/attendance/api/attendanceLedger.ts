import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError } from '../../../../errors/appError.ts';
import { readAttendanceIdBatches, readAttendancePages } from '../../../../utils/attendanceQuery.ts';
import { rangeOf, moveMonth } from '../model/ledgerRules.ts';
import { buildAttendanceLedger } from '../model/attendanceLedger.ts';
/** Complete paged read snapshot only. Any query error rejects the whole ledger. */
export async function loadAttendanceLedger(branchId: string | null, month: string, { client: supabase }: { client: Pick<SupabaseClient, 'from'> }) {
  try {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new AppError('INPUT_INVALID');
    const period = rangeOf(month);
  let childrenQuery = supabase.from("children").select("id,child_name,parent_id,branch_id,deleted_at").is("deleted_at", null).order("child_name").order("id");
  let packagesQuery = supabase.from("user_packages").select("id,user_id,child_id,child_name,package_name,total_count,remaining_count,status,voucher_type,branch_id").or("voucher_type.is.null,voucher_type.neq.shuttle").order("created_at", { ascending: false }).order("id");
  let logsQuery = supabase.from("attendance_logs").select("child_id,date,status,check_in").gte("date", period.from).lte("date", period.to).not("check_in", "is", null).order("id");
  let withdrawalsQuery = supabase.from("user_withdrawals").select("id,child_id,user_id,child_name,user_name,refund_status").order("id");

  const selectedBranch = branchId;
  if (selectedBranch) {
    childrenQuery = childrenQuery.eq("branch_id", selectedBranch);
    packagesQuery = packagesQuery.eq("branch_id", selectedBranch);
    logsQuery = logsQuery.eq("branch_id", selectedBranch);
    withdrawalsQuery = withdrawalsQuery.eq("branch_id", selectedBranch);
  }
  const [children, packages, logs, withdrawals] = await Promise.all([
    readAttendancePages((from, to) => childrenQuery.range(from, to)),
    readAttendancePages((from, to) => packagesQuery.range(from, to)),
    readAttendancePages((from, to) => logsQuery.range(from, to)),
    readAttendancePages((from, to) => withdrawalsQuery.range(from, to)),
  ]);

  const parentIds = [...new Set(children.map((child: any) => child.parent_id).filter(Boolean))];
  const packageIds = packages.map((item: any) => item.id);
  const monthStart = `${period.from}T00:00:00+09:00`;
  const nextMonthStart = `${moveMonth(month, 1)}-01T00:00:00+09:00`;
  const [parentRows, reservedUsage, directUsage] = await Promise.all([
    readAttendanceIdBatches(parentIds, (ids) => readAttendancePages((from, to) =>
      supabase.from("users").select("id,name,status").in("id", ids).order("id").range(from, to))),
    readAttendanceIdBatches(packageIds, (ids) => readAttendancePages((from, to) =>
      supabase.from("package_usage_logs").select("id,user_package_id,quantity,consumed_at,reservations!inner(class_date,attendance_status,deleted_at)")
        .in("user_package_id", ids).eq("status", "consumed").gte("reservations.class_date", period.from)
        .lte("reservations.class_date", period.to).is("reservations.deleted_at", null).order("id").range(from, to))),
    readAttendanceIdBatches(packageIds, (ids) => readAttendancePages((from, to) =>
      supabase.from("package_usage_logs").select("id,user_package_id,quantity,consumed_at")
        .in("user_package_id", ids).eq("status", "consumed").is("reservation_id", null)
        .gte("consumed_at", monthStart).lt("consumed_at", nextMonthStart).order("id").range(from, to))),
  ]);

    return buildAttendanceLedger({ children, packages, logs, withdrawals, parentRows, reservedUsage, directUsage }, month);
  } catch (error: unknown) { throw normalizeError(error, 'ATTENDANCE_LEDGER_LOAD_FAILED'); }
}
