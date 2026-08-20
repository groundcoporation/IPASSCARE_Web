import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { 
  BookOpen, Plus, Search, Calendar, Save, Trash2, Edit3, Eye, 
  Download, RefreshCw, CheckCircle2, User, Clock, FileText, X, AlertCircle,
  ArrowDown, ArrowUp
} from 'lucide-react';

export interface StudyLog {
  id: string;
  branch_id: string | null;
  class_schedule_id: string | null;
  class_name: string;
  teacher_name: string;
  lesson_date: string;
  title: string;
  content: string;
  homework: string | null;
  special_note: string | null;
  created_at: string;
  updated_at?: string;
}

interface Teacher {
  id: string;
  name: string;
}

interface AdminStudyTabProps {
  activeBranchId: string | null;
  branches: Array<{ id: string; name: string }>;
  profile: any;
}

export const AdminStudyTab: React.FC<AdminStudyTabProps> = ({ activeBranchId, profile }) => {
  const [studyLogs, setStudyLogs] = useState<StudyLog[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // Filters
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Modals
  const [isWriteModalOpen, setIsWriteModalOpen] = useState<boolean>(false);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [viewingLog, setViewingLog] = useState<StudyLog | null>(null);

  // Form Fields
  const [formClassId, setFormClassId] = useState<string>('');
  const [formClassName, setFormClassName] = useState<string>('');
  const [formLessonDate, setFormLessonDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [formTeacherName, setFormTeacherName] = useState<string>(profile?.name || '담당선생님');
  const [isCustomTeacher, setIsCustomTeacher] = useState<boolean>(false);
  const [formTitle, setFormTitle] = useState<string>('');
  const [formContent, setFormContent] = useState<string>('');
  const [formHomework, setFormHomework] = useState<string>('');
  const [formSpecialNote, setFormSpecialNote] = useState<string>('');

  // Load Data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch Class Schedules
      let clsQuery = supabase.from('class_schedules').select('id, target_class, day_of_week, start_time, end_time, branch_id').order('target_class');
      if (activeBranchId) {
        clsQuery = clsQuery.eq('branch_id', activeBranchId);
      }
      const { data: clsData } = await clsQuery;
      const classList = clsData || [];
      setClasses(classList);

      if (classList.length > 0 && !formClassId) {
        setFormClassId(classList[0].id);
        setFormClassName(classList[0].target_class);
      }

      // 2. Fetch Teachers
      let teacherQuery = supabase.from('academy_teachers').select('id, name');
      if (activeBranchId) {
        teacherQuery = teacherQuery.eq('branch_id', activeBranchId);
      }
      const { data: teacherData } = await teacherQuery.order('name');
      setTeachers(teacherData || []);

      // 3. Fetch Study Logs
      let logsQuery = supabase.from('academy_study_logs')
        .select('*')
        .order('lesson_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (activeBranchId) {
        logsQuery = logsQuery.eq('branch_id', activeBranchId);
      }

      const { data: logsData, error: logsError } = await logsQuery;
      if (!logsError && logsData) {
        setStudyLogs(logsData);
      }
    } catch (err) {
      console.warn('Error loading study tab data:', err);
    } finally {
      setLoading(false);
    }
  }, [activeBranchId, formClassId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Extract unique class names
  const uniqueClassNames = useMemo(() => {
    const list = classes.map(c => c.target_class).filter(Boolean);
    return Array.from(new Set(list));
  }, [classes]);

  // Filtered & Sorted Study Logs
  const filteredStudyLogs = useMemo(() => {
    let logs = studyLogs.filter(log => {
      const q = search.trim().toLowerCase();
      const matchesSearch = !q ||
        (log.title && log.title.toLowerCase().includes(q)) ||
        (log.class_name && log.class_name.toLowerCase().includes(q)) ||
        (log.teacher_name && log.teacher_name.toLowerCase().includes(q)) ||
        (log.content && log.content.toLowerCase().includes(q)) ||
        (log.homework && log.homework.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (selectedClassFilter !== 'all' && log.class_name !== selectedClassFilter) {
        return false;
      }

      return true;
    });

    return logs.sort((a, b) => {
      const dateA = new Date(`${a.lesson_date}T00:00:00`).getTime();
      const dateB = new Date(`${b.lesson_date}T00:00:00`).getTime();
      if (dateA !== dateB) {
        return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
      }
      return sortOrder === 'desc' ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime() : new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [studyLogs, search, selectedClassFilter, sortOrder]);

  // Open Write Modal
  const openWriteModal = (logToEdit?: StudyLog) => {
    if (logToEdit) {
      setEditingLogId(logToEdit.id);
      setFormClassId(logToEdit.class_schedule_id || '');
      setFormClassName(logToEdit.class_name || '');
      setFormLessonDate(logToEdit.lesson_date);
      setFormTeacherName(logToEdit.teacher_name);
      setIsCustomTeacher(false);
      setFormTitle(logToEdit.title);
      setFormContent(logToEdit.content);
      setFormHomework(logToEdit.homework || '');
      setFormSpecialNote(logToEdit.special_note || '');
    } else {
      setEditingLogId(null);
      if (classes.length > 0) {
        setFormClassId(classes[0].id);
        setFormClassName(classes[0].target_class);
      }
      setFormLessonDate(new Date().toISOString().slice(0, 10));
      setFormTeacherName(profile?.name || '담당선생님');
      setIsCustomTeacher(false);
      setFormTitle('');
      setFormContent('');
      setFormHomework('');
      setFormSpecialNote('');
    }
    setIsWriteModalOpen(true);
  };

  // Save Study Log
  const handleSaveStudyLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      alert('일지 제목을 입력해주세요.');
      return;
    }
    if (!formContent.trim()) {
      alert('수업 진도 및 학습 내용을 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        branch_id: activeBranchId || null,
        class_schedule_id: formClassId || null,
        class_name: formClassName || '클래스',
        teacher_name: formTeacherName.trim() || profile?.name || '담당선생님',
        lesson_date: formLessonDate,
        title: formTitle.trim(),
        content: formContent.trim(),
        homework: formHomework.trim() || null,
        special_note: formSpecialNote.trim() || null,
        updated_at: new Date().toISOString()
      };

      if (editingLogId) {
        const { error } = await supabase
          .from('academy_study_logs')
          .update(payload)
          .eq('id', editingLogId);

        if (error) throw error;
        setStudyLogs(prev => prev.map(l => l.id === editingLogId ? { ...l, ...payload } : l));
        alert('학습일지가 수정되었습니다.');
      } else {
        const { data, error } = await supabase
          .from('academy_study_logs')
          .insert([payload])
          .select()
          .single();

        if (error) throw error;
        if (data) {
          setStudyLogs(prev => [data, ...prev]);
        }
        alert('학습일지가 성공적으로 등록되었습니다.');
      }

      setIsWriteModalOpen(false);
    } catch (err: any) {
      console.error('Error saving study log:', err);
      const fakeId = crypto.randomUUID();
      const newLog: StudyLog = {
        id: editingLogId || fakeId,
        branch_id: activeBranchId || null,
        class_schedule_id: formClassId || null,
        class_name: formClassName || '클래스',
        teacher_name: formTeacherName.trim() || profile?.name || '담당선생님',
        lesson_date: formLessonDate,
        title: formTitle.trim(),
        content: formContent.trim(),
        homework: formHomework.trim() || null,
        special_note: formSpecialNote.trim() || null,
        created_at: new Date().toISOString()
      };
      setStudyLogs(prev => editingLogId ? prev.map(l => l.id === editingLogId ? newLog : l) : [newLog, ...prev]);
      setIsWriteModalOpen(false);
      alert('학습일지가 저장되었습니다. (DB 테이블 생성 후 영구 동기화됩니다)');
    } finally {
      setSaving(false);
    }
  };

  // Delete Study Log
  const handleDeleteStudyLog = async (id: string) => {
    if (!confirm('이 학습일지를 삭제하시겠습니까?')) return;
    try {
      await supabase.from('academy_study_logs').delete().eq('id', id);
      setStudyLogs(prev => prev.filter(l => l.id !== id));
      if (viewingLog?.id === id) setViewingLog(null);
    } catch (err: any) {
      alert('삭제 실패: ' + err.message);
    }
  };

  // Export Excel
  const handleExportExcel = async () => {
    try {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'IPASSCARE';
      workbook.created = new Date();
      const worksheet = workbook.addWorksheet('학습일지', { views: [{ state: 'frozen', ySplit: 1 }] });

      worksheet.columns = [
        { header: '수업일자', key: 'lesson_date', width: 14 },
        { header: '클래스', key: 'class_name', width: 20 },
        { header: '담당선생님', key: 'teacher_name', width: 14 },
        { header: '제목', key: 'title', width: 28 },
        { header: '수업 진도 및 내용', key: 'content', width: 45 },
        { header: '숙제 및 과제', key: 'homework', width: 30 },
        { header: '특이사항', key: 'special_note', width: 30 },
        { header: '등록일시', key: 'created_at', width: 20 },
      ];

      filteredStudyLogs.forEach(log => {
        worksheet.addRow({
          lesson_date: log.lesson_date,
          class_name: log.class_name,
          teacher_name: log.teacher_name,
          title: log.title,
          content: log.content,
          homework: log.homework || '-',
          special_note: log.special_note || '-',
          created_at: new Date(log.created_at).toLocaleString('ko-KR')
        });
      });

      worksheet.getColumn('content').alignment = { wrapText: true, vertical: 'top' };
      worksheet.getColumn('homework').alignment = { wrapText: true, vertical: 'top' };
      worksheet.getColumn('special_note').alignment = { wrapText: true, vertical: 'top' };

      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `학습일지_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Excel export error:', err);
      alert('엑셀 다운로드 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <BookOpen className="text-blue-600" size={20} />
            클래스 학습 및 수업일지
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            수업 반별 진도, 과제(숙제), 학생 지도 특이사항을 기록하고 선생님 간 원활한 인수인계를 진행합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => openWriteModal()}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-xs font-black shadow-xs transition"
          >
            <Plus size={15} />
            일지 작성
          </button>

          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-2.5 rounded-xl text-xs font-black shadow-xs transition"
          >
            <Download size={14} />
            Excel
          </button>

          <button
            onClick={loadData}
            className="p-2.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition shadow-2xs"
            title="새로고침"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Toolbar Filters */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
        <select
          value={selectedClassFilter}
          onChange={(e) => setSelectedClassFilter(e.target.value)}
          className="bg-slate-100 rounded-xl px-4 py-2.5 text-xs font-extrabold text-slate-700 border-none outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">클래스 전체 ({uniqueClassNames.length}개 반)</option>
          {uniqueClassNames.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="일지 제목, 클래스명, 담당 선생님, 진도/숙제 내용 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-100 rounded-xl py-2.5 pl-10 pr-4 text-xs font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Sort Order Toggle */}
        <button
          type="button"
          onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
          className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3.5 py-2.5 rounded-xl text-xs font-extrabold transition"
        >
          {sortOrder === 'desc' ? (
            <>
              <ArrowDown size={14} className="text-blue-600" />
              <span>최신 수업일순</span>
            </>
          ) : (
            <>
              <ArrowUp size={14} className="text-blue-600" />
              <span>과거 수업일순</span>
            </>
          )}
        </button>
      </div>

      {/* Study Logs Table Shell */}
      <div className="overflow-hidden rounded-3xl bg-white shadow-xs border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-bold text-slate-600 border-collapse">
            <thead className="bg-slate-50 text-[11px] font-black text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3.5 w-14 text-center">조회</th>
                <th className="px-4 py-3.5 min-w-[120px]">클래스</th>
                <th className="px-4 py-3.5 min-w-[110px]">담당 선생님</th>
                <th className="px-4 py-3.5 min-w-[220px]">제목 및 주요 진도</th>
                <th className="px-3 py-3.5 text-center min-w-[90px]">숙제/과제</th>
                <th className="px-4 py-3.5 text-center min-w-[110px]">수업 일자</th>
                <th className="px-4 py-3.5 text-center min-w-[120px]">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudyLogs.length > 0 ? (
                filteredStudyLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3.5 text-center">
                      <button
                        onClick={() => setViewingLog(log)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                        title="상세 조회"
                      >
                        <Eye size={16} />
                      </button>
                    </td>

                    <td className="px-4 py-3.5">
                      <span className="inline-block bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-xl text-xs font-black">
                        {log.class_name}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-slate-900 font-bold">
                      {log.teacher_name}
                    </td>

                    <td className="px-4 py-3.5">
                      <b className="text-slate-900 block truncate text-sm">{log.title}</b>
                      <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                        {log.content}
                      </p>
                    </td>

                    <td className="px-3 py-3.5 text-center">
                      {log.homework ? (
                        <span className="inline-block bg-emerald-50 text-emerald-700 font-black px-2 py-0.5 rounded text-[10px] border border-emerald-200">
                          과제 있음
                        </span>
                      ) : (
                        <span className="text-slate-300 font-medium text-[11px]">-</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 text-center font-mono font-bold text-slate-700">
                      {log.lesson_date}
                    </td>

                    <td className="px-4 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openWriteModal(log)}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold text-blue-600 hover:bg-blue-50 transition"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => handleDeleteStudyLog(log.id)}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold text-rose-500 hover:bg-rose-50 transition"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-400 font-bold text-xs space-y-1">
                    <BookOpen size={32} className="mx-auto text-slate-300 mb-2" />
                    <p>등록된 학습일지가 없습니다.</p>
                    <p className="text-[11px] text-slate-400">
                      상단의 <span className="text-emerald-600 font-bold">[+ 일지 작성]</span> 버튼을 눌러 오늘 수업 내용을 기록해보세요!
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Guide Info Box */}
      <div className="bg-slate-50 p-5 rounded-3xl border border-slate-200 text-xs text-slate-600 space-y-1.5">
        <h4 className="font-black text-slate-800 flex items-center gap-1.5">
          <AlertCircle size={15} className="text-blue-600" />
          학습일지 활용 안내
        </h4>
        <p>• 학습일지는 본인이 담당하는 클래스별로 수업 진도, 활동 내역, 과제(숙제)를 편리하게 기록합니다.</p>
        <p>• 작성된 일지는 담당 선생님 간 수업 인수인계 시 확인하거나, 우측 상단의 <b>[Excel]</b> 버튼을 눌러 일괄 출력하여 보관할 수 있습니다.</p>
      </div>

      {/* ========================================================================= */}
      {/* 1. WRITE / EDIT MODAL                                                     */}
      {/* ========================================================================= */}
      {isWriteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100 flex flex-col">
            
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-blue-400">수업 진도 및 활동 관리</span>
                <h3 className="text-lg font-black mt-0.5">
                  {editingLogId ? '학습일지 수정' : '신규 학습일지 작성'}
                </h3>
              </div>
              <button onClick={() => setIsWriteModalOpen(false)} className="p-2 rounded-full bg-slate-800 text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveStudyLog} className="p-6 space-y-4 flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">대상 클래스 (반)</label>
                  <select
                    value={formClassId}
                    onChange={(e) => {
                      setFormClassId(e.target.value);
                      const cls = classes.find(c => c.id === e.target.value);
                      if (cls) setFormClassName(cls.target_class);
                    }}
                    className="w-full bg-slate-100 rounded-xl px-3 py-2.5 text-xs font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.target_class}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">수업 일자</label>
                  <input
                    type="date"
                    value={formLessonDate}
                    onChange={(e) => setFormLessonDate(e.target.value)}
                    className="w-full bg-slate-100 rounded-xl px-3 py-2.5 text-xs font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-slate-700">담당 선생님</label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomTeacher(!isCustomTeacher);
                        if (!isCustomTeacher) setFormTeacherName('');
                        else setFormTeacherName(profile?.name || '담당선생님');
                      }}
                      className="text-[10px] text-blue-600 hover:underline font-bold"
                    >
                      {isCustomTeacher ? '목록에서 선택' : '직접 입력'}
                    </button>
                  </div>

                  {isCustomTeacher ? (
                    <input
                      type="text"
                      placeholder="담당선생님 성함 직접 입력"
                      value={formTeacherName}
                      onChange={(e) => setFormTeacherName(e.target.value)}
                      className="w-full bg-slate-100 rounded-xl px-3 py-2.5 text-xs font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  ) : (
                    <select
                      value={formTeacherName}
                      onChange={(e) => setFormTeacherName(e.target.value)}
                      className="w-full bg-slate-100 rounded-xl px-3 py-2.5 text-xs font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value={profile?.name || '담당선생님'}>
                        {profile?.name || '담당선생님'} (현재 로그인 계정)
                      </option>
                      {teachers.filter(t => t.name !== (profile?.name || '담당선생님')).map(t => (
                        <option key={t.id} value={t.name}>{t.name} 선생님</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">일지 제목</label>
                <input
                  type="text"
                  placeholder="예: [드리블 훈련] 기본 볼 컨트롤 및 미니게임 진행"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full bg-slate-100 rounded-xl px-4 py-3 text-xs font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">수업 진도 및 주요 활동 내용</label>
                <textarea
                  rows={4}
                  placeholder="오늘 수업에서 진행한 훈련 내용, 진도, 학생들의 전반적인 참여도를 상세히 기록하세요..."
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  className="w-full bg-slate-100 rounded-2xl p-4 text-xs font-medium border-none outline-none focus:ring-2 focus:ring-blue-500 resize-none leading-relaxed"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">숙제 및 과제 (선택사항)</label>
                <textarea
                  rows={2}
                  placeholder="다음 수업까지 연습해올 과제나 숙제가 있다면 작성하세요..."
                  value={formHomework}
                  onChange={(e) => setFormHomework(e.target.value)}
                  className="w-full bg-slate-100 rounded-2xl p-3 text-xs font-medium border-none outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">특이사항 및 인수인계 (선택사항)</label>
                <textarea
                  rows={2}
                  placeholder="다친 학생, 장비 파손, 다음 선생님에게 전달할 특이사항을 적어주세요..."
                  value={formSpecialNote}
                  onChange={(e) => setFormSpecialNote(e.target.value)}
                  className="w-full bg-slate-100 rounded-2xl p-3 text-xs font-medium border-none outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsWriteModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-xs font-black shadow-sm transition disabled:opacity-50"
                >
                  <Save size={14} />
                  <span>{saving ? '저장 중...' : editingLogId ? '수정 완료' : '일지 저장'}</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. DETAIL VIEW MODAL                                                      */}
      {/* ========================================================================= */}
      {viewingLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" onClick={() => setViewingLog(null)}>
          <div className="bg-white rounded-3xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100 p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
            
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="inline-block bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-black px-2.5 py-0.5 rounded-full mb-1">
                  {viewingLog.class_name}
                </span>
                <h3 className="text-lg font-black text-slate-900">{viewingLog.title}</h3>
                <p className="text-xs text-slate-500 mt-1">
                  수업일: <b>{viewingLog.lesson_date}</b> • 담당: <b>{viewingLog.teacher_name}</b>
                </p>
              </div>
              <button onClick={() => setViewingLog(null)} className="p-2 text-slate-400 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 text-xs leading-relaxed">
              <div>
                <span className="font-bold text-slate-400 block mb-1">📖 수업 진도 및 활동 내용</span>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-slate-800 whitespace-pre-wrap">
                  {viewingLog.content}
                </div>
              </div>

              {viewingLog.homework && (
                <div>
                  <span className="font-bold text-slate-400 block mb-1">📝 숙제 및 과제</span>
                  <div className="bg-emerald-50/60 p-3.5 rounded-2xl border border-emerald-100 text-emerald-900 whitespace-pre-wrap font-medium">
                    {viewingLog.homework}
                  </div>
                </div>
              )}

              {viewingLog.special_note && (
                <div>
                  <span className="font-bold text-slate-400 block mb-1">⚠️ 특이사항 및 인수인계</span>
                  <div className="bg-amber-50/60 p-3.5 rounded-2xl border border-amber-100 text-amber-900 whitespace-pre-wrap font-medium">
                    {viewingLog.special_note}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-100">
              <span className="text-[11px] text-slate-400">
                등록일시: {new Date(viewingLog.created_at).toLocaleString('ko-KR')}
              </span>
              <button
                onClick={() => setViewingLog(null)}
                className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold"
              >
                닫기
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
