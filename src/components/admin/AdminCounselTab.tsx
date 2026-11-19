import React, { useState, useEffect, useMemo, useCallback, useId } from 'react';
import { MessageSquare, RefreshCw, Save } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { loadActiveAppSchedulesByChild } from '../../lib/adminScheduleAssignments';
import { handleError } from '../../errors/handleError';
import { AppError } from '../../errors/appError';
import { focusJournalSection, JournalEntry, JournalSelection, JournalSort, JournalStudentPicker, JournalVisibility, journalButton, journalField, journalLabel, journalPanel, journalPrimary } from './JournalUi';

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
  is_parent_visible?: boolean;
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

export const AdminCounselTab: React.FC<AdminCounselTabProps> = ({ activeBranchId, branches, profile }) => {
  const [students, setStudents] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [counselLogs, setCounselLogs] = useState<CounselLog[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);

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
  const [sendParentNotification, setSendParentNotification] = useState<boolean>(false);
  const journalId = useId();

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

      const { data: stuData, error: studentError } = await query;
      if (studentError) throw studentError;
      const rawStudents = stuData || [];
      const schedulesByChild = await loadActiveAppSchedulesByChild(
        rawStudents.map((student: any) => student.child_id).filter(Boolean),
      );
      const stuList = rawStudents.map((student: any) => ({
        ...student,
        app_schedule_classes: student.child_id ? schedulesByChild.get(student.child_id) || [] : undefined,
      }));
      setStudents(stuList);

      setSelectedStudentId((current) => current ?? stuList[0]?.id ?? null);

      // 2. Fetch Teachers
      let teacherQuery = supabase.from('academy_teachers').select('id, name, phone');
      if (activeBranchId) {
        teacherQuery = teacherQuery.eq('branch_id', activeBranchId);
      }
      const { data: teacherData, error: teacherError } = await teacherQuery.order('name');
      if (teacherError) throw teacherError;
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
      if (logsError) throw logsError;
      setCounselLogs(logsData || []);
    } catch (error: unknown) {
      setStudents([]);
      setCounselLogs([]);
      await handleError(error, 'JOURNAL_LOAD_FAILED', { operation: 'journal.counsel.load' });
    } finally {
      setLoading(false);
    }
  }, [activeBranchId]);

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
    if (saving || publishingId) return;
    if (!selectedStudentId || !selectedStudent?.branch_id) {
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
        branch_id: selectedStudent.branch_id,
        student_id: selectedStudentId,
        counselor_name: counselorName.trim() || profile?.name || '관리자',
        counsel_date: counselDate,
        category: selectedCategory,
        content: counselContent.trim(),
        updated_at: new Date().toISOString()
      };

      if (editingLogId) {
        const existingLog = counselLogs.find((log) => log.id === editingLogId);
        const { data, error } = await supabase
          .from('academy_counsel_logs')
          .update({ ...payload, is_parent_visible: Boolean(existingLog?.is_parent_visible) || sendParentNotification })
          .eq('id', editingLogId)
          .select()
          .single();

        if (error) throw error;
        setCounselLogs(prev => prev.map(log => log.id === editingLogId ? data : log));
        setEditingLogId(null);
        if (sendParentNotification) {
          try {
            const { data: notificationResult, error: notificationError } = await supabase.functions.invoke(
              'send-journal-notification',
              { body: { journalType: 'counsel', journalId: data.id, notificationKind: 'updated' } },
            );
            if (notificationError || notificationResult?.success !== true) throw notificationError || notificationResult;
            alert(notificationResult.targetCount > 0
              ? '수정 내용을 저장하고 학부모에게 다시 알림을 보냈습니다.'
              : '수정 내용은 저장했지만 연결된 학부모 계정이 없어 알림 대상은 없습니다.');
          } catch (notificationError: unknown) {
            await handleError(notificationError, 'JOURNAL_NOTIFICATION_FAILED', { operation: 'journal.counsel.update-notification' });
          }
        } else {
          alert('상담일지를 알림 없이 수정했습니다.');
        }
      } else {
        const { data, error } = await supabase
          .from('academy_counsel_logs')
          .insert([{ ...payload, is_parent_visible: sendParentNotification }])
          .select()
          .single();

        if (error) throw error;
        if (!data) throw new Error('counsel log insert returned no data');
        setCounselLogs(prev => [data, ...prev]);

        if (sendParentNotification) {
          try {
            const { data: notificationResult, error: notificationError } = await supabase.functions.invoke(
              'send-journal-notification',
              { body: { journalType: 'counsel', journalId: data.id } },
            );
            if (notificationError || notificationResult?.success !== true) throw notificationError || notificationResult;
            alert(notificationResult.targetCount > 0
              ? '상담일지가 등록되고 학부모에게 알림이 발송되었습니다.'
              : '상담일지가 등록되었습니다. 연결된 학부모 계정이 없어 알림 대상은 없습니다.');
          } catch (notificationError: unknown) {
            await handleError(notificationError, 'JOURNAL_NOTIFICATION_FAILED', { operation: 'journal.counsel.notify' });
          }
        } else {
          alert('상담일지가 저장되었습니다. 학부모 알림은 발송하지 않았습니다.');
        }
      }

      setCounselContent('');
      setSelectedCategory('일반상담');
      setSendParentNotification(false);
    } catch (error: unknown) {
      await handleError(error, 'JOURNAL_SAVE_FAILED', { operation: 'journal.counsel.save' });
    } finally {
      setSaving(false);
    }
  };

  const handlePublishCounselLog = async (log: CounselLog) => {
    if (log.is_parent_visible || publishingId) return;
    if (!confirm('이 상담일지를 학부모 앱에 공개하고 알림을 보내시겠습니까?')) return;
    setPublishingId(log.id);
    try {
      const { data: published, error: publishError } = await supabase
        .from('academy_counsel_logs')
        .update({ is_parent_visible: true, updated_at: new Date().toISOString() })
        .eq('id', log.id).eq('is_parent_visible', false).select('id').maybeSingle();
      if (publishError) throw publishError;
      if (!published) throw new AppError('CONFLICT_ERROR');

      setCounselLogs(prev => prev.map(item => item.id === log.id ? { ...item, is_parent_visible: true } : item));
      try {
        const { data, error } = await supabase.functions.invoke('send-journal-notification', {
          body: { journalType: 'counsel', journalId: log.id },
        });
        if (error || data?.success !== true) throw error || data;
        alert(data.targetCount > 0
          ? '학부모 앱에 일지를 공개하고 알림을 발송했습니다.'
          : '일지는 공개했지만 연결된 학부모 계정이 없어 알림 대상은 없습니다.');
      } catch (notificationError: unknown) {
        await handleError(notificationError, 'JOURNAL_NOTIFICATION_FAILED', { operation: 'journal.counsel.publish.notify' });
      }
    } catch (error: unknown) {
      await handleError(error, 'JOURNAL_SAVE_FAILED', { operation: 'journal.counsel.publish' });
    } finally {
      setPublishingId(null);
    }
  };

  // Handle Edit Click
  const handleEditClick = (log: CounselLog) => {
    setSendParentNotification(false);
    setEditingLogId(log.id);
    setCounselDate(log.counsel_date);
    setCounselorName(log.counselor_name);
    setSelectedCategory(log.category);
    setCounselContent(log.content);
    focusJournalSection(journalId + '-editor');
  };

  // Handle Delete Click
  const handleDeleteClick = async (logId: string) => {
    if (!confirm('이 상담일지 기록을 삭제하시겠습니까?')) return;
    try {
      const { data, error } = await supabase.from('academy_counsel_logs').delete().eq('id', logId).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new AppError('CONFLICT_ERROR');
      setCounselLogs(prev => prev.filter(log => log.id !== logId));
      if (editingLogId === logId) {
        setEditingLogId(null);
        setCounselContent('');
      }
    } catch (error: unknown) {
      await handleError(error, 'JOURNAL_SAVE_FAILED', { operation: 'journal.counsel.delete' });
    }
  };

  const counts = new Map<string, number>();
  for (const log of counselLogs) counts.set(log.student_id, (counts.get(log.student_id) || 0) + 1);
  const editorId = journalId + '-editor';
  const historyId = journalId + '-history';

  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-950"><span className="grid size-9 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><MessageSquare size={18} aria-hidden="true" /></span> 상담일지</h2>
        <p className="mt-2 text-sm text-slate-600">원생별 상담 내용과 보호자 요청을 기록하고, 필요한 일지만 공유합니다.</p>
      </div>
      <button type="button" onClick={loadData} disabled={loading || saving || Boolean(publishingId)} className={journalButton}><RefreshCw size={15} aria-hidden="true" className={loading ? 'animate-spin' : ''} /> 새로고침</button>
    </header>
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(15rem,19rem)_minmax(0,1fr)]">
      <JournalStudentPicker students={filteredStudents.map((student) => {
        const firstClass = (student.child_id ? student.app_schedule_classes?.[0] : student.academy_student_classes?.[0]?.class_schedules)?.target_class;
        return { id: student.id, name: student.student_name, code: student.attendance_code,
          summary: [firstClass || '수업 미배정', student.parent_name].filter(Boolean).join(' · '), count: counts.get(student.id) || 0 };
      })} selectedId={selectedStudentId} total={students.length} loading={loading} disabled={saving || Boolean(publishingId)}
        classes={uniqueClasses.map(String)} classFilter={selectedClassFilter} onClass={setSelectedClassFilter} search={search} onSearch={setSearch}
        onSelect={(id) => {
          if (id === selectedStudentId) return;
          if (counselContent.trim() && !confirm('작성 중인 일지가 있습니다. 다른 원생으로 이동할까요?')) return;
          setSelectedStudentId(id); setEditingLogId(null); setCounselContent(''); setSendParentNotification(false);
          setHistoryCategoryFilter('all');
        }} />
      <div className="min-w-0 space-y-4">
        {selectedStudent ? <>
          <JournalSelection name={selectedStudent.student_name}
            description={[selectedStudent.parent_name ? '보호자: ' + selectedStudent.parent_name : '보호자 정보 없음', selectedStudent.mother_phone || selectedStudent.father_phone || '연락처 없음'].join(' · ')}
            count={counts.get(selectedStudent.id) || 0} editorId={editorId} historyId={historyId} />
          <form method="post" aria-labelledby={editorId} onSubmit={handleSaveCounsel} className={journalPanel + ' space-y-4'}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <h4 id={editorId} tabIndex={-1} className="scroll-mt-24 text-base font-bold text-slate-950">{editingLogId ? '상담일지 수정' : '새 상담일지 작성'}</h4>
              {editingLogId && <button type="button" disabled={saving} onClick={() => {
                setEditingLogId(null); setCounselContent(''); setSelectedCategory('일반상담'); setSendParentNotification(false);
              }} className={journalButton}>수정 취소</button>}
            </div>
            <fieldset className="min-w-0">
              <legend className="mb-2 text-sm font-bold text-slate-800">상담 정보</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="min-w-0"><label htmlFor={journalId + '-date'} className={journalLabel}>상담 일자</label>
                  <input id={journalId + '-date'} name="counsel_date" type="date" value={counselDate} onChange={(event) => setCounselDate(event.target.value)} required className={journalField} /></div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-x-1">
                    <label htmlFor={journalId + '-counselor'} className={journalLabel}>상담자</label>
                    <button type="button" onClick={() => { setIsCustomCounselor(!isCustomCounselor); setCounselorName(isCustomCounselor ? profile?.name || '관리자' : ''); }}
                      className="mb-1.5 text-xs font-semibold text-indigo-800 underline-offset-2 hover:underline">{isCustomCounselor ? '목록 선택' : '직접 입력'}</button>
                  </div>
                  {isCustomCounselor ? <input id={journalId + '-counselor'} name="counselor" value={counselorName} onChange={(event) => setCounselorName(event.target.value)} required className={journalField} />
                    : <select id={journalId + '-counselor'} name="counselor" value={counselorName} onChange={(event) => setCounselorName(event.target.value)} className={journalField}>
                      <option value={profile?.name || '관리자'}>{profile?.name || '관리자'} (현재 계정)</option>
                      {teachers.filter((item) => item.name !== (profile?.name || '관리자')).map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
                    </select>}
                </div>
                <div className="min-w-0"><label htmlFor={journalId + '-category'} className={journalLabel}>상담 구분</label>
                  <select id={journalId + '-category'} name="counsel_category" value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)} className={journalField}>
                    {COUNSEL_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select></div>
              </div>
            </fieldset>
            <div>
              <label htmlFor={journalId + '-content'} className={journalLabel}>상담 내용 *</label>
              <textarea id={journalId + '-content'} name="counsel_content" rows={5} value={counselContent} onChange={(event) => setCounselContent(event.target.value)}
                required placeholder="상담 내용과 후속 조치가 필요한 사항을 기록하세요." className={journalField + ' resize-y leading-relaxed'} />
            </div>
            <JournalVisibility enabled={sendParentNotification} editing={Boolean(editingLogId)} disabled={saving}
              published={Boolean(counselLogs.find((log) => log.id === editingLogId)?.is_parent_visible)} onChange={setSendParentNotification} />
            <div className="flex justify-end"><button type="submit" disabled={saving || Boolean(publishingId)} className={journalPrimary}><Save size={15} aria-hidden="true" />
              {saving ? '저장 중…' : sendParentNotification ? '저장하고 알림 보내기' : editingLogId ? '알림 없이 수정 저장' : '내부용으로 저장'}
            </button></div>
          </form>
          <section className={journalPanel + ' space-y-3'}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <h4 id={historyId} tabIndex={-1} className="scroll-mt-24 text-base font-bold text-slate-950">상담 이력 <span className="text-sm font-medium text-slate-600">{studentLogs.length}건</span></h4>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <select aria-label="상담 이력 구분" value={historyCategoryFilter} onChange={(event) => setHistoryCategoryFilter(event.target.value)}
                  className={journalField + ' w-auto max-w-full'}>
                  <option value="all">전체 구분</option>{COUNSEL_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
                <JournalSort sort={historySortOrder} toggle={() => setHistorySortOrder((current) => current === 'desc' ? 'asc' : 'desc')} />
              </div>
            </div>
            {studentLogs.length ? studentLogs.map((log) => {
              const category = COUNSEL_CATEGORIES.find((item) => item.id === log.category);
              return <JournalEntry key={log.id} title={category?.label || log.category}
                context={<><time dateTime={log.counsel_date}>{log.counsel_date}</time><span>· {log.counselor_name}</span><span>· {branches.find((branch) => branch.id === log.branch_id)?.name || '지점 미지정'}</span></>}
                visible={Boolean(log.is_parent_visible)} busy={saving || Boolean(publishingId)} publishing={publishingId === log.id}
                onEdit={() => handleEditClick(log)} onDelete={() => void handleDeleteClick(log.id)} onPublish={() => void handlePublishCounselLog(log)}>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800 [overflow-wrap:anywhere]">{log.content}</p>
              </JournalEntry>;
            }) : <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">{historyCategoryFilter === 'all' ? '등록된 상담일지가 없습니다.' : '선택한 구분에 해당하는 상담일지가 없습니다.'}</p>}
          </section>
        </> : <div className={journalPanel + ' py-12 text-center text-sm text-slate-600'}>원생을 선택하면 상담일지 작성과 이력을 볼 수 있습니다.</div>}
      </div>
    </div>
  </div>;
};
