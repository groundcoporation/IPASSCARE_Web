import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Search, ShieldCheck, Users } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

type Profile = { id: string; name: string | null; role: string; branch_id: string | null };
type Branch = { id: string; name: string };
type Member = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  branch_id: string | null;
  created_at: string | null;
};

const ROLE_LABELS: Record<string, string> = {
  admin: '최고 관리자',
  director: '원장',
  teacher: '선생님',
  coach: '선생님(기존)',
  driver: '기사',
  user: '회원',
};

export function AdminRoleManagementTab({ profile, activeBranchId, branches }: { profile: Profile; activeBranchId: string | null; branches: Branch[] }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const targetBranch = profile.role === 'director' ? profile.branch_id : activeBranchId;
      if (profile.role === 'director' && !targetBranch) {
        throw new Error('원장 계정에 소속 지점이 지정되어 있지 않습니다.');
      }

      const { data, error: queryError } = await supabase.rpc('list_role_manageable_members', {
        p_branch_id: profile.role === 'admin' ? targetBranch : null,
      });
      if (queryError) throw queryError;
      setMembers((data ?? []) as Member[]);
    } catch (reason: any) {
      setError(reason?.message ?? '회원 목록을 불러오지 못했습니다.');
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [activeBranchId, profile.branch_id, profile.role]);

  useEffect(() => { void loadMembers(); }, [loadMembers]);

  const visibleMembers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return members.filter((member) => {
      const matchesRole = roleFilter === 'all' || member.role === roleFilter || (roleFilter === 'teacher' && member.role === 'coach');
      const matchesSearch = !keyword || `${member.name ?? ''} ${member.email ?? ''} ${member.phone ?? ''}`.toLowerCase().includes(keyword);
      return matchesRole && matchesSearch;
    });
  }, [members, roleFilter, search]);

  const allowedRoles = profile.role === 'admin'
    ? ['admin', 'director', 'teacher', 'driver', 'user']
    : ['teacher', 'driver', 'user'];

  const updateRole = async (member: Member, nextRole: string) => {
    if (member.role === nextRole) return;
    const nextLabel = ROLE_LABELS[nextRole] ?? nextRole;
    if (!window.confirm(`${member.name ?? member.email ?? '선택한 회원'}님의 권한을 '${nextLabel}'(으)로 변경하시겠습니까?`)) return;

    setSavingId(member.id);
    setError('');
    try {
      const { error: rpcError } = await supabase.rpc('update_member_role', {
        p_user_id: member.id,
        p_role: nextRole,
      });
      if (rpcError) throw rpcError;
      setMembers((current) => current.map((item) => item.id === member.id ? { ...item, role: nextRole } : item));
    } catch (reason: any) {
      setError(reason?.message ?? '권한을 변경하지 못했습니다.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-xs lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-slate-900"><ShieldCheck className="text-blue-600" size={22} />회원 권한 부여</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">{profile.role === 'admin' ? '전체 또는 선택 지점 회원의 권한을 관리합니다.' : '본인 지점 회원에게 선생님·기사·회원 권한을 지정할 수 있습니다.'}</p>
        </div>
        <button type="button" onClick={() => void loadMembers()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />새로고침
        </button>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="이름, 이메일, 연락처 검색" className="w-full rounded-xl bg-slate-100 py-3 pl-10 pr-4 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500" /></div>
        <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">전체 권한</option><option value="user">회원</option><option value="teacher">선생님</option><option value="driver">기사</option><option value="director">원장</option><option value="admin">최고 관리자</option>
        </select>
      </div>

      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</div>}

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><span className="flex items-center gap-2 text-sm font-black"><Users size={17} className="text-blue-600" />회원 목록</span><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{visibleMembers.length}명</span></div>
        {loading ? <div className="flex justify-center p-16"><Loader2 className="animate-spin text-blue-600" size={28} /></div> : visibleMembers.length === 0 ? <div className="p-16 text-center text-sm font-bold text-slate-400">조회된 회원이 없습니다.</div> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-slate-50 text-xs font-black text-slate-500"><tr><th className="px-5 py-3">회원</th><th className="px-5 py-3">연락처</th><th className="px-5 py-3">지점</th><th className="px-5 py-3">현재 권한</th><th className="px-5 py-3">권한 변경</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleMembers.map((member) => {
            const isSelf = member.id === profile.id;
            const protectedForDirector = profile.role === 'director' && ['admin', 'director'].includes(member.role ?? '');
            const disabled = isSelf || protectedForDirector || savingId === member.id;
            return <tr key={member.id} className="hover:bg-blue-50/30"><td className="px-5 py-4"><b>{member.name ?? '이름 없음'}</b><p className="mt-1 text-xs text-slate-400">{member.email ?? '-'}</p></td><td className="px-5 py-4 font-semibold text-slate-600">{member.phone ?? '-'}</td><td className="px-5 py-4 font-semibold text-slate-600">{branches.find((branch) => branch.id === member.branch_id)?.name ?? member.branch_id ?? '미지정'}</td><td className="px-5 py-4"><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">{ROLE_LABELS[member.role ?? 'user'] ?? member.role}</span></td><td className="px-5 py-4"><div className="flex items-center gap-2"><select value={member.role === 'coach' ? 'teacher' : member.role ?? 'user'} disabled={disabled} onChange={(event) => void updateRole(member, event.target.value)} className="min-w-[150px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400">{allowedRoles.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select>{savingId === member.id && <Loader2 size={15} className="animate-spin text-blue-600" />}{isSelf && <span className="text-[11px] font-bold text-slate-400">본인</span>}</div></td></tr>;
          })}</tbody></table></div>
        )}
      </div>
    </div>
  );
}
