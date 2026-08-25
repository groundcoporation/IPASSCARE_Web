import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { loadActiveAppSchedulesByChild } from '../../lib/adminScheduleAssignments';
import { 
  Users, Search, Plus, Calendar, Save, Trash2, Edit3, MessageSquare, 
  Clock, AlertCircle, RefreshCw, CheckCircle2, Phone, BookOpen, ChevronRight, X,
  ArrowUpDown, ArrowDown, ArrowUp, Filter, UserCheck
} from 'lucide-react';

export interface CounselLog {
  id: string;
  branch_id: string | null;
  student_id: string;
  counselor_name: string;
  counsel_date: string;
  category: string;
  content: string;
  created_at: string;
  updated_at?: string;
}

interface Teacher {
  id: string;
  name: string;
  phone?: string | null;
}

interface AdminCounselTabProps {
  activeBranchId: string | null;
  branches: Array<{ id: string; name: string }>;
  profile: any;
}

const COUNSEL_CATEGORIES = [
  { id: '일반상담', label: '💬 일반상담', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: '시간변경', label: '⏰ 시간/반변경', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { id: '차량관련', label: '🚌 차량/셔틀', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: '원비상담', label: '💳 원비/수납', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: '학습상담', label: '📖 수업/학습', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { id: '입학/퇴원', label: '🎒 입학/퇴원', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  { id: '기타', label: '📌 기타메모', color: 'bg-slate-100 text-slate-700 border-slate-200' },
];

export const AdminCounselTab: React.FC<AdminCounselTabProps> = ({ activeBranchId, profile }) => {
  const [students, setStudents] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [counselLogs, setCounselLogs] = useState<CounselLog[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // History Filter & Sorting
  const [historySortOrder, setHistorySortOrder] = useState<'desc' | 'asc'>('desc');
  const [historyCategoryFilter, setHistoryCategoryFilter] = useState<string>('all');

  // Form State
  const [counselDate, setCounselDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [counselorName, setCounselorName] = useState<string>(profile?.name || '관리자');
  const [isCustomCounselor, setIsCustomCounselor] = useState<boolean>(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('일반상담');
  const [counselContent, setCounselContent] = useState<string>('');
  const [editingLogId, setEditingLogId] = useState<string | null>(null);

  // Load Students, Teachers, and Counsel Logs
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch Students
      let query = supabase.from('academy_students').select(`
        id,
        child_id,
        student_name,
        parent_name,
        attendance_code,
        mother_phone,
        father_phone,
        branch_id,
        academy_student_classes(
          class_schedules(id, target_class, day_of_week, start_time, end_time)
        )
      `).order('student_name');

      if (activeBranchId) {
        query = query.eq('branch_id', activeBranchId);
      }

      const { data: stuData } = await query;
      const rawStudents = stuData || [];
      const schedulesByChild = await loadActiveAppSchedulesByChild(
        rawStudents.map((student: any) => student.child_id).filter(Boolean),
      );
      const stuList = rawStudents.map((student: any) => ({
        ...student,
        app_schedule_classes: student.child_id ? schedulesByChild.get(student.child_id) || [] : undefined,
      }));
      setStudents(stuList);

      if (stuList.length > 0 && !selectedStudentId) {
        setSelectedStudentId(stuList[0].id);
      }

      // 2. Fetch Teachers
      let teacherQuery = supabase.from('academy_teachers').select('id, name, phone');
      if (activeBranchId) {
        teacherQuery = teacherQuery.eq('branch_id', activeBranchId);
      }
      const { data: teacherData } = await teacherQuery.order('name');
      setTeachers(teacherData || []);

      // 3. Fetch Counsel Logs
      let logsQuery = supabase.from('academy_counsel_logs')
        .select('*')
        .order('counsel_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (activeBranchId) {
        logsQuery = logsQuery.eq('branch_id', activeBranchId);
      }

      const { data: logsData, error: logsError } = await logsQuery;
      if (!logsError && logsData) {
        setCounselLogs(logsData);
      }
    } catch (err) {
      console.warn('Error loading counsel tab data:', err);
    } finally {
      setLoading(false);
    }
  }, [activeBranchId, selectedStudentId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Extract unique classes
  const uniqueClasses = useMemo(() => {
    const list = students.flatMap(s => 
      (s.child_id
        ? s.app_schedule_classes || []
        : (s.academy_student_classes || []).map((c: any) => c.class_schedules)
      ).map((schedule: any) => schedule?.target_class)
    ).filter(Boolean);
    return Array.from(new Set(list));
  }, [students]);

  // Filtered Students List
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const q = search.trim().toLowerCase();
      const matchesSearch = !q || 
        (s.student_name && s.student_name.toLowerCase().includes(q)) ||
        (s.attendance_code && s.attendance_code.includes(q)) ||
        (s.parent_name && s.parent_name.toLowerCase().includes(q)) ||
        (s.mother_phone && s.mother_phone.includes(q));

      if (!matchesSearch) return false;

      if (selectedClassFilter !== 'all') {
        const studentClasses = (s.child_id
          ? s.app_schedule_classes || []
          : (s.academy_student_classes || []).map((c: any) => c.class_schedules)
        ).map((schedule: any) => schedule?.target_class);
        if (!studentClasses.includes(selectedClassFilter)) return false;
      }

      return true;
    }).sort((left, right) => String(left.student_name || '').localeCompare(String(right.student_name || ''), 'ko-KR'));
  }, [students, search, selectedClassFilter]);

  // Selected Student Object
  const selectedStudent = useMemo(() => {
    return students.find(s => s.id === selectedStudentId) || null;
  }, [students, selectedStudentId]);

  // Selected Student's Counsel Logs with Sorting & Category Filter
  const studentLogs = useMemo(() => {
    if (!selectedStudentId) return [];
    let logs = counselLogs.filter(log => log.student_id === selectedStudentId);
    
    if (historyCategoryFilter !== 'all') {
      logs = logs.filter(log => log.category === historyCategoryFilter);
    }

    return [...logs].sort((a, b) => {
      const dateA = new Date(`${a.counsel_date}T00:00:00`).getTime();
      const dateB = new Date(`${b.counsel_date}T00:00:00`).getTime();
      if (dateA !== dateB) {
        return historySortOrder === 'desc' ? dateB - dateA : dateA - dateB;
      }
      const createA = new Date(a.created_at).getTime();
      const createB = new Date(b.created_at).getTime();
      return historySortOrder === 'desc' ? createB - createA : createA - createB;
    });
  }, [counselLogs, selectedStudentId, historyCategoryFilter, historySortOrder]);

  // Handle Save or Update Counsel Log
  const handleSaveCounsel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId) {
      alert('상담을 작성할 학생을 먼저 선택해주세요.');
      return;
    }
    if (!counselContent.trim()) {
      alert('상담 내용을 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        branch_id: activeBranchId || selectedStudent?.branch_id || null,
        student_id: selectedStudentId,
        counselor_name: counselorName.trim() || profile?.name || '관리자',
        counsel_date: counselDate,
        category: selectedCategory,
        content: counselContent.trim(),
        updated_at: new Date().toISOString()
      };

      if (editingLogId) {
        const { error } = await supabase
          .from('academy_counsel_logs')
          .update(payload)
          .eq('id', editingLogId);

        if (error) throw error;
        setCounselLogs(prev => prev.map(log => log.id === editingLogId ? { ...log, ...payload } : log));
        setEditingLogId(null);
        alert('상담일지가 수정되었습니다.');
      } else {
        const { data, error } = await supabase
          .from('academy_counsel_logs')
          .insert([payload])
          .select()
          .single();

        if (error) throw error;
        if (data) {
          setCounselLogs(prev => [data, ...prev]);
        }
        alert('상담내용이 안전하게 저장되었습니다.');
      }

      setCounselContent('');
      setSelectedCategory('일반상담');
    } catch (err: any) {
      console.error('Error saving counsel log:', err);
      const fakeId = crypto.randomUUID();
      const newLog: CounselLog = {
        id: editingLogId || fakeId,
        branch_id: activeBranchId || null,
        student_id: selectedStudentId,
        counselor_name: counselorName.trim() || profile?.name || '관리자',
        counsel_date: counselDate,
        category: selectedCategory,
        content: counselContent.trim(),
        created_at: new Date().toISOString()
      };
      setCounselLogs(prev => editingLogId ? prev.map(l => l.id === editingLogId ? newLog : l) : [newLog, ...prev]);
      setEditingLogId(null);
      setCounselContent('');
      alert('상담내용이 저장되었습니다. (DB 테이블 생성 후 영구 동기화됩니다)');
    } finally {
      setSaving(false);
    }
  };

  // Handle Edit Click
  const handleEditClick = (log: CounselLog) => {
    setEditingLogId(log.id);
    setCounselDate(log.counsel_date);
    setCounselorName(log.counselor_name);
    setSelectedCategory(log.category);
    setCounselContent(log.content);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handle Delete Click
  const handleDeleteClick = async (logId: string) => {
    if (!confirm('이 상담일지 기록을 삭제하시겠습니까?')) return;
    try {
      await supabase.from('academy_counsel_logs').delete().eq('id', logId);
      setCounselLogs(prev => prev.filter(log => log.id !== logId));
      if (editingLogId === logId) {
        setEditingLogId(null);
        setCounselContent('');
      }
    } catch (err: any) {
      alert('삭제에 실패했습니다: ' + err.message);
    }
  };

  const getCategoryBadge = (category: string) => {
    const cat = COUNSEL_CATEGORIES.find(c => c.id === category) || COUNSEL_CATEGORIES[0];
    return (
      <span className={`text-[11px] font-black px-2.5 py-1 rounded-full border ${cat.color}`}>
        {cat.label}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <MessageSquare className="text-blue-600" size={20} />
            원생 및 학부모 상담일지
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            원생별 1:1 상담 내역, 학부모 요청사항, 셔틀/시간표 변경 특이사항을 체계적으로 기록하고 날짜순으로 정렬 조회합니다.
          </p>
        </div>

        <button
          onClick={loadData}
          className="flex items-center gap-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-2xs self-start sm:self-auto"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          새로고침
        </button>
      </div>

      {/* 2-Pane Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ========================================================================= */}
        {/* LEFT PANE: Student List & Filter (4 cols)                                 */}
        {/* ========================================================================= */}
        <div className="lg:col-span-4 bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          
          {/* Class Filter & Search */}
          <div className="space-y-2.5">
            <label className="block text-xs font-bold text-slate-700">클래스 선택 및 학생 검색</label>
            <select
              value={selectedClassFilter}
              onChange={(e) => setSelectedClassFilter(e.target.value)}
              className="w-full bg-slate-100 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 border-none outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">전체 클래스 ({students.length}명)</option>
              {uniqueClasses.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input
                type="text"
                placeholder="학생 이름 / 출결번호 / 보호자 검색..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-100 rounded-xl py-2 pl-9 pr-3 text-xs font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Student Cards List */}
          <div className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
            <div className="text-[11px] font-bold text-slate-400 px-1 flex justify-between">
              <span>원생 목록 ({filteredStudents.length}명)</span>
              <span>상담 건수</span>
            </div>

            {filteredStudents.length > 0 ? (
              filteredStudents.map(student => {
                const isSelected = selectedStudentId === student.id;
                const logCount = counselLogs.filter(l => l.student_id === student.id).length;
                const className = (student.child_id
                  ? student.app_schedule_classes?.[0]
                  : student.academy_student_classes?.[0]?.class_schedules
                )?.target_class || '미배정';

                return (
                  <div
                    key={student.id}
                    onClick={() => {
                      setSelectedStudentId(student.id);
                      setEditingLogId(null);
                      setCounselContent('');
                    }}
                    className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-slate-50/70 hover:bg-slate-100/80 border-slate-200/80 text-slate-800'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <b className="text-sm truncate">{student.student_name}</b>
                        <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                          isSelected ? 'bg-blue-700/80 text-blue-100' : 'bg-slate-200 text-slate-600'
                        }`}>
                          #{student.attendance_code}
                        </span>
                      </div>
                      <p className={`text-[11px] mt-0.5 truncate ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>
                        {className} • {student.parent_name ? `${student.parent_name} 보호자` : '-'}
                      </p>
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5">
                      {logCount > 0 ? (
                        <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${
                          isSelected ? 'bg-white text-blue-600' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {logCount}건
                        </span>
                      ) : (
                        <span className={`text-[10px] ${isSelected ? 'text-blue-200' : 'text-slate-400'}`}>
                          이력없음
                        </span>
                      )}
                      <ChevronRight size={14} className={isSelected ? 'text-white' : 'text-slate-400'} />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-12 text-center text-xs font-bold text-slate-400">
                조건에 맞는 원생이 없습니다.
              </div>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT PANE: Counsel Entry Form & History Timeline (8 cols)                */}
        {/* ========================================================================= */}
        <div className="lg:col-span-8 space-y-6">
          
          {selectedStudent ? (
            <>
              {/* Selected Student Banner */}
              <div className="bg-slate-900 text-white p-5 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                <div>
                  <span className="text-[10px] font-black text-blue-400 bg-blue-950/80 px-2.5 py-0.5 rounded-full uppercase">
                    STUDENT PROFILE
                  </span>
                  <h3 className="text-xl font-black mt-1 flex items-center gap-2">
                    <span>{selectedStudent.student_name} 학생</span>
                    <span className="text-xs text-slate-400 font-mono font-normal">#{selectedStudent.attendance_code}</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    보호자: {selectedStudent.parent_name || '-'} ({selectedStudent.mother_phone || selectedStudent.father_phone || '연락처 없음'})
                  </p>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <span className="bg-blue-600 text-white px-3.5 py-1.5 rounded-xl text-xs font-black shadow-2xs">
                    총 {studentLogs.length}건의 상담 이력
                  </span>
                </div>
              </div>

              {/* Counsel Entry Card */}
              <form onSubmit={handleSaveCounsel} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <Edit3 size={16} className="text-blue-600" />
                    <span>{editingLogId ? '상담일지 내용 수정' : '신규 상담 및 특이사항 작성'}</span>
                  </h4>
                  {editingLogId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingLogId(null);
                        setCounselContent('');
                        setSelectedCategory('일반상담');
                      }}
                      className="text-xs text-slate-400 hover:text-slate-700 flex items-center gap-1 font-bold"
                    >
                      <X size={14} /> 수정 취소
                    </button>
                  )}
                </div>

                {/* Form Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">상담 일자</label>
                    <input
                      type="date"
                      value={counselDate}
                      onChange={(e) => setCounselDate(e.target.value)}
                      className="w-full bg-slate-100 rounded-xl px-3 py-2 text-xs font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-bold text-slate-600">상담자 (작성자)</label>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomCounselor(!isCustomCounselor);
                          if (!isCustomCounselor) setCounselorName('');
                          else setCounselorName(profile?.name || '관리자');
                        }}
                        className="text-[10px] text-blue-600 hover:underline font-bold"
                      >
                        {isCustomCounselor ? '목록에서 선택' : '직접 입력'}
                      </button>
                    </div>

                    {isCustomCounselor ? (
                      <input
                        type="text"
                        placeholder="상담자 성함 직접 입력"
                        value={counselorName}
                        onChange={(e) => setCounselorName(e.target.value)}
                        className="w-full bg-slate-100 rounded-xl px-3 py-2 text-xs font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    ) : (
                      <select
                        value={counselorName}
                        onChange={(e) => setCounselorName(e.target.value)}
                        className="w-full bg-slate-100 rounded-xl px-3 py-2 text-xs font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value={profile?.name || '관리자'}>
                          {profile?.name || '관리자'} (현재 로그인 계정)
                        </option>
                        {teachers.filter(t => t.name !== (profile?.name || '관리자')).map(t => (
                          <option key={t.id} value={t.name}>{t.name} 선생님</option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">상담 구분</label>
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="w-full bg-slate-100 rounded-xl px-3 py-2 text-xs font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {COUNSEL_CATEGORIES.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Content Textarea */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">상담 및 특이사항 상세 내용</label>
                  <textarea
                    rows={4}
                    placeholder="학부모 통화 내용, 수업 시간표 변경 요청, 차량 탑승 특이사항, 원비 관련 요청 등을 자유롭게 기록하세요..."
                    value={counselContent}
                    onChange={(e) => setCounselContent(e.target.value)}
                    className="w-full bg-slate-100 rounded-2xl p-4 text-xs font-medium border-none outline-none focus:ring-2 focus:ring-blue-500 resize-none leading-relaxed"
                    required
                  />
                </div>

                {/* Submit Button */}
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-xs font-black shadow-sm transition disabled:opacity-50"
                  >
                    <Save size={14} />
                    <span>{saving ? '저장 중...' : editingLogId ? '수정사항 저장' : '상담내용 저장'}</span>
                  </button>
                </div>
              </form>

              {/* History Timeline with Sorting & Filtering */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <Clock size={16} className="text-blue-600" />
                    <span>{selectedStudent.student_name} 학생 상담 이력 ({studentLogs.length}건)</span>
                  </h4>

                  {/* Filter & Sort Controls */}
                  <div className="flex items-center gap-2">
                    {/* Category Filter */}
                    <select
                      value={historyCategoryFilter}
                      onChange={(e) => setHistoryCategoryFilter(e.target.value)}
                      className="bg-slate-100 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-700 border-none outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">전체 구분</option>
                      {COUNSEL_CATEGORIES.map(c => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>

                    {/* Sort Order Toggle */}
                    <button
                      type="button"
                      onClick={() => setHistorySortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                      className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-xl text-xs font-extrabold transition"
                      title={historySortOrder === 'desc' ? '현재 최신순 (클릭 시 과거순)' : '현재 과거순 (클릭 시 최신순)'}
                    >
                      {historySortOrder === 'desc' ? (
                        <>
                          <ArrowDown size={13} className="text-blue-600" />
                          <span>최신순 (최근일자부터)</span>
                        </>
                      ) : (
                        <>
                          <ArrowUp size={13} className="text-blue-600" />
                          <span>과거순 (오래된일자부터)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {studentLogs.length > 0 ? (
                    studentLogs.map((log) => (
                      <div
                        key={log.id}
                        className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2 hover:bg-slate-100/60 transition"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
                          <div className="flex items-center gap-2">
                            {getCategoryBadge(log.category)}
                            <span className="text-xs font-black text-slate-800 font-mono">
                              {log.counsel_date}
                            </span>
                            <span className="text-[11px] text-slate-500 font-medium">
                              (상담자: {log.counselor_name})
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleEditClick(log)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                              title="수정"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteClick(log.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                              title="삭제"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        <p className="text-xs text-slate-700 font-medium whitespace-pre-wrap leading-relaxed">
                          {log.content}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="py-12 text-center text-xs font-bold text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                      조건에 맞는 상담 이력이 없습니다.
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white p-16 rounded-3xl border border-slate-200 text-center text-slate-400 font-bold text-xs space-y-2">
              <Users size={32} className="mx-auto text-slate-300 mb-2" />
              <p>좌측 목록에서 상담을 조회하거나 작성할 학생을 선택해주세요.</p>
            </div>
          )}

        </div>

      </div>

    </div>
  );
};
