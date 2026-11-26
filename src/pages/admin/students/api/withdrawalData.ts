import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeError } from '../../../../errors/appError.ts';
import type { WithdrawalRecord } from '../types';

interface DeletedAccount {
  id: string;
  email: string | null;
  branch_id: string | null;
  created_at: string;
}

interface WithdrawalStudent {
  id: string;
  parent_user_id: string | null;
  child_id: string | null;
  branch_id: string | null;
  student_name: string | null;
  parent_name: string | null;
  attendance_code: string | null;
  mother_phone: string | null;
  father_phone: string | null;
  student_phone: string | null;
}

/** Pure display projection. Inferred records are not persisted or treated as refundable rows. */
export function buildWithdrawalRecords(
  stored: WithdrawalRecord[], deletedAccounts: DeletedAccount[], students: WithdrawalStudent[],
): WithdrawalRecord[] {
  const studentsByParent = new Map<string, WithdrawalStudent[]>();
  students.forEach(row => {
    if (!row.parent_user_id) return;
    const rows = studentsByParent.get(row.parent_user_id) || [];
    rows.push(row);
    studentsByParent.set(row.parent_user_id, rows);
  });

  const storedChildIds = new Set(stored.map(row => row.child_id).filter(Boolean));
  const storedAccountUserIds = new Set(
    stored.filter(row => !row.child_id).map(row => row.user_id).filter(Boolean),
  );
  const inferred: WithdrawalRecord[] = [];

  // Legacy account deletion anonymizes users and leaves only status=deleted.
  for (const user of deletedAccounts) {
    if (storedAccountUserIds.has(user.id)) continue;
    const linkedStudents = studentsByParent.get(user.id) || [];
    const emailTimestamp = typeof user.email === 'string'
      ? user.email.match(/^deleted_(\d+)@unknown\.com$/)?.[1]
      : undefined;
    const deletedAt = emailTimestamp
      ? new Date(Number(emailTimestamp)).toISOString()
      : user.created_at;

    const visibleStudents = linkedStudents.filter(student => !storedChildIds.has(student.child_id));
    if (visibleStudents.length > 0) {
      visibleStudents.forEach(student => {
        inferred.push({
          id: `deleted-user:${user.id}:${student.child_id || student.id}`,
          user_id: user.id,
          user_name: student.parent_name || '탈퇴한 사용자',
          phone: student.mother_phone || student.father_phone || student.student_phone || null,
          child_id: student.child_id || null,
          child_name: student.student_name || '원생 미지정',
          attendance_code: student.attendance_code || null,
          branch_id: student.branch_id || user.branch_id || null,
          reason: '앱 회원 탈퇴',
          source: 'app',
          event_type: 'account_withdrawal',
          refund_status: 'none',
          created_at: deletedAt,
          is_inferred: true,
        });
        if (student.child_id) storedChildIds.add(student.child_id);
      });
    } else {
      inferred.push({
        id: `deleted-user:${user.id}`,
        user_id: user.id,
        user_name: '탈퇴한 사용자',
        phone: null,
        child_id: null,
        child_name: null,
        attendance_code: null,
        branch_id: user.branch_id || null,
        reason: '앱 회원 탈퇴',
        source: 'app',
        event_type: 'account_withdrawal',
        refund_status: 'none',
        created_at: deletedAt,
        is_inferred: true,
      });
    }
    storedAccountUserIds.add(user.id);
  }

  return [...stored, ...inferred].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

interface Dependencies {
  client: Pick<SupabaseClient, 'from'>;
}

/** Read all sources successfully before returning stored and inferred records together. */
export async function loadWithdrawalData(activeBranchId: string | null, { client }: Dependencies) {
  try {
    let query = client.from('user_withdrawals').select('*').order('created_at', { ascending: false });
    let deletedUsersQuery = client.from('users')
      .select('id, name, phone, email, branch_id, created_at').eq('status', 'deleted');
    let academyStudentsQuery = client.from('academy_students')
      .select('id, parent_user_id, child_id, branch_id, student_name, parent_name, attendance_code, mother_phone, father_phone, student_phone');
    if (activeBranchId && activeBranchId !== 'all') {
      query = query.eq('branch_id', activeBranchId);
      deletedUsersQuery = deletedUsersQuery.eq('branch_id', activeBranchId);
      academyStudentsQuery = academyStudentsQuery.eq('branch_id', activeBranchId);
    }
    const [withdrawals, deletedUsers, academyStudents] = await Promise.all([
      query, deletedUsersQuery, academyStudentsQuery,
    ]);
    if (withdrawals.error) throw withdrawals.error;
    if (deletedUsers.error) throw deletedUsers.error;
    if (academyStudents.error) throw academyStudents.error;

    return buildWithdrawalRecords(
      (withdrawals.data || []) as WithdrawalRecord[],
      (deletedUsers.data || []) as DeletedAccount[],
      (academyStudents.data || []) as WithdrawalStudent[],
    );
  } catch (error: unknown) {
    throw normalizeError(error, 'WITHDRAWAL_LOAD_FAILED');
  }
}
