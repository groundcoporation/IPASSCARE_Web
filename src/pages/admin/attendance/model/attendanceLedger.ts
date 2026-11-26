import { firstJoined } from '../../../../utils/relations.ts';
import { MAX_SLOTS, excluded, weeklyCount, kstDateKey, isBeforeChildDeletion, rangeOf } from './ledgerRules.ts';
import type { AttendanceRow, AttendanceSource, AttendanceLedgerSnapshot } from '../types';
/** Pure projection of the existing monthly ledger rules. */
export function buildAttendanceLedger(snapshot: AttendanceLedgerSnapshot, month: string): AttendanceRow[] {
  const { children, packages, logs, withdrawals, parentRows, reservedUsage, directUsage } = snapshot;
  const period = rangeOf(month);
  const withdrawalByChild = new Map<string, any>();
  const withdrawalByUser = new Map<string, any>();
  withdrawals.forEach((w: any) => {
    if (w.child_id) withdrawalByChild.set(w.child_id, w);
    if (w.user_id) withdrawalByUser.set(w.user_id, w);
  });

  const parents = new Map(parentRows.map((item) => [item.id, item.name]));
  const parentStatuses = new Map(parentRows.map((item) => [item.id, item.status]));

  const visibleChildren = children.filter((child: any) => {
    if (child.deleted_at != null) return false;
    const parentStatus = child.parent_id ? parentStatuses.get(child.parent_id) : null;
    if (parentStatus === 'deleted') return false;

    const wInfo = withdrawalByChild.get(child.id) || (child.parent_id ? withdrawalByUser.get(child.parent_id) : null);
    if (wInfo) {
      // 🎯 환불완료되었거나 환불없음이면 출결조회에서 깔끔하게 제외!
      if (wInfo.refund_status === 'completed' || wInfo.refund_status === 'none') {
        return false;
      }
      // 🎯 환불 대기 중이면 원장님이 출결 도장과 잔여횟수를 크로스체크할 수 있도록 장부에 유지!
      return true;
    }

    return true;
  });

  const packageMap = new Map<string, any[]>();
  packages.forEach((item: any) => item.child_id && packageMap.set(item.child_id, [...(packageMap.get(item.child_id) ?? []), item]));
  const legacy = new Map<string, string[]>();
  logs.forEach((log) => {
    if (!excluded(log.status)) {
      const dates = legacy.get(log.child_id) ?? [];
      dates.push(log.date);
      legacy.set(log.child_id, dates);
    }
  });
  const usage = new Map<string, Array<{ date: string; source: AttendanceSource | null }>>();
  [...reservedUsage, ...directUsage.map((item) => ({ ...item, reservations: null }))].forEach((item) => {
    const reservation: any = firstJoined(item.reservations);
    if (reservation?.deleted_at) return;
    if (excluded(reservation?.attendance_status ?? null)) return;
    const date = reservation?.class_date ?? kstDateKey(item.consumed_at);
    if (!date || date < period.from || date > period.to) return;
    const dates = usage.get(item.user_package_id) ?? [];
    for (let index = 0; index < Math.max(1, item.quantity ?? 1); index += 1) dates.push({ date, source: { id: item.id, consumedAt: item.consumed_at ?? null } });
    usage.set(item.user_package_id, dates);
  });

  const rows: AttendanceRow[] = [];
  visibleChildren.forEach((child: any) => {
    const wInfo = withdrawalByChild.get(child.id) || (child.parent_id ? withdrawalByUser.get(child.parent_id) : null);
    const withdrawalStatus = wInfo?.refund_status === 'pending' ? 'pending' : null;

    const items = packageMap.get(child.id) ?? [];
    if (!items.length) {
      rows.push({ 
        id: `child-${child.id}`, 
        childId: child.id, 
        childName: child.child_name ?? "이름 없음", 
        parentName: parents.get(child.parent_id) ?? "-", 
        packageName: "이용권 없음", 
        weekly: null, 
        total: 0, 
        used: 0, 
        remaining: 0, 
        dates: [],
        sources: [],
        withdrawalStatus
      });
    }
    items.forEach((item: any) => {
      let entries = [...(usage.get(item.id) ?? [])];
      if (!entries.length && items.length === 1) entries = (legacy.get(child.id) ?? []).map((date) => ({ date, source: null }));
      entries = entries.filter(({ date }) => isBeforeChildDeletion(date, child.deleted_at)).sort((a, b) => a.date.localeCompare(b.date));
      const dates = entries.map(({ date }) => date);
      const total = Math.min(MAX_SLOTS, item.total_count ?? 0);
      const used = Math.min(MAX_SLOTS, Math.max((item.total_count ?? 0) - (item.remaining_count ?? 0), dates.length));
      rows.push({ 
        id: item.id, 
        childId: child.id, 
        childName: child.child_name ?? item.child_name ?? "이름 없음", 
        parentName: parents.get(child.parent_id) ?? "-", 
        packageName: item.package_name ?? "수업권", 
        weekly: weeklyCount(item.package_name), 
        total, 
        used, 
        remaining: Math.max(0, item.remaining_count ?? total - used), 
        dates: dates.slice(0, MAX_SLOTS),
        sources: entries.slice(0, MAX_SLOTS).map(({ source }) => source),
        withdrawalStatus
      });
    });
  });

  return rows;
}
