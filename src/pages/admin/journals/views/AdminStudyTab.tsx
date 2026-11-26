import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, BellRing, BookOpen, CheckCircle2, ChevronRight, Download, Edit3, LockKeyhole, RefreshCw, Save, Search, Trash2, UserCheck, X } from 'lucide-react';
import { supabase } from '../../../../lib/supabaseClient';
import { loadActiveAppSchedulesByChild } from '../../../../lib/adminScheduleAssignments';
import { handleError } from '../../../../errors/handleError';
import { AppError } from '../../../../errors/appError';
import { loadStudyData, type StudyLog, type StudyTeacher } from '../api/studyData';
import { saveStudyLog, publishStudyLog, deleteStudyLog } from '../api/studyWrites';
import { notifyJournal } from '../api/journalNotification';
import { downloadExcel } from '../../../../lib/excelDownload';
export type { StudyLog } from '../api/studyData';
interface AdminStudyTabProps { activeBranchId: string | null; branches: Array<{ id: string; name: string }>; profile: any; }

const getStudentSchedules = (student: any) => student?.child_id
  ? student.app_schedule_classes || []
  : (student?.academy_student_classes || []).map((item: any) => item.class_schedules).filter(Boolean);
const today = () => new Date().toISOString().slice(0, 10);

export const AdminStudyTab: React.FC<AdminStudyTabProps> = ({ activeBranchId, branches, profile }) => {
  const [students, setStudents] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<StudyTeacher[]>([]);
  const loadSequence = useRef(0);
  const mutationInFlight = useRef(false);
  const formSequence = useRef(0);
  const exportInFlight = useRef(false);
  const [logs, setLogs] = useState<StudyLog[]>([]);
  const [studentId, setStudentId] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [studentSearch, setStudentSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [sort, setSort] = useState<'desc' | 'asc'>('desc');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [classId, setClassId] = useState('');
  const [className, setClassName] = useState('미배정');
  const [date, setDate] = useState(today());
  const [teacher, setTeacher] = useState(profile?.name || '담당선생님');
  const [customTeacher, setCustomTeacher] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [homework, setHomework] = useState('');
  const [note, setNote] = useState('');
  const [notifyParent, setNotifyParent] = useState(false);

  const loadData = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    try {
      const data = await loadStudyData(activeBranchId, {
        client: supabase,
        loadSchedules: loadActiveAppSchedulesByChild,
      });
      if (sequence !== loadSequence.current) return;
      setStudents(data.students);
      setTeachers(data.teachers);
      setLogs(data.logs);
      setStudentId(current => current && data.students.some(student => student.id === current)
        ? current : data.students[0]?.id || '');
    } catch (error: unknown) {
      if (sequence !== loadSequence.current) return;
      setStudents([]); setTeachers([]); setLogs([]); setStudentId('');
      await handleError(error, 'JOURNAL_LOAD_FAILED', { operation: 'journal.study.load' });
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [activeBranchId]);

  useEffect(() => {
    void loadData();
    return () => { loadSequence.current += 1; };
  }, [loadData]);

  const selectedStudent = useMemo(() => students.find((item) => item.id === studentId) || null, [studentId, students]);
  const selectedClasses = useMemo(() => getStudentSchedules(selectedStudent), [selectedStudent]);
  const uniqueClasses = useMemo(() => Array.from(new Set(students.flatMap((item) => getStudentSchedules(item).map((schedule: any) => schedule?.target_class)).filter(Boolean))), [students]);
  const filteredStudents = useMemo(() => students.filter((item) => {
    const q = studentSearch.trim().toLowerCase();
    const matches = !q || item.student_name?.toLowerCase().includes(q) || item.attendance_code?.toLowerCase().includes(q) || item.parent_name?.toLowerCase().includes(q);
    return matches && (classFilter === 'all' || getStudentSchedules(item).some((schedule: any) => schedule?.target_class === classFilter));
  }), [classFilter, studentSearch, students]);
  const studentLogs = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return logs.filter((item) => item.student_id === studentId)
      .filter((item) => !q || [item.title, item.content, item.homework, item.class_name, item.teacher_name].some((value) => value?.toLowerCase().includes(q)))
      .sort((a, b) => {
        const dateDiff = new Date(`${a.lesson_date}T00:00:00`).getTime() - new Date(`${b.lesson_date}T00:00:00`).getTime();
        const createdDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        return sort === 'asc' ? dateDiff || createdDiff : -(dateDiff || createdDiff);
      });
  }, [historySearch, logs, sort, studentId]);
  const legacyLogs = useMemo(() => logs.filter((item) => !item.student_id), [logs]);

  const resetForm = useCallback((student = selectedStudent) => {
    formSequence.current += 1;
    const firstClass = getStudentSchedules(student)[0];
    setEditingId(null); setClassId(firstClass?.id || ''); setClassName(firstClass?.target_class || '미배정');
    setDate(today()); setTeacher(profile?.name || '담당선생님'); setCustomTeacher(false);
    setTitle(''); setContent(''); setHomework(''); setNote(''); setNotifyParent(false);
  }, [profile?.name, selectedStudent]);

  const selectStudent = (student: any) => { setStudentId(student.id); resetForm(student); };
  const editLog = (log: StudyLog) => {
    formSequence.current += 1;
    setEditingId(log.id); setClassId(log.class_schedule_id || ''); setClassName(log.class_name || '미배정');
    setDate(log.lesson_date); setTeacher(log.teacher_name); setCustomTeacher(false); setTitle(log.title);
    setContent(log.content); setHomework(log.homework || ''); setNote(log.special_note || '');
    // 수정은 기본적으로 알림 없이 저장한다. 담당자가 명시적으로 선택한 경우에만 재알림한다.
    setNotifyParent(false); window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const notifySavedStudy = async (id: string, updated: boolean) => {
    try {
      const result = await notifyJournal('study', id, updated, { client: supabase });
      alert(result.targetCount === 0
        ? '일지는 저장되었지만 연결된 학부모 계정이 없어 알림 대상은 없습니다.'
        : `일지 알림 요청을 처리했습니다. 푸시 접수 ${result.sentCount}건 / 실패 ${result.failedCount}건. 휴대폰 수신을 보장하는 수치는 아닙니다.`);
    } catch (error: unknown) {
      await handleError(new AppError('JOURNAL_NOTIFICATION_FAILED', error), 'JOURNAL_NOTIFICATION_FAILED', { operation: 'journal.study.notify' });
    }
  };

  const saveLog = async (event: React.FormEvent) => {
    event.preventDefault();
    if (mutationInFlight.current) return;
    if (!studentId || !selectedStudent?.branch_id) return alert('먼저 원생을 선택해주세요.');
    if (!title.trim()) return alert('일지 제목을 입력해주세요.');
    if (!content.trim()) return alert('수업 진도 및 학습 내용을 입력해주세요.');
    mutationInFlight.current = true;
    const view = loadSequence.current;
    const form = formSequence.current;
    setSaving(true);
    try {
      const payload = { branch_id: selectedStudent.branch_id, student_id: studentId, class_schedule_id: classId || null, class_name: className || '미배정', teacher_name: teacher.trim() || profile?.name || '담당선생님', lesson_date: date, title: title.trim(), content: content.trim(), homework: homework.trim() || null, special_note: note.trim() || null };
      const existing = logs.find(item => item.id === editingId);
      const saved = await saveStudyLog(payload, editingId, Boolean(existing?.is_parent_visible) || notifyParent, { client: supabase });
      if (view === loadSequence.current) {
        setLogs(current => editingId ? current.map(item => item.id === editingId ? saved : item) : [saved, ...current]);
      }
      if (notifyParent) await notifySavedStudy(saved.id, Boolean(editingId));
      else alert(editingId ? '학습일지를 알림 없이 수정했습니다.' : '학습일지를 학원 내부용으로 저장했습니다.');
      if (view === loadSequence.current && form === formSequence.current) resetForm();
    } catch (error: unknown) {
      await handleError(error, 'JOURNAL_SAVE_UNCONFIRMED', { operation: 'journal.study.save' });
    } finally {
      mutationInFlight.current = false;
      setSaving(false);
    }
  };

  const publishLog = async (log: StudyLog) => {
    if (log.is_parent_visible || mutationInFlight.current) return;
    if (!confirm(`${selectedStudent?.student_name || '선택한 원생'} 학부모에게 이 학습일지를 공개하고 알림을 보내시겠습니까?`)) return;
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    const view = loadSequence.current;
    setPublishingId(log.id);
    try {
      await publishStudyLog(log.id, { client: supabase });
      if (view === loadSequence.current) {
        setLogs(current => current.map(item => item.id === log.id ? { ...item, is_parent_visible: true } : item));
      }
      await notifySavedStudy(log.id, false);
    } catch (error: unknown) {
      await handleError(error, 'JOURNAL_SAVE_UNCONFIRMED', { operation: 'journal.study.publish' });
    } finally {
      mutationInFlight.current = false;
      setPublishingId(null);
    }
  };

  const deleteLog = async (id: string) => {
    if (mutationInFlight.current) return;
    if (!confirm('이 학습일지를 삭제하시겠습니까?')) return;
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    const view = loadSequence.current;
    const form = formSequence.current;
    setSaving(true);
    try {
      await deleteStudyLog(id, { client: supabase });
      if (view === loadSequence.current) {
        setLogs(current => current.filter(item => item.id !== id));
        if (editingId === id && form === formSequence.current) resetForm();
      }
    } catch (error: unknown) {
      await handleError(error, 'JOURNAL_DELETE_UNCONFIRMED', { operation: 'journal.study.delete' });
    } finally {
      mutationInFlight.current = false;
      setSaving(false);
    }
  };

  const exportExcel = async () => {
    if (exportInFlight.current) return;
    exportInFlight.current = true;
    try {
      const { buildStudyWorkbook } = await import('../files/studyWorkbook');
      const buffer = await buildStudyWorkbook(logs, students);
      downloadExcel(buffer, `원생별_학습일지_${today()}.xlsx`);
    } catch (error: unknown) {
      await handleError(error, 'EXCEL_EXPORT_FAILED', { operation: 'journal.study.export' });
    } finally { exportInFlight.current = false; }
  };

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="flex items-center gap-2 text-lg font-black text-slate-900"><BookOpen className="text-blue-600" size={20} />원생별 학습일지</h2><p className="mt-1 text-xs text-slate-500">원생을 선택해 학습 내용을 기록하고, 필요한 일지만 학부모에게 전달합니다.</p></div>
      <div className="flex gap-2"><button onClick={exportExcel} className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2.5 text-xs font-black text-white hover:bg-slate-800"><Download size={14} />Excel</button><button onClick={loadData} className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-700 hover:bg-slate-100" title="새로고침"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button></div>
    </header>

    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
      <aside className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5 lg:col-span-4">
        <div className="space-y-2.5"><label className="block text-xs font-bold text-slate-700">클래스 및 원생 검색</label><select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="w-full rounded-xl border-none bg-slate-100 px-3.5 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"><option value="all">전체 클래스 ({students.length}명)</option>{uniqueClasses.map((name) => <option key={String(name)} value={String(name)}>{String(name)}</option>)}</select><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} /><input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="원생명, 출결번호, 보호자 검색" className="w-full rounded-xl border-none bg-slate-100 py-2.5 pl-9 pr-3 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500" /></div></div>
        <div className="max-h-[700px] space-y-2 overflow-y-auto pr-1"><div className="flex justify-between px-1 text-[11px] font-bold text-slate-400"><span>원생 목록 ({filteredStudents.length}명)</span><span>작성 건수</span></div>{filteredStudents.length ? filteredStudents.map((student) => {
          const selected = student.id === studentId; const count = logs.filter((item) => item.student_id === student.id).length; const group = getStudentSchedules(student)[0]?.target_class || '미배정';
          return <button key={student.id} type="button" onClick={() => selectStudent(student)} className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-3.5 text-left transition ${selected ? 'border-blue-600 bg-blue-600 text-white shadow-sm' : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100'}`}><div className="min-w-0"><div className="flex items-center gap-2"><b className="truncate text-sm">{student.student_name}</b>{student.attendance_code && <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${selected ? 'bg-blue-700 text-blue-100' : 'bg-slate-200 text-slate-600'}`}>#{student.attendance_code}</span>}</div><p className={`mt-0.5 truncate text-[11px] ${selected ? 'text-blue-100' : 'text-slate-500'}`}>{group} · {student.parent_name ? `${student.parent_name} 보호자` : '보호자 미연결'}</p></div><div className="flex shrink-0 items-center gap-1"><span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${selected ? 'bg-white text-blue-600' : count ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500'}`}>{count}건</span><ChevronRight size={14} /></div></button>;
        }) : <div className="py-12 text-center text-xs font-bold text-slate-400">조건에 맞는 원생이 없습니다.</div>}</div>
      </aside>

      <main className="space-y-6 lg:col-span-8">{selectedStudent ? <>
        <section className="flex flex-col justify-between gap-4 rounded-3xl bg-slate-900 p-5 text-white shadow-sm sm:flex-row sm:items-center"><div><span className="rounded-full bg-blue-950 px-2.5 py-0.5 text-[10px] font-black text-blue-400">SELECTED STUDENT</span><h3 className="mt-1 text-xl font-black">{selectedStudent.student_name} 원생</h3><p className="mt-0.5 text-xs text-slate-400">{selectedStudent.parent_name ? `보호자: ${selectedStudent.parent_name}` : '연결된 보호자 정보 없음'} · {selectedClasses[0]?.target_class || '수업 미배정'}</p></div><span className="self-start rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-black sm:self-auto">총 {logs.filter((item) => item.student_id === studentId).length}건</span></section>

        <form onSubmit={saveLog} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3"><h4 className="flex items-center gap-2 text-sm font-black text-slate-900"><Edit3 size={16} className="text-blue-600" />{editingId ? '학습일지 수정' : '새 학습일지 작성'}</h4>{editingId && <button type="button" onClick={() => resetForm()} className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-slate-700"><X size={14} />수정 취소</button>}</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><div><label className="mb-1 block text-[11px] font-bold text-slate-600">수업 일자</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="w-full rounded-xl border-none bg-slate-100 px-3 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500" /></div><div><label className="mb-1 block text-[11px] font-bold text-slate-600">수업 클래스</label><select value={classId} onChange={(e) => { const found = selectedClasses.find((item: any) => item.id === e.target.value); setClassId(e.target.value); setClassName(found?.target_class || '미배정'); }} className="w-full rounded-xl border-none bg-slate-100 px-3 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"><option value="">미배정</option>{selectedClasses.map((item: any) => <option key={item.id} value={item.id}>{item.target_class}</option>)}</select></div><div><div className="mb-1 flex justify-between"><label className="text-[11px] font-bold text-slate-600">담당 선생님</label><button type="button" onClick={() => { setCustomTeacher(!customTeacher); setTeacher(customTeacher ? profile?.name || '담당선생님' : ''); }} className="text-[10px] font-bold text-blue-600">{customTeacher ? '목록 선택' : '직접 입력'}</button></div>{customTeacher ? <input value={teacher} onChange={(e) => setTeacher(e.target.value)} required placeholder="선생님 성함" className="w-full rounded-xl border-none bg-slate-100 px-3 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500" /> : <select value={teacher} onChange={(e) => setTeacher(e.target.value)} className="w-full rounded-xl border-none bg-slate-100 px-3 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"><option value={profile?.name || '담당선생님'}>{profile?.name || '담당선생님'} (현재 계정)</option>{teachers.filter((item) => item.name !== (profile?.name || '담당선생님')).map((item) => <option key={item.id} value={item.name}>{item.name} 선생님</option>)}</select>}</div></div>
          <div><label className="mb-1 block text-[11px] font-bold text-slate-600">일지 제목</label><input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="예: 오늘 수업 진도 및 학습 내용" className="w-full rounded-xl border-none bg-slate-100 px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500" /></div>
          <div><label className="mb-1 block text-[11px] font-bold text-slate-600">학습 내용 및 수업 진도</label><textarea rows={5} value={content} onChange={(e) => setContent(e.target.value)} required placeholder={`${selectedStudent.student_name} 원생의 수업 범위, 이해도, 참여도와 보완할 내용을 작성해주세요.`} className="w-full resize-none rounded-2xl border-none bg-slate-100 p-4 text-xs font-medium leading-relaxed outline-none focus:ring-2 focus:ring-blue-500" /></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div><label className="mb-1 block text-[11px] font-bold text-slate-600">숙제 및 과제</label><textarea rows={3} value={homework} onChange={(e) => setHomework(e.target.value)} placeholder="예: 교재 20~22쪽 풀기, 오늘 배운 내용 복습하기" className="w-full resize-none rounded-2xl border-none bg-slate-100 p-3 text-xs outline-none focus:ring-2 focus:ring-blue-500" /></div><div><label className="mb-1 block text-[11px] font-bold text-slate-600">원생 특이사항</label><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 어려워한 부분은 다음 수업에서 추가 복습이 필요함" className="w-full resize-none rounded-2xl border-none bg-slate-100 p-3 text-xs outline-none focus:ring-2 focus:ring-blue-500" /></div></div>
          <button type="button" role="switch" aria-checked={notifyParent} onClick={() => setNotifyParent((current) => !current)} className={`flex w-full items-center justify-between gap-4 rounded-2xl border p-4 text-left transition ${notifyParent ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}><div className="flex items-center gap-3"><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${notifyParent ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}><UserCheck size={18} /></div><div><p className="text-xs font-black text-slate-900">{editingId ? '수정하고 학부모에게 다시 알림 보내기' : `${selectedStudent.student_name} 학부모에게 공개하고 알림 보내기`}</p><p className="mt-0.5 text-[11px] text-slate-500">{editingId ? '기본값은 알림 없이 저장입니다. 켜면 수정 알림을 다시 보내며, 내부용 일지는 학부모에게 공개됩니다.' : '끄면 내부용으로 저장하고 나중에 별도로 전송할 수 있습니다.'}</p></div></div><span className={`relative inline-flex h-6 w-11 shrink-0 rounded-full ${notifyParent ? 'bg-blue-600' : 'bg-slate-300'}`}><span className={`mt-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${notifyParent ? 'translate-x-6' : 'translate-x-1'}`} /></span></button>
          <div className="flex justify-end"><button type="submit" disabled={saving} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"><Save size={14} />{saving ? '저장 중...' : editingId ? notifyParent ? '수정 저장 + 다시 알림' : '알림 없이 수정 저장' : notifyParent ? '학부모 공개·알림과 함께 저장' : '학원 내부용으로 저장'}</button></div>
        </form>

        <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-xs"><div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-center"><h4 className="text-sm font-black text-slate-900">{selectedStudent.student_name} 학습 이력 ({studentLogs.length}건)</h4><div className="flex gap-2"><div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} /><input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} placeholder="이력 검색" className="w-36 rounded-xl border-none bg-slate-100 py-1.5 pl-8 pr-2 text-xs font-bold outline-none" /></div><button type="button" onClick={() => setSort((current) => current === 'desc' ? 'asc' : 'desc')} className="flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-extrabold text-slate-700">{sort === 'desc' ? <ArrowDown size={13} className="text-blue-600" /> : <ArrowUp size={13} className="text-blue-600" />}{sort === 'desc' ? '최신순' : '과거순'}</button></div></div>
          <div className="space-y-3">{studentLogs.length ? studentLogs.map((log) => <article key={log.id} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 hover:bg-slate-100"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3"><div><div className="flex flex-wrap items-center gap-2"><b className="text-sm text-slate-900">{log.title}</b><span className="rounded-lg bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700">{log.class_name}</span><span className="rounded-lg bg-indigo-50 px-2 py-0.5 text-[10px] font-black text-indigo-700">{branches.find((branch) => branch.id === log.branch_id)?.name || '지점 미지정'}</span></div><p className="mt-1 text-[11px] text-slate-500">{log.lesson_date} · {log.teacher_name} 선생님</p></div><div className="flex items-center gap-1.5">{log.is_parent_visible ? <span className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-black text-emerald-700"><CheckCircle2 size={12} />학부모 공개</span> : <button onClick={() => publishLog(log)} disabled={publishingId === log.id} className="inline-flex items-center gap-1 rounded-xl bg-violet-600 px-3 py-1.5 text-[10px] font-black text-white disabled:opacity-50"><BellRing size={12} />{publishingId === log.id ? '전송 중' : '학부모에게 보내기'}</button>}<button onClick={() => editLog(log)} className="rounded-lg px-2 py-1.5 text-[10px] font-black text-blue-600 hover:bg-blue-50">수정</button><button onClick={() => deleteLog(log.id)} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50" title="삭제"><Trash2 size={13} /></button></div></div><p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{log.content}</p>{(log.homework || log.special_note) && <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{log.homework && <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3"><b className="text-[10px] text-emerald-700">숙제·과제</b><p className="mt-1 whitespace-pre-wrap text-[11px]">{log.homework}</p></div>}{log.special_note && <div className="rounded-xl border border-amber-100 bg-amber-50 p-3"><b className="text-[10px] text-amber-700">특이사항</b><p className="mt-1 whitespace-pre-wrap text-[11px]">{log.special_note}</p></div>}</div>}{!log.is_parent_visible && <p className="flex items-center gap-1 text-[10px] font-bold text-slate-400"><LockKeyhole size={10} />현재 학원 내부용 기록입니다.</p>}</article>) : <div className="py-14 text-center"><BookOpen size={30} className="mx-auto mb-2 text-slate-300" /><p className="text-xs font-bold text-slate-400">이 원생의 학습일지가 없습니다.</p><p className="mt-1 text-[11px] text-slate-400">위 작성란에서 첫 학습일지를 남겨주세요.</p></div>}</div>
        </section>

        {legacyLogs.length > 0 && <details className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><summary className="cursor-pointer text-xs font-black text-amber-800">기존 반 전체 학습일지 {legacyLogs.length}건</summary><p className="mt-2 text-[11px] text-amber-700">원생별 기능 적용 전에 작성된 기록입니다. 수정할 때 대상 원생을 지정하면 개별 일지로 전환됩니다.</p><div className="mt-3 space-y-2">{legacyLogs.slice(0, 10).map((log) => <button key={log.id} onClick={() => editLog(log)} className="flex w-full justify-between rounded-xl border border-amber-200 bg-white px-3 py-2 text-left text-xs"><span className="truncate font-bold">{log.lesson_date} · {log.class_name} · {log.title}</span><span className="shrink-0 text-blue-600">원생 지정</span></button>)}</div></details>}
      </> : <div className="rounded-3xl border border-dashed border-slate-300 bg-white py-24 text-center"><BookOpen size={36} className="mx-auto mb-3 text-slate-300" /><p className="text-sm font-black text-slate-600">학습일지를 작성할 원생을 선택해주세요.</p><p className="mt-1 text-xs text-slate-400">왼쪽 목록에서 원생을 선택하면 작성 화면과 과거 이력이 표시됩니다.</p></div>}</main>
    </div>
  </div>;
};
