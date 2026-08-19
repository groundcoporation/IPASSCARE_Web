import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Plus, Pencil, Trash2, UserPlus, Phone, Mail, FileText, Loader2 } from 'lucide-react';

interface Teacher {
  id: string;
  branch_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  memo: string | null;
  created_at: string;
}

interface AdminTeacherTabProps {
  activeBranchId: string | null;
  branches: Array<{ id: string; name: string }>;
}

export const AdminTeacherTab: React.FC<AdminTeacherTabProps> = ({ activeBranchId, branches }) => {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [memo, setMemo] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);

  // Load teachers for current branch
  const loadTeachers = async () => {
    setLoading(true);
    try {
      let query = supabase.from('academy_teachers').select('*');
      
      if (activeBranchId) {
        query = query.eq('branch_id', activeBranchId);
      }
      
      const { data, error } = await query.order('name', { ascending: true });
      if (!error && data) {
        setTeachers(data as Teacher[]);
      }
    } catch (err) {
      console.error('Error loading teachers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeachers();
  }, [activeBranchId]);

  // Open modal for registration/edit
  const openModal = (teacher?: Teacher) => {
    if (teacher) {
      setEditingId(teacher.id);
      setName(teacher.name);
      setPhone(teacher.phone || '');
      setEmail(teacher.email || '');
      setMemo(teacher.memo || '');
      setSelectedBranchId(teacher.branch_id);
    } else {
      setEditingId(null);
      setName('');
      setPhone('');
      setEmail('');
      setMemo('');
      setSelectedBranchId(activeBranchId || (branches.length > 0 ? branches[0].id : ''));
    }
    setIsModalOpen(true);
  };

  // Save or Update Teacher
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return alert('선생님 이름을 입력해주세요.');
    if (!selectedBranchId) return alert('지점을 선택해주세요.');

    setSaveLoading(true);
    try {
      const payload = {
        branch_id: selectedBranchId,
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        memo: memo.trim() || null,
      };

      let error;
      if (editingId) {
        const { error: err } = await supabase
          .from('academy_teachers')
          .update(payload)
          .eq('id', editingId);
        error = err;
      } else {
        const { error: err } = await supabase
          .from('academy_teachers')
          .insert([payload]);
        error = err;
      }

      if (error) throw error;

      setIsModalOpen(false);
      loadTeachers();
    } catch (err: any) {
      alert(`저장에 실패했습니다: ${err.message}`);
    } finally {
      setSaveLoading(false);
    }
  };

  // Delete Teacher
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`정말 ${name} 선생님 정보를 삭제하시겠습니까?\n삭제 시 해당 선생님이 매핑된 시간표 정보도 초기화될 수 있습니다.`)) return;
    
    try {
      const { error } = await supabase
        .from('academy_teachers')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      loadTeachers();
    } catch (err: any) {
      alert(`삭제에 실패했습니다: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            👩‍🏫 강사 및 임직원 관리
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            학원 수업 시간표에 매핑할 선생님 및 직원의 연락망 정보를 등록하고 편집합니다.
          </p>
        </div>
        <button 
          onClick={() => openModal()}
          className="flex items-center justify-center gap-1.5 self-start sm:self-center bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-4 py-2.5 text-xs font-bold shadow-sm"
        >
          <Plus size={16} />
          선생님 등록
        </button>
      </div>

      {/* Teachers Grid */}
      {loading ? (
        <div className="py-24 text-center text-sm font-bold text-slate-400 flex flex-col items-center justify-center gap-3">
          <Loader2 className="animate-spin text-blue-500" size={24} />
          <span>선생님 리스트 불러오는 중...</span>
        </div>
      ) : teachers.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teachers.map((teacher) => (
            <div key={teacher.id} className="bg-white p-5 rounded-2xl border border-slate-100 hover:border-slate-200 shadow-xs flex flex-col justify-between gap-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 font-extrabold flex items-center justify-center text-sm">
                      {teacher.name[0]}
                    </div>
                    <div>
                      <b className="text-slate-900 text-base font-black">{teacher.name}</b>
                      {activeBranchId === null && (
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded ml-2 font-bold">
                          {branches.find(b => b.id === teacher.branch_id)?.name || '알수없음'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <Phone size={13} className="text-slate-400 shrink-0" />
                    <span>{teacher.phone || '-'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail size={13} className="text-slate-400 shrink-0" />
                    <span className="truncate">{teacher.email || '-'}</span>
                  </div>
                  {teacher.memo && (
                    <div className="flex items-start gap-2 bg-slate-50 p-2 rounded-lg mt-1 border border-slate-100">
                      <FileText size={13} className="text-slate-400 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-slate-500 leading-relaxed font-medium break-all">{teacher.memo}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-1.5 border-t border-slate-50 pt-3">
                <button
                  onClick={() => openModal(teacher)}
                  className="flex items-center justify-center p-2 text-blue-600 hover:bg-blue-50 rounded-lg text-xs font-bold"
                  title="선생님 수정"
                >
                  <Pencil size={14} className="mr-1" />
                  수정
                </button>
                <button
                  onClick={() => handleDelete(teacher.id, teacher.name)}
                  className="flex items-center justify-center p-2 text-rose-500 hover:bg-rose-50 rounded-lg text-xs font-bold"
                  title="선생님 삭제"
                >
                  <Trash2 size={14} className="mr-1" />
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 text-slate-400 font-bold text-sm bg-white rounded-2xl border border-dashed border-slate-200">
          소속 강사가 없습니다. 첫 선생님을 추가해보세요!
        </div>
      )}

      {/* Modal Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-xs sm:items-center sm:p-6" onClick={() => setIsModalOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
                  {editingId ? 'TEACHER EDIT' : 'TEACHER REGISTER'}
                </span>
                <h3 className="mt-2 text-xl font-black text-slate-900">
                  {editingId ? `${name} 선생님 정보 수정` : '새 선생님 등록'}
                </h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="rounded-full bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-black text-slate-600">닫기</button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Branch Selection (Only shown when activeBranchId is null / super admin) */}
              {activeBranchId === null && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">지점 소속 선택 *</label>
                  <select 
                    value={selectedBranchId}
                    onChange={(e) => setSelectedBranchId(e.target.value)}
                    className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">지점을 선택해주세요</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">선생님 이름 *</label>
                <input 
                  type="text" 
                  placeholder="예: 김선생"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">연락처 (선택)</label>
                <input 
                  type="text" 
                  placeholder="예: 010-1234-5678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">이메일 (선택)</label>
                <input 
                  type="email" 
                  placeholder="예: teacher@school.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">메모/담당과목 (선택)</label>
                <textarea 
                  placeholder="담당 학급 또는 과목 등의 메모"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <button 
                type="submit" 
                disabled={saveLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-black text-white hover:bg-blue-700 disabled:bg-blue-300 shadow-sm mt-6"
              >
                {saveLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                {editingId ? '수정 완료하기' : '선생님 등록하기'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
