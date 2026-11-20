import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { BookOpen, Download, RefreshCw, Save } from 'lucide-react';
import { focusJournalSection, JournalEntry, JournalSearch, JournalSelection, JournalSort, JournalStudentPicker, JournalVisibility, journalButton, journalField, journalLabel, journalPanel, journalPrimary } from './JournalUi';
import { supabase } from '../../lib/supabaseClient';
import {invokeActivityNotification,activityNotificationText} from '../../services/notifications/ActivityNotificationService';
import { loadActiveAppSchedulesByChild } from '../../lib/adminScheduleAssignments';
import { handleError } from '../../errors/handleError';

export interface StudyLog {
  id: string; branch_id: string | null; student_id: string | null;
  class_schedule_id: string | null; class_name: string; teacher_name: string;
  lesson_date: string; title: string; content: string; homework: string | null;
  special_note: string | null; created_at: string; updated_at?: string;
  is_parent_visible?: boolean;
}

interface Teacher { id: string; name: string; }
interface AdminStudyTabProps { activeBranchId: string | null; branches: Array<{ id: string; name: string }>; profile: any; }

const getStudentSchedules = (student: any) => student?.child_id
  ? student.app_schedule_classes || []
  : (student?.academy_student_classes || []).map((item: any) => item.class_schedules).filter(Boolean);
const today = () => new Date().toISOString().slice(0, 10);

export const AdminStudyTab: React.FC<AdminStudyTabProps> = ({ activeBranchId, branches, profile }) => {
  const [students, setStudents] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
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
  const journalId = useId();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let studentQuery = supabase.from('academy_students').select(`
        id, child_id, student_name, parent_name, attendance_code, branch_id,
        academy_student_classes(class_schedules(id, target_class, day_of_week, start_time, end_time))
      `).order('student_name');
      let teacherQuery = supabase.from('academy_teachers').select('id, name').order('name');
      let logQuery = supabase.from('academy_study_logs').select('*')
        .order('lesson_date', { ascending: false }).order('created_at', { ascending: false });
      if (activeBranchId) {
        studentQuery = studentQuery.eq('branch_id', activeBranchId);
        teacherQuery = teacherQuery.eq('branch_id', activeBranchId);
        logQuery = logQuery.eq('branch_id', activeBranchId);
      }
      const [studentResult, teacherResult, logResult] = await Promise.all([studentQuery, teacherQuery, logQuery]);
      if (studentResult.error) throw studentResult.error;
      if (teacherResult.error) throw teacherResult.error;
      if (logResult.error) throw logResult.error;
      const rawStudents = studentResult.data || [];
      const schedules = await loadActiveAppSchedulesByChild(rawStudents.map((item: any) => item.child_id).filter(Boolean));
      const studentList = rawStudents.map((item: any) => ({ ...item, app_schedule_classes: item.child_id ? schedules.get(item.child_id) || [] : undefined }));
      setStudents(studentList);
      setTeachers(teacherResult.data || []);
      setLogs(logResult.data || []);
      setStudentId((current) => current || studentList[0]?.id || '');
    } catch (error: unknown) {
      setStudents([]); setLogs([]);
      await handleError(error, 'JOURNAL_LOAD_FAILED', { operation: 'journal.study.load' });
    } finally { setLoading(false); }
  }, [activeBranchId]);

  useEffect(() => { void loadData(); }, [loadData]);

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
    const firstClass = getStudentSchedules(student)[0];
    setEditingId(null); setClassId(firstClass?.id || ''); setClassName(firstClass?.target_class || '미배정');
    setDate(today()); setTeacher(profile?.name || '담당선생님'); setCustomTeacher(false);
    setTitle(''); setContent(''); setHomework(''); setNote(''); setNotifyParent(false);
  }, [profile?.name, selectedStudent]);

  const selectStudent = (student: any) => { setStudentId(student.id); resetForm(student); };
  const editLog = (log: StudyLog) => {
    setEditingId(log.id); setClassId(log.class_schedule_id || ''); setClassName(log.class_name || '미배정');
    setDate(log.lesson_date); setTeacher(log.teacher_name); setCustomTeacher(false); setTitle(log.title);
    setContent(log.content); setHomework(log.homework || ''); setNote(log.special_note || '');
    // 수정은 기본적으로 알림 없이 저장한다. 담당자가 명시적으로 선택한 경우에만 재알림한다.
    setNotifyParent(false); focusJournalSection(journalId + '-editor');
  };

  const saveLog = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || publishingId) return;
    if (!studentId || !selectedStudent?.branch_id) return alert('먼저 원생을 선택해주세요.');
    if (!title.trim()) return alert('일지 제목을 입력해주세요.');
    if (!content.trim()) return alert('수업 진도 및 학습 내용을 입력해주세요.');
    setSaving(true);
    try {
      const payload = { branch_id: selectedStudent.branch_id, student_id: studentId, class_schedule_id: classId || null, class_name: className || '미배정', teacher_name: teacher.trim() || profile?.name || '담당선생님', lesson_date: date, title: title.trim(), content: content.trim(), homework: homework.trim() || null, special_note: note.trim() || null, updated_at: new Date().toISOString() };
      if (editingId) {
        const existingLog = logs.find((item) => item.id === editingId);
        const { data, error } = await supabase.from('academy_study_logs').update({ ...payload, is_parent_visible: Boolean(existingLog?.is_parent_visible) || notifyParent }).eq('id', editingId).select().single();
        if (error) throw error;
        setLogs((current) => current.map((item) => item.id === editingId ? data : item));
        if (notifyParent) {
          try {
            const { data: notificationResult, error: notificationError } = await invokeActivityNotification('send-journal-notification', { body: { journalType: 'study', journalId: data.id, notificationKind: 'updated' } });
            if (notificationError || notificationResult?.success !== true) throw notificationError || notificationResult;
            alert(activityNotificationText(notificationResult,notificationResult.targetCount > 0 ? '수정 내용을 저장하고 학부모에게 다시 알림을 보냈습니다.' : '수정 내용은 저장했지만 연결된 학부모 계정이 없어 알림 대상은 없습니다.'));
          } catch (notificationError: unknown) {
            await handleError(notificationError, 'JOURNAL_NOTIFICATION_FAILED', { operation: 'journal.study.update-notification' });
          }
        } else {
          alert('학습일지를 알림 없이 수정했습니다.');
        }
      } else {
        const { data, error } = await supabase.from('academy_study_logs').insert([{ ...payload, is_parent_visible: notifyParent }]).select().single();
        if (error) throw error;
        setLogs((current) => [data, ...current]);
        if (notifyParent) {
          try {
            const result = await invokeActivityNotification('send-journal-notification', { body: { journalType: 'study', journalId: data.id } });
            if (result.error || result.data?.success !== true) throw result.error || result.data;
            alert(activityNotificationText(result.data,result.data.targetCount > 0 ? `${selectedStudent?.student_name || '원생'} 학부모에게 학습일지와 알림을 전송했습니다.` : '학습일지는 저장했지만 연결된 학부모 계정이 없어 알림 대상은 없습니다.'));
          } catch (error: unknown) { await handleError(error, 'JOURNAL_NOTIFICATION_FAILED', { operation: 'journal.study.notify' }); }
        } else alert('학습일지를 학원 내부용으로 저장했습니다.');
      }
      resetForm();
    } catch (error: unknown) { await handleError(error, 'JOURNAL_SAVE_FAILED', { operation: 'journal.study.save' }); }
    finally { setSaving(false); }
  };

  const publishLog = async (log: StudyLog) => {
    if (log.is_parent_visible || publishingId) return;
    if (!confirm(`${selectedStudent?.student_name || '선택한 원생'} 학부모에게 이 학습일지를 공개하고 알림을 보내시겠습니까?`)) return;
    setPublishingId(log.id);
    try {
      const { error } = await supabase.from('academy_study_logs').update({ is_parent_visible: true, updated_at: new Date().toISOString() }).eq('id', log.id);
      if (error) throw error;
      setLogs((current) => current.map((item) => item.id === log.id ? { ...item, is_parent_visible: true } : item));
      try {
        const result = await invokeActivityNotification('send-journal-notification', { body: { journalType: 'study', journalId: log.id } });
        if (result.error || result.data?.success !== true) throw result.error || result.data;
        alert(activityNotificationText(result.data,result.data.targetCount > 0 ? '학부모 앱에 일지를 공개하고 알림을 발송했습니다.' : '일지는 공개했지만 연결된 학부모 계정이 없어 알림 대상은 없습니다.'));
      } catch (error: unknown) { await handleError(error, 'JOURNAL_NOTIFICATION_FAILED', { operation: 'journal.study.publish.notify' }); }
    } catch (error: unknown) { await handleError(error, 'JOURNAL_SAVE_FAILED', { operation: 'journal.study.publish' }); }
    finally { setPublishingId(null); }
  };

  const deleteLog = async (id: string) => {
    if (!confirm('이 학습일지를 삭제하시겠습니까?')) return;
    try {
      const { error } = await supabase.from('academy_study_logs').delete().eq('id', id);
      if (error) throw error;
      setLogs((current) => current.filter((item) => item.id !== id));
      if (editingId === id) resetForm();
    } catch (error: unknown) { await handleError(error, 'JOURNAL_SAVE_FAILED', { operation: 'journal.study.delete' }); }
  };

  const exportExcel = async () => {
    try {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('원생별 학습일지', { views: [{ state: 'frozen', ySplit: 1 }] });
      sheet.columns = [{ header: '원생', key: 'student', width: 16 }, { header: '수업일자', key: 'date', width: 14 }, { header: '클래스', key: 'className', width: 18 }, { header: '담당선생님', key: 'teacher', width: 14 }, { header: '제목', key: 'title', width: 28 }, { header: '학습 내용', key: 'content', width: 45 }, { header: '숙제', key: 'homework', width: 30 }, { header: '특이사항', key: 'note', width: 30 }, { header: '학부모 공개', key: 'visible', width: 14 }];
      const names = new Map(students.map((item) => [item.id, item.student_name]));
      logs.forEach((item) => sheet.addRow({ student: item.student_id ? names.get(item.student_id) || '-' : '기존 반 전체', date: item.lesson_date, className: item.class_name, teacher: item.teacher_name, title: item.title, content: item.content, homework: item.homework || '-', note: item.special_note || '-', visible: item.is_parent_visible ? '공개' : '내부용' }));
      ['content', 'homework', 'note'].forEach((key) => { sheet.getColumn(key).alignment = { wrapText: true, vertical: 'top' }; });
      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `원생별_학습일지_${today()}.xlsx`; anchor.click(); URL.revokeObjectURL(url);
    } catch (error: unknown) { await handleError(error, 'JOURNAL_LOAD_FAILED', { operation: 'journal.study.export' }); }
  };

  const counts = new Map<string, number>();
  for (const log of logs) if (log.student_id) counts.set(log.student_id, (counts.get(log.student_id) || 0) + 1);

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="flex items-center gap-2 text-xl font-bold text-slate-900"><span className="grid size-9 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><BookOpen size={18} aria-hidden="true" /></span> 학습일지</h2><p className="mt-2 text-sm text-slate-600">원생을 선택해 학습 내용을 기록하고, 필요한 일지만 학부모에게 전달합니다.</p></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={exportExcel} className={journalButton}><Download size={15} aria-hidden="true" /> 엑셀 다운로드</button>
        <button type="button" onClick={loadData} disabled={loading || saving || Boolean(publishingId)} className={journalButton}><RefreshCw size={15} aria-hidden="true" className={loading ? 'animate-spin' : ''} /> 새로고침</button>
      </div>
    </header>

    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(15rem,19rem)_minmax(0,1fr)]">
      <JournalStudentPicker
        students={filteredStudents.map((student) => ({ id: student.id, name: student.student_name, code: student.attendance_code,
          summary: [getStudentSchedules(student)[0]?.target_class || '수업 미배정', student.parent_name].filter(Boolean).join(' · '),
          count: counts.get(student.id) || 0 }))}
        classes={uniqueClasses.map(String)} classFilter={classFilter} onClass={setClassFilter} search={studentSearch} onSearch={setStudentSearch}
        selectedId={studentId} total={students.length} loading={loading} disabled={saving || Boolean(publishingId)}
        onSelect={(id) => {
          if (id === studentId) return;
          if ((title.trim() || content.trim() || homework.trim() || note.trim()) && !confirm('작성 중인 일지가 있습니다. 다른 원생으로 이동할까요?')) return;
          const student = students.find((item) => item.id === id);
          if (student) { selectStudent(student); setHistorySearch(''); }
        }} />


      <div className="min-w-0 space-y-4">{selectedStudent ? <>
        <JournalSelection name={selectedStudent.student_name}
          description={[selectedClasses[0]?.target_class || '수업 미배정', selectedStudent.parent_name ? '보호자: ' + selectedStudent.parent_name : '보호자 정보 없음'].join(' · ')}
          count={counts.get(studentId) || 0} editorId={journalId + '-editor'} historyId={journalId + '-history'} />

        <form method="post" aria-labelledby={journalId + '-editor'} onSubmit={saveLog} className={journalPanel + ' space-y-4'}>
          <div className="flex items-center justify-between border-b border-slate-100 pb-3"><h4 id={journalId + '-editor'} tabIndex={-1} className="scroll-mt-24 text-base font-bold text-slate-950">{editingId ? '학습일지 수정' : '새 학습일지 작성'}</h4>{editingId && <button type="button" onClick={() => resetForm()} className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-slate-700">수정 취소</button>}</div>
          <fieldset className="min-w-0"><legend className="mb-2 text-sm font-bold text-slate-800">수업 정보</legend><div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><div><label htmlFor={journalId + '-date'} className={journalLabel}>수업 일자</label><input id={journalId + '-date'} name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={journalField} /></div><div><label htmlFor={journalId + '-class'} className={journalLabel}>수업 클래스</label><select id={journalId + '-class'} name="class" value={classId} onChange={(e) => { const found = selectedClasses.find((item: any) => item.id === e.target.value); setClassId(e.target.value); setClassName(found?.target_class || '미배정'); }} className={journalField}><option value="">미배정</option>{selectedClasses.map((item: any) => <option key={item.id} value={item.id}>{item.target_class}</option>)}</select></div><div><div className="mb-1 flex justify-between"><label htmlFor={journalId + '-teacher'} className={journalLabel}>담당 선생님</label><button type="button" onClick={() => { setCustomTeacher(!customTeacher); setTeacher(customTeacher ? profile?.name || '담당선생님' : ''); }} className="text-[10px] font-bold text-blue-600">{customTeacher ? '목록 선택' : '직접 입력'}</button></div>{customTeacher ? <input id={journalId + '-teacher'} name="teacher" value={teacher} onChange={(e) => setTeacher(e.target.value)} required placeholder="선생님 성함" className={journalField} /> : <select id={journalId + '-teacher'} name="teacher" value={teacher} onChange={(e) => setTeacher(e.target.value)} className={journalField}><option value={profile?.name || '담당선생님'}>{profile?.name || '담당선생님'} (현재 계정)</option>{teachers.filter((item) => item.name !== (profile?.name || '담당선생님')).map((item) => <option key={item.id} value={item.name}>{item.name} 선생님</option>)}</select>}</div></div></fieldset>
          <fieldset className="min-w-0 space-y-3 border-t border-slate-200 pt-3"><legend className="pr-2 text-sm font-bold text-slate-800">학습 기록</legend>
          <div><label htmlFor={journalId + '-title'} className={journalLabel}>일지 제목 *</label><input id={journalId + '-title'} name="title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="예: 오늘 수업 진도 및 학습 내용" className={journalField} /></div>
          <div><label htmlFor={journalId + '-content'} className={journalLabel}>학습 내용 및 수업 진도 *</label><textarea id={journalId + '-content'} name="content" rows={5} value={content} onChange={(e) => setContent(e.target.value)} required placeholder={`${selectedStudent.student_name} 원생의 수업 범위, 이해도, 참여도와 보완할 내용을 작성해주세요.`} className={journalField} /></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div><label htmlFor={journalId + '-homework'} className={journalLabel}>숙제 및 과제 (선택)</label><textarea id={journalId + '-homework'} name="homework" rows={3} value={homework} onChange={(e) => setHomework(e.target.value)} placeholder="예: 교재 20~22쪽 풀기, 오늘 배운 내용 복습하기" className={journalField} /></div><div><label htmlFor={journalId + '-note'} className={journalLabel}>원생 특이사항 (선택)</label><textarea id={journalId + '-note'} name="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 어려워한 부분은 다음 수업에서 추가 복습이 필요함" className={journalField} /></div></div>
          </fieldset>
          <JournalVisibility enabled={notifyParent} editing={Boolean(editingId)} disabled={saving}
            published={Boolean(logs.find((log) => log.id === editingId)?.is_parent_visible)} onChange={setNotifyParent} />
          <div className="flex justify-end"><button type="submit" disabled={saving || Boolean(publishingId)} className={journalPrimary}><Save size={15} aria-hidden="true" />{saving ? '저장 중...' : editingId ? notifyParent ? '수정 저장 + 다시 알림' : '알림 없이 수정 저장' : notifyParent ? '학부모 공개·알림과 함께 저장' : '학원 내부용으로 저장'}</button></div>
        </form>

        <section className={journalPanel + ' space-y-4'}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <h4 id={journalId + '-history'} tabIndex={-1} className="scroll-mt-24 text-base font-bold text-slate-950">학습 이력 <span className="text-sm font-medium text-slate-600">{studentLogs.length}건</span></h4>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <JournalSearch label="학습 이력 검색" placeholder="제목·내용 검색" value={historySearch} onChange={setHistorySearch} />
              <JournalSort sort={sort} toggle={() => setSort((current) => current === 'desc' ? 'asc' : 'desc')} />
            </div>
          </div>
          <div className="space-y-3">{studentLogs.length ? studentLogs.map((log) => (
            <JournalEntry key={log.id} title={log.title}
              context={<><time dateTime={log.lesson_date}>{log.lesson_date}</time><span>· {log.class_name}</span><span>· {log.teacher_name}</span><span>· {branches.find((branch) => branch.id === log.branch_id)?.name || '지점 미지정'}</span></>}
              visible={Boolean(log.is_parent_visible)} busy={saving || Boolean(publishingId)} publishing={publishingId === log.id}
              onEdit={() => editLog(log)} onDelete={() => void deleteLog(log.id)} onPublish={() => void publishLog(log)}>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800 [overflow-wrap:anywhere]">{log.content}</p>
              {(log.homework || log.special_note) && <div className="grid gap-2 sm:grid-cols-2">
                {([['숙제·과제', log.homework], ['특이사항', log.special_note]] as const).map(([label, value]) => value && <div key={label} className="min-w-0 rounded-xl bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-700">{label}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800 [overflow-wrap:anywhere]">{value}</p>
                </div>)}
              </div>}
            </JournalEntry>
          )) : <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">{historySearch.trim() ? '검색 조건에 맞는 학습일지가 없습니다.' : '등록된 학습일지가 없습니다.'}</p>}</div>
        </section>

        {legacyLogs.length > 0 && <details className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><summary className="cursor-pointer text-xs font-black text-amber-800">기존 반 전체 학습일지 {legacyLogs.length}건</summary><p className="mt-2 text-[11px] text-amber-700">원생별 기능 적용 전에 작성된 기록입니다. 수정할 때 대상 원생을 지정하면 개별 일지로 전환됩니다.</p><div className="mt-3 space-y-2">{legacyLogs.slice(0, 10).map((log) => <button key={log.id} onClick={() => editLog(log)} className="flex w-full justify-between rounded-xl border border-amber-200 bg-white px-3 py-2 text-left text-xs"><span className="truncate font-bold">{log.lesson_date} · {log.class_name} · {log.title}</span><span className="shrink-0 text-blue-600">원생 지정</span></button>)}</div></details>}
      </> : <div className="rounded-3xl border border-dashed border-slate-300 bg-white py-24 text-center"><BookOpen size={36} className="mx-auto mb-3 text-slate-300" /><p className="text-sm font-black text-slate-600">학습일지를 작성할 원생을 선택해주세요.</p><p className="mt-1 text-xs text-slate-400">원생 목록에서 원생을 선택하면 작성 화면과 과거 이력이 표시됩니다.</p></div>}</div>
    </div>
  </div>;
};
