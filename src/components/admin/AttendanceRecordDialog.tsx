import { useEffect, useId, type RefObject } from 'react';
import { CalendarCheck, Loader2 } from 'lucide-react';

export function AttendanceRecordDialog({ dialogRef, student, packageName, date, slot, linkedUsage, busy, onClose, onCancelAttendance }: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  student: string;
  packageName: string;
  date: string;
  slot: number;
  linkedUsage: boolean;
  busy: boolean;
  onClose: () => void;
  onCancelAttendance: () => void;
}) {
  const headingId = useId();
  const hintId = useId();
  const busyId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, [dialogRef]);

  return (
    <dialog ref={dialogRef} aria-labelledby={headingId} aria-busy={busy}
      onClose={onClose} onCancel={(event) => { if (busy) event.preventDefault(); }}
      className="fixed inset-x-0 top-auto bottom-0 mx-auto max-h-[85dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-2xl bg-white text-slate-900 shadow-2xl backdrop:overflow-hidden backdrop:overscroll-contain backdrop:bg-slate-950/55 sm:inset-0 sm:m-auto sm:rounded-2xl">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><CalendarCheck size={18} aria-hidden="true" /></span>
        <h3 id={headingId} className="text-lg font-bold text-slate-950">출석 기록 상세</h3>
      </header>
      <div className="space-y-4 p-5">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          {([
            ['원생', student], ['출석 일자', <time dateTime={date}>{date}</time>],
            ['이용권', packageName], ['장부 회차', slot + '회차'],
          ] as const).map(([label, value]) => <div key={label} className="min-w-0 rounded-lg bg-slate-50 px-3 py-2.5">
            <dt className="text-xs font-semibold text-slate-600">{label}</dt>
            <dd className="mt-1 font-semibold text-slate-950 [overflow-wrap:anywhere]">{value}</dd>
          </div>)}
        </dl>
        <p id={hintId} className="text-sm leading-relaxed text-slate-700">{linkedUsage
          ? '연결된 이용권 차감 기록이 있습니다. 출석을 취소하면 해당 횟수가 복구됩니다.'
          : '장부에 연결된 이용권 차감 기록이 표시되지 않습니다. 취소 시 복구 여부는 처리 결과에서 확인할 수 있습니다.'}</p>
        <p id={busyId} role="status" className="text-sm font-semibold text-slate-700">{busy ? '출석 취소 결과를 확인하는 중입니다.' : ''}</p>
      </div>
      <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
        <button type="button" autoFocus disabled={busy} onClick={() => dialogRef.current?.close()}
          className="min-h-10 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-semibold hover:bg-slate-100 disabled:opacity-50">닫기</button>
        <button type="button" disabled={busy} onClick={onCancelAttendance} aria-describedby={hintId + ' ' + busyId}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 text-sm font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-50">
          {busy && <Loader2 size={15} aria-hidden="true" className="motion-safe:animate-spin" />}
          출석 취소
        </button>
      </footer>
    </dialog>
  );
}
