import { useId, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, BellRing, ChevronRight, LockKeyhole, Pencil, Search, Trash2, Users } from 'lucide-react';

export const journalPanel = 'min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5';
export const journalField = 'min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-700 sm:text-sm';
export const journalLabel = 'mb-1.5 block text-sm font-semibold text-slate-700';
export const journalButton = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';
export const journalPrimary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-50';

export function focusJournalSection(id: string) {
  const heading = document.getElementById(id);
  heading?.focus({ preventScroll: true });
  heading?.scrollIntoView({ block: 'start' });
}

export function JournalSearch({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (value: string) => void; placeholder: string;
}) {
  return <div className="relative min-w-0 flex-1">
    <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
    <input type="search" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder} className={journalField + ' pl-9'} />
  </div>;
}

type JournalStudent = { id: string; name: string; code?: string; summary: string; count: number };

export function JournalStudentPicker({ students, selectedId, total, loading, disabled, classes, classFilter, search, onClass, onSearch, onSelect }: {
  students: JournalStudent[]; selectedId: string | null; total: number; loading: boolean; disabled: boolean;
  classes: string[]; classFilter: string; search: string;
  onClass: (value: string) => void; onSearch: (value: string) => void; onSelect: (id: string) => void;
}) {
  const id = useId();
  return <aside aria-label="기록할 원생 선택" className={journalPanel + ' space-y-3'}>
    <h3 className="flex items-center gap-2 text-base font-bold text-slate-950"><Users size={17} aria-hidden="true" className="text-indigo-700" /> 원생 선택</h3>
    <div>
      <label htmlFor={id} className={journalLabel}>수업반</label>
      <select id={id} value={classFilter} onChange={(event) => onClass(event.target.value)} className={journalField}>
        <option value="all">전체 수업반 ({total}명)</option>
        {classes.map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
    </div>
    <JournalSearch label="원생 검색" placeholder="원생명, 출결번호, 보호자" value={search} onChange={onSearch} />
    <div className="flex justify-between gap-1 text-xs font-semibold text-slate-600"><span>검색 결과 {students.length}명</span><span>일지 건수</span></div>
    {loading && !students.length ? <p role="status" className="py-5 text-sm text-slate-600">원생을 불러오는 중입니다.</p>
      : students.length ? <ul className="max-h-60 space-y-1 overflow-y-auto lg:max-h-[34rem]">
        {students.map((student) => <li key={student.id}>
          <button type="button" aria-pressed={student.id === selectedId} disabled={disabled} onClick={() => onSelect(student.id)}
            className="flex min-h-12 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-transparent px-3 py-2 text-left hover:bg-slate-50 aria-pressed:border-indigo-200 aria-pressed:bg-indigo-50 disabled:opacity-60">
            <span className="min-w-0">
              <span className="block text-sm font-bold text-slate-950 [overflow-wrap:anywhere]">{student.name} {student.code && <span className="text-xs font-medium tabular-nums text-slate-600">#{student.code}</span>}</span>
              <span className="mt-0.5 block truncate text-xs text-slate-600" title={student.summary}>{student.summary}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums text-slate-700">{student.count}건<ChevronRight size={14} aria-hidden="true" /></span>
          </button>
        </li>)}
      </ul> : <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
        <p>{search.trim() || classFilter !== 'all' ? '조건에 맞는 원생이 없습니다.' : '등록된 원생이 없습니다.'}</p>
        {(search.trim() || classFilter !== 'all') && <button type="button" onClick={() => { onSearch(''); onClass('all'); }}
          className="mt-2 font-semibold text-indigo-800 underline underline-offset-2">검색·필터 초기화</button>}
      </div>}
  </aside>;
}

export function JournalSelection({ name, description, count, editorId, historyId }: {
  name: string; description: ReactNode; count: number; editorId: string; historyId: string;
}) {
  return <section className={journalPanel + ' space-y-3 border-indigo-100 bg-indigo-50/40'}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-indigo-800">선택한 원생</p>
        <h3 className="mt-1 text-xl font-bold text-slate-950 [overflow-wrap:anywhere]">{name}</h3>
        <p className="mt-1 text-sm text-slate-700 [overflow-wrap:anywhere]">{description}</p>
      </div>
      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-indigo-900 ring-1 ring-indigo-100">일지 {count}건</span>
    </div>
    <div className="flex flex-wrap gap-2 border-t border-indigo-100 pt-3">
      <button type="button" onClick={() => focusJournalSection(editorId)} className={journalButton}><Pencil size={14} aria-hidden="true" /> 일지 작성으로</button>
      <button type="button" onClick={() => focusJournalSection(historyId)} className={journalButton}>이력 바로 보기</button>
    </div>
  </section>;
}

export function JournalVisibility({ enabled, editing, published, disabled, onChange }: {
  enabled: boolean; editing: boolean; published: boolean; disabled: boolean; onChange: (value: boolean) => void;
}) {
  const id = useId();
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
    <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold text-slate-900">
      <input type="checkbox" checked={enabled} disabled={disabled} aria-describedby={id}
        onChange={(event) => onChange(event.target.checked)} className="size-5 shrink-0 accent-indigo-700 disabled:opacity-50" />
      {editing && published ? '학부모에게 수정 알림 다시 보내기' : '학부모 앱에 공개하고 알림 보내기'}
    </label>
    <p id={id} className="pl-7 text-sm text-slate-700">{enabled ? '저장 시 학부모 앱에 일지가 공개되며, 연결된 계정에 알림을 보냅니다.'
      : published ? '기존 공개 상태는 유지하고 새 알림은 보내지 않습니다.'
      : '학원 내부에만 저장합니다. 필요하면 이력에서 나중에 공개할 수 있습니다.'}</p>
  </div>;
}

export function JournalSort({ sort, toggle }: { sort: 'asc' | 'desc'; toggle: () => void }) {
  return <button type="button" onClick={toggle} className={journalButton}>
    {sort === 'desc' ? <ArrowDown size={15} aria-hidden="true" /> : <ArrowUp size={15} aria-hidden="true" />}
    {sort === 'desc' ? '최신순' : '과거순'}
  </button>;
}

export function JournalEntry({ title, context, visible, busy, publishing, onPublish, onEdit, onDelete, children }: {
  title: string; context: ReactNode; visible: boolean; busy: boolean; publishing: boolean; onPublish: () => void; onEdit: () => void; onDelete: () => void; children: ReactNode;
}) {
  return <article className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h5 className="text-base font-bold text-slate-950 [overflow-wrap:anywhere]">{title}</h5>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 [overflow-wrap:anywhere]">{context}</div>
      </div>
      <span className={'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ' + (visible ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-100 text-slate-700')}>
        {visible ? '학부모 공개' : <><LockKeyhole size={12} aria-hidden="true" /> 학원 내부용</>}
      </span>
    </div>
    {children}
    <div className="flex flex-wrap items-center justify-end gap-1.5 border-t border-slate-100 pt-3">
      {!visible && <button type="button" disabled={busy} onClick={onPublish} className={journalButton + ' hover:text-indigo-800'}>
        <BellRing size={14} aria-hidden="true" /> {publishing ? '전송 중' : '학부모에게 보내기'}
      </button>}
      <button type="button" disabled={busy} onClick={onEdit} aria-label={title + ' 수정'} className={journalButton}><Pencil size={14} aria-hidden="true" /> 수정</button>
      <button type="button" disabled={busy} onClick={onDelete} aria-label={title + ' 삭제'}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-slate-700 hover:bg-rose-50 hover:text-rose-800 disabled:opacity-50"><Trash2 size={14} aria-hidden="true" /> 삭제</button>
    </div>
  </article>;
}
