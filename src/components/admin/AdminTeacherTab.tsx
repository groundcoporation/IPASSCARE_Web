import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { 
  Plus, Pencil, Trash2, Phone, Mail, FileText, Loader2, 
  ShieldCheck, GraduationCap, Bus, Crown, RefreshCw, Search, CheckCircle2, UserCheck
} from 'lucide-react';

interface StaffMember {
  id: string;
  branch_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  role: 'director' | 'teacher' | 'coach' | 'driver' | 'admin' | string;
  memo: string | null;
  source: 'user' | 'custom';
  created_at: string;
}

interface AdminTeacherTabProps {
  activeBranchId: string | null;
  branches: Array<{ id: string; name: string }>;
  profile?: any;
}

export const AdminTeacherTab: React.FC<AdminTeacherTabProps> = ({ activeBranchId, branches, profile }) => {
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  const canManageStaff = profile?.role === 'admin' || profile?.role === 'director';

  // Form State for direct registration
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'teacher' | 'driver' | 'director'>('teacher');
  const [memo, setMemo] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);

  // Load all staff from users table (with roles) + academy_teachers
  const loadStaff = useCallback(async () => {
    setLoading(true);
    try {
      const mergedList: StaffMember[] = [];
      const seenIds = new Set<string>();

      // 1. Fetch staff members with role in ('director', 'teacher', 'coach', 'driver') from users
      let usersQuery = supabase
        .from('users')
        .select('id, name, phone, email, role, branch_id, created_at')
        .in('role', ['director', 'teacher', 'coach', 'driver']);

      if (activeBranchId) {
        usersQuery = usersQuery.eq('branch_id', activeBranchId);
      }

      const { data: userData, error: userError } = await usersQuery;
      if (!userError && userData) {
        userData.forEach((u: any) => {
          seenIds.add(u.id);
          mergedList.push({
            id: u.id,
            branch_id: u.branch_id,
            name: u.name || '이름 없음',
            phone: u.phone || null,
            email: u.email || null,
            role: u.role,
            memo: null,
            source: 'user',
            created_at: u.created_at || new Date().toISOString()
          });
        });
      }

      // 2. Fetch from academy_teachers (manual roster)
      let teachersQuery = supabase.from('academy_teachers').select('*');
      if (activeBranchId) {
        teachersQuery = teachersQuery.eq('branch_id', activeBranchId);
      }
      const { data: teacherData } = await teachersQuery;
      if (teacherData) {
        teacherData.forEach((t: any) => {
          // Avoid duplicate if matching by phone or name
          const exists = mergedList.some(m => (t.phone && m.phone === t.phone) || (m.name === t.name && m.branch_id === t.branch_id));
          if (!exists) {
            mergedList.push({
              id: t.id,
              branch_id: t.branch_id,
              name: t.name,
              phone: t.phone,
              email: t.email,
              role: 'teacher',
              memo: t.memo,
              source: 'custom',
              created_at: t.created_at || new Date().toISOString()
            });
          }
        });
      }

      setStaffList(mergedList);
    } catch (err) {
      console.error('Error loading staff list:', err);
    } finally {
      setLoading(false);
    }
  }, [activeBranchId]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  // Filtered List
  const filteredStaff = useMemo(() => {
    return staffList.filter(staff => {
      const q = search.trim().toLowerCase();
      const matchesSearch = !q ||
        staff.name.toLowerCase().includes(q) ||
        (staff.phone && staff.phone.includes(q)) ||
        (staff.email && staff.email.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (roleFilter !== 'all') {
        if (roleFilter === 'teacher') {
          return staff.role === 'teacher' || staff.role === 'coach';
        }
        return staff.role === roleFilter;
      }

      return true;
    });
  }, [staffList, search, roleFilter]);

  // Role Counts
  const directorCount = staffList.filter(s => s.role === 'director').length;
  const teacherCount = staffList.filter(s => s.role === 'teacher' || s.role === 'coach').length;
  const driverCount = staffList.filter(s => s.role === 'driver').length;

  // Open modal
  const openModal = (staff?: StaffMember) => {
    if (staff) {
      setEditingId(staff.id);
      setName(staff.name);
      setPhone(staff.phone || '');
      setEmail(staff.email || '');
      setRole((['director', 'teacher', 'driver'].includes(staff.role) ? staff.role : 'teacher') as any);
      setMemo(staff.memo || '');
      setSelectedBranchId(staff.branch_id || activeBranchId || (branches[0]?.id || ''));
    } else {
      setEditingId(null);
      setName('');
      setPhone('');
      setEmail('');
      setRole('teacher');
      setMemo('');
      setSelectedBranchId(activeBranchId || (branches.length > 0 ? branches[0].id : ''));
    }
    setIsModalOpen(true);
  };

  // Save Staff
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return alert('임직원 성함을 입력해주세요.');
    if (!selectedBranchId) return alert('지점을 선택해주세요.');

    setSaveLoading(true);
    try {
      // If editing existing user role
      if (editingId) {
        const staff = staffList.find(s => s.id === editingId);
        if (staff?.source === 'user') {
          // Update role via RPC or direct update
          await supabase.rpc('update_member_role', {
            p_user_id: editingId,
            p_role: role
          });
        } else {
          await supabase.from('academy_teachers').update({
            name: name.trim(),
            phone: phone.trim() || null,
            email: email.trim() || null,
            memo: memo.trim() || null,
            branch_id: selectedBranchId
          }).eq('id', editingId);
        }
      } else {
        // Insert into academy_teachers
        await supabase.from('academy_teachers').insert([{
          name: name.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          memo: memo.trim() || null,
          branch_id: selectedBranchId
        }]);
      }

      setIsModalOpen(false);
      loadStaff();
      alert('임직원 정보가 저장되었습니다.');
    } catch (err: any) {
      alert(`저장에 실패했습니다: ${err.message}`);
    } finally {
      setSaveLoading(false);
    }
  };

  // Revoke / Delete Staff
  const handleDelete = async (staff: StaffMember) => {
    const roleLabel = getRoleLabel(staff.role);
    if (!confirm(`정말 ${staff.name} 님의 '${roleLabel}' 권한을 회수하시겠습니까?\n회수 시 일반 회원으로 안전하게 전환되며 관리자 접근이 차단됩니다.`)) return;

    try {
      if (staff.source === 'user') {
        // Demote role to 'user'
        const { error } = await supabase.rpc('update_member_role', {
          p_user_id: staff.id,
          p_role: 'user'
        });
        if (error) {
          // Fallback direct update
          await supabase.from('users').update({ role: 'user' }).eq('id', staff.id);
        }
      } else {
        await supabase.from('academy_teachers').delete().eq('id', staff.id);
      }

      loadStaff();
      alert(`${staff.name} 님의 권한이 안전하게 회수되었습니다.`);
    } catch (err: any) {
      alert(`권한 회수 실패: ${err.message}`);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'director':
        return (
          <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-1 rounded-xl text-xs font-black">
            <Crown size={12} className="text-purple-600" />
            원장
          </span>
        );
      case 'teacher':
      case 'coach':
        return (
          <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-xl text-xs font-black">
            <GraduationCap size={12} className="text-blue-600" />
            선생님/코치
          </span>
        );
      case 'driver':
        return (
          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-xl text-xs font-black">
            <Bus size={12} className="text-amber-600" />
            셔틀 기사님
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-1 rounded-xl text-xs font-black">
            임직원
          </span>
        );
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'director': return '원장';
      case 'teacher':
      case 'coach': return '선생님/코치';
      case 'driver': return '셔틀 기사님';
      default: return '임직원';
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <UserCheck className="text-blue-600" size={20} />
            강사 및 임직원 관리
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            원장님, 선생님(코치), 셔틀 기사님의 계정 권한 및 소속 명부를 실시간으로 통합 관제합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {canManageStaff ? (
            <button 
              onClick={() => openModal()}
              className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-4 py-2.5 text-xs font-black shadow-xs transition"
            >
              <Plus size={15} />
              임직원 등록
            </button>
          ) : (
            <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
              👁️ 조회 전용 모드
            </span>
          )}

          <button
            onClick={loadStaff}
            className="p-2.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition shadow-2xs"
            title="새로고침"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Role Filter Tabs & Search Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
        
        {/* Quick Role Filters */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'all', label: `전체 (${staffList.length})` },
            { id: 'director', label: `👑 원장 (${directorCount})` },
            { id: 'teacher', label: `👨‍🏫 선생님/코치 (${teacherCount})` },
            { id: 'driver', label: `🚌 기사님 (${driverCount})` },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setRoleFilter(tab.id)}
              className={`px-3 py-2 rounded-xl text-xs font-extrabold transition ${
                roleFilter === tab.id
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="이름, 연락처, 이메일 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-100 rounded-xl py-2 pl-10 pr-4 text-xs font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Staff Grid */}
      {loading ? (
        <div className="py-24 text-center text-sm font-bold text-slate-400 flex flex-col items-center justify-center gap-3">
          <Loader2 className="animate-spin text-blue-500" size={24} />
          <span>임직원 및 강사 명부 불러오는 중...</span>
        </div>
      ) : filteredStaff.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStaff.map((staff) => (
            <div key={staff.id} className="bg-white p-5 rounded-3xl border border-slate-200 hover:border-blue-300 shadow-xs flex flex-col justify-between gap-4 transition">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm ${
                      staff.role === 'director' ? 'bg-purple-100 text-purple-700' :
                      staff.role === 'driver' ? 'bg-amber-100 text-amber-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {staff.name[0]}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <b className="text-slate-900 text-base font-black">{staff.name}</b>
                        {staff.source === 'user' && (
                          <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded font-black">
                            계정연동됨
                          </span>
                        )}
                      </div>
                      {activeBranchId === null && (
                        <span className="text-[10px] text-slate-400 font-bold block mt-0.5">
                          {branches.find(b => b.id === staff.branch_id)?.name || '본사/전체'}
                        </span>
                      )}
                    </div>
                  </div>

                  {getRoleBadge(staff.role)}
                </div>

                <div className="space-y-2 text-xs text-slate-600 pt-1 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <Phone size={13} className="text-slate-400 shrink-0" />
                    <span className="font-mono font-bold text-slate-800">{staff.phone || '연락처 없음'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail size={13} className="text-slate-400 shrink-0" />
                    <span className="truncate text-slate-500">{staff.email || '이메일 없음'}</span>
                  </div>
                  {staff.memo && (
                    <div className="flex items-start gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      <FileText size={13} className="text-slate-400 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-slate-500 leading-relaxed font-medium">{staff.memo}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons (Only for Director & Super Admin) */}
              {canManageStaff && (
                <div className="flex justify-end gap-1.5 border-t border-slate-100 pt-3">
                  <button
                    onClick={() => openModal(staff)}
                    className="flex items-center justify-center px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-xl text-xs font-bold transition"
                  >
                    <Pencil size={13} className="mr-1" />
                    수정
                  </button>
                  <button
                    onClick={() => handleDelete(staff)}
                    className="flex items-center justify-center px-3 py-1.5 text-rose-500 hover:bg-rose-50 rounded-xl text-xs font-bold transition"
                  >
                    <Trash2 size={13} className="mr-1" />
                    권한 회수
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 text-slate-400 font-bold text-xs bg-white rounded-3xl border border-dashed border-slate-200 space-y-1">
          <UserCheck size={32} className="mx-auto text-slate-300 mb-2" />
          <p>해당 조건의 강사 및 임직원이 없습니다.</p>
          <p className="text-[11px] text-slate-400">상단의 [회원 권한 부여] 탭에서 회원에게 권한을 지정하거나 직접 등록해보세요!</p>
        </div>
      )}

      {/* Write/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <h3 className="text-base font-black text-slate-900">
              {editingId ? '임직원 정보 수정' : '신규 임직원 등록'}
            </h3>

            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">성함</label>
                <input
                  type="text"
                  placeholder="예: 김선생 / 박기사"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-100 rounded-xl px-3.5 py-2.5 text-xs font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">직책 (권한)</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full bg-slate-100 rounded-xl px-3.5 py-2.5 text-xs font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="teacher">👨‍🏫 선생님 / 코치</option>
                  <option value="driver">🚌 셔틀 기사님</option>
                  {profile?.role === 'admin' && (
                    <option value="director">👑 학원장 (지점 관리자)</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">연락처</label>
                <input
                  type="tel"
                  placeholder="010-0000-0000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-100 rounded-xl px-3.5 py-2.5 text-xs font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">이메일</label>
                <input
                  type="email"
                  placeholder="example@academy.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-100 rounded-xl px-3.5 py-2.5 text-xs font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">메모 (선택사항)</label>
                <textarea
                  rows={2}
                  placeholder="담당 과목, 셔틀 코스, 특이사항 등..."
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  className="w-full bg-slate-100 rounded-xl p-3 text-xs font-medium border-none outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={saveLoading}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-xs font-black shadow-sm disabled:opacity-50"
                >
                  {saveLoading ? '저장 중...' : '저장 완료'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
