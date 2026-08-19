import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Plus, Pencil, Trash2, Clock, Calendar, Users, BookOpen, Loader2 } from 'lucide-react';

interface Teacher {
  id: string;
  name: string;
  branch_id: string;
}

interface ClassSchedule {
  id: string;
  branch_id: string | null;
  target_class: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  max_people: number | null;
  teacher_id: string | null;
  academy_teachers?: {
    name: string;
  } | null;
}

interface AdminClassTabProps {
  activeBranchId: string | null;
  branches: Array<{ id: string; name: string }>;
}

export const AdminClassTab: React.FC<AdminClassTabProps> = ({ activeBranchId, branches }) => {
  const [classes, setClasses] = useState<ClassSchedule[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [targetClass, setTargetClass] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState('월요일');
  const [startTime, setStartTime] = useState('14:00');
  const [endTime, setEndTime] = useState('15:00');
  const [maxPeople, setMaxPeople] = useState('20');
  const [saveLoading, setSaveLoading] = useState(false);

  const daysList = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];

  // Load teachers and classes
  const loadInitialData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Teachers
      let teachersQuery = supabase.from('academy_teachers').select('id, name, branch_id');
      if (activeBranchId && activeBranchId !== 'all') {
        teachersQuery = teachersQuery.eq('branch_id', activeBranchId);
      }
      const { data: teachersData } = await teachersQuery;
      setTeachers((teachersData || []) as Teacher[]);

      // 2. Fetch Classes
      let classesQuery = supabase.from('class_schedules').select(`
        id, branch_id, target_class, day_of_week, start_time, end_time, max_people, teacher_id,
        academy_teachers(name)
      `);
      if (activeBranchId && activeBranchId !== 'all') {
        classesQuery = classesQuery.eq('branch_id', activeBranchId);
      }
      const { data: classesData, error } = await classesQuery;
      if (!error && classesData) {
        setClasses(classesData as any[]);
      }
    } catch (err) {
      console.error('Error loading class schedules:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, [activeBranchId]);

  // Open Add/Edit Modal
  const openModal = (cls?: ClassSchedule) => {
    if (cls) {
      setEditingId(cls.id);
      setSelectedBranchId(cls.branch_id || activeBranchId || '');
      setTargetClass(cls.target_class);
      setTeacherId(cls.teacher_id || '');
      setDayOfWeek(cls.day_of_week);
      setStartTime(cls.start_time.slice(0, 5));
      setEndTime(cls.end_time.slice(0, 5));
      setMaxPeople(cls.max_people ? String(cls.max_people) : '');
    } else {
      setEditingId(null);
      setSelectedBranchId(activeBranchId && activeBranchId !== 'all' ? activeBranchId : (branches.length > 0 ? branches[0].id : ''));
      setTargetClass('');
      setTeacherId('');
      setDayOfWeek('월요일');
      setStartTime('14:00');
      setEndTime('15:00');
      setMaxPeople('20');
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetClass.trim()) return alert('수업반 이름을 입력해주세요.');
    if (!selectedBranchId) return alert('지점을 선택해주세요.');

    setSaveLoading(true);
    try {
      const payload = {
        branch_id: selectedBranchId,
        target_class: targetClass.trim(),
        teacher_id: teacherId || null,
        day_of_week: dayOfWeek,
        start_time: startTime + ':00',
        end_time: endTime + ':00',
        max_people: maxPeople ? Number(maxPeople) : null,
        is_active: true
      };

      let error;
      if (editingId) {
        const { error: err } = await supabase
          .from('class_schedules')
          .update(payload)
          .eq('id', editingId);
        error = err;
      } else {
        const { error: err } = await supabase
          .from('class_schedules')
          .insert([payload]);
        error = err;
      }

      if (error) throw error;

      setIsModalOpen(false);
      loadInitialData();
    } catch (err: any) {
      alert(`저장에 실패했습니다: ${err.message}`);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`정말 '${name}' 수업반을 삭제하시겠습니까?\n해당 수업의 하위 수강생 배정 정보와 청구 히스토리가 영향받을 수 있습니다.`)) return;

    try {
      const { error } = await supabase
        .from('class_schedules')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadInitialData();
    } catch (err: any) {
      alert(`삭제에 실패했습니다: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            ⏰ 수업반 및 시간표 설정
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            학원에 개설된 반을 관리하고 담당 강사를 매핑합니다. (수강료 단가는 학생 배정 시에 설정합니다.)
          </p>
        </div>
        <button 
          onClick={() => openModal()}
          className="flex items-center justify-center gap-1.5 self-start sm:self-center bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-4 py-2.5 text-xs font-bold shadow-sm"
        >
          <Plus size={16} />
          수업반 등록
        </button>
      </div>

      {/* Class List Table */}
      {loading ? (
        <div className="py-24 text-center text-sm font-bold text-slate-400 flex flex-col items-center justify-center gap-3">
          <Loader2 className="animate-spin text-blue-500" size={24} />
          <span>수업반 정보 불러오는 중...</span>
        </div>
      ) : classes.length > 0 ? (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm text-slate-500">
              <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-700 border-b border-slate-200">
                <tr>
                  <th scope="col" className="px-6 py-4">수업반 이름</th>
                  <th scope="col" className="px-6 py-4">지점</th>
                  <th scope="col" className="px-6 py-4">담당 강사</th>
                  <th scope="col" className="px-6 py-4">수업 일시</th>
                  <th scope="col" className="px-6 py-4">정원</th>
                  <th scope="col" className="px-6 py-4 text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 border-t border-slate-100">
                {classes.map((cls) => {
                  const teacherName = cls.academy_teachers?.name || '강사 미지정';
                  
                  return (
                    <tr key={cls.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 font-extrabold text-slate-900">{cls.target_class}</td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-600">
                        {branches.find(b => b.id === cls.branch_id)?.name || cls.branch_id || '미지정'}
                      </td>
                      <td className="px-6 py-4 text-slate-700">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md font-bold ${
                          cls.teacher_id ? 'bg-slate-100 text-slate-800' : 'bg-rose-50 text-rose-600'
                        }`}>
                          <BookOpen size={12} />
                          {teacherName}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-0.5 text-xs">
                          <span className="font-bold text-slate-700 flex items-center gap-1">
                            <Calendar size={12} className="text-slate-400" />
                            {cls.day_of_week}
                          </span>
                          <span className="text-slate-400 font-semibold flex items-center gap-1">
                            <Clock size={12} className="text-slate-400" />
                            {cls.start_time.slice(0, 5)} ~ {cls.end_time.slice(0, 5)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-700">
                          <Users size={12} className="text-slate-400" />
                          {cls.max_people ? `${cls.max_people}명` : '제한 없음'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => openModal(cls)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg text-xs font-bold"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(cls.id, cls.target_class)}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg text-xs font-bold"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-20 text-slate-400 font-bold text-sm bg-white rounded-2xl border border-dashed border-slate-200">
          개설된 수업반이 없습니다. 첫 번째 수업반을 추가해 보세요!
        </div>
      )}

      {/* Modal dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-xs sm:items-center sm:p-6" onClick={() => setIsModalOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
                  {editingId ? 'CLASS EDIT' : 'CLASS REGISTER'}
                </span>
                <h3 className="mt-2 text-xl font-black text-slate-900">
                  {editingId ? '수업반 정보 수정' : '새 수업반 등록'}
                </h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="rounded-full bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-black text-slate-600">닫기</button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Branch */}
              {activeBranchId === null && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">지점 선택 *</label>
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
                <label className="block text-xs font-bold text-slate-500 mb-1.5">수업반 이름 *</label>
                <input 
                  type="text" 
                  placeholder="예: 초등 기초 회화A반"
                  value={targetClass}
                  onChange={(e) => setTargetClass(e.target.value)}
                  className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {/* Teacher Assign */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">담당 선생님 지정</label>
                <select 
                  value={teacherId}
                  onChange={(e) => setTeacherId(e.target.value)}
                  className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">담당 선생님 선택 안 함</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">수업 요일 *</label>
                  <select 
                    value={dayOfWeek}
                    onChange={(e) => setDayOfWeek(e.target.value)}
                    className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {daysList.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">수강 정원 (선택)</label>
                  <input 
                    type="number" 
                    placeholder="예: 20"
                    value={maxPeople}
                    onChange={(e) => setMaxPeople(e.target.value)}
                    className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">수업 시작 시각 *</label>
                  <input 
                    type="time" 
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">수업 종료 시각 *</label>
                  <input 
                    type="time" 
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={saveLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-black text-white hover:bg-blue-700 disabled:bg-blue-300 shadow-sm mt-6"
              >
                {saveLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                {editingId ? '수업반 수정 완료하기' : '수업반 생성하기'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
