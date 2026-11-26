export type AttendanceSource = { id: string; consumedAt: string | null };
export type AttendanceRow = { id: string; childId: string; childName: string; parentName: string; packageName: string; weekly: number | null; total: number; used: number; remaining: number; dates: string[]; sources: Array<AttendanceSource | null>; withdrawalStatus?: 'pending' | 'completed' | null };

export interface LedgerChild { id: string; child_name?: string | null; parent_id?: string | null; deleted_at?: string | null; }
export interface LedgerPackage { id: string; child_id?: string | null; child_name?: string | null; package_name?: string | null; total_count?: number | null; remaining_count?: number | null; }
export interface LedgerLog { child_id: string; date: string; status: string | null; }
export interface LedgerWithdrawal { child_id?: string | null; user_id?: string | null; refund_status?: string | null; }
export interface LedgerParent { id: string; name?: string | null; status?: string | null; }
export interface LedgerReservation { class_date?: string | null; attendance_status?: string | null; deleted_at?: string | null; }
export interface LedgerUsage { id: string; user_package_id: string; quantity?: number | null; consumed_at?: string | null; reservations?: LedgerReservation | LedgerReservation[] | null; }
export interface AttendanceLedgerSnapshot {
  children: LedgerChild[]; packages: LedgerPackage[]; logs: LedgerLog[]; withdrawals: LedgerWithdrawal[];
  parentRows: LedgerParent[]; reservedUsage: LedgerUsage[]; directUsage: LedgerUsage[];
}
