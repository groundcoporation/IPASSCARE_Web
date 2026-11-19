import { useEffect, useId, useRef, useState } from 'react';
import { Archive, CheckCircle2, Loader2 } from 'lucide-react';

interface StudentArchiveDialogProps {
  student: { name: string; branchName: string; appLinked: boolean; fromEditor: boolean };
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

export function StudentArchiveDialog({ student, busy, onClose, onConfirm }: StudentArchiveDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const reasonId = useId();
  const nameId = useId();
  const [reason, setReason] = useState('수강 종료');
  const [confirmedName, setConfirmedName] = useState('');
  const canSubmit = Boolean(confirmedName.trim() && reason.trim()) && student.name.trim() === confirmedName.trim();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      cancelButtonRef.current?.focus();
    }
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClose={onClose}
      onCancel={(event) => { if (busy) event.preventDefault(); }}
      className="fixed inset-0 m-auto max-h-[88dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto overscroll-contain rounded-3xl border border-slate-200 bg-white p-0 text-left shadow-2xl backdrop:overflow-hidden backdrop:overscroll-contain backdrop:bg-slate-950/55"
    >
      <header className="border-b border-amber-100 bg-amber-50 px-5 py-4 sm:px-6">
        <p className="flex items-center gap-2 text-xs font-bold text-amber-900"><Archive size={16} aria-hidden="true" /> 학생 관리</p>
        <h2 id={titleId} className="mt-1.5 text-xl font-black text-slate-950">탈퇴 처리</h2>
        <p id={descriptionId} className="mt-1 text-sm leading-relaxed text-slate-700">
          원생 정보는 삭제하지 않습니다. 처리 후 탈퇴 이력에서 확인할 수 있습니다.
        </p>
      </header>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit && !busy) onConfirm(reason.trim());
      }} aria-busy={busy}>
        <div className="space-y-4 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-200 px-3 py-2.5">
            <p className="min-w-0 break-words text-sm font-bold text-slate-950">{student.name}</p>
            <p className="text-xs text-slate-600">{student.branchName} · {student.appLinked ? '앱 연결 원생' : '웹 등록 원생'}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <section className="rounded-xl bg-amber-50 p-3">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-amber-900"><Archive size={15} aria-hidden="true" /> 종료되는 항목</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-700">재원 명부와 신규 청구 대상에서 제외됩니다.{student.appLinked && ' 남은 이용권과 미사용 예약도 정리됩니다.'}</p>
            </section>
            <section className="rounded-xl bg-emerald-50 p-3">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-emerald-900"><CheckCircle2 size={15} aria-hidden="true" /> 보존되는 기록</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-700">기존 청구·수납, 출결, 학습·상담일지는 그대로 남습니다.</p>
            </section>
          </div>
          {student.fromEditor && <p className="text-xs text-slate-600">학생 상세 화면에서 저장하지 않은 변경은 함께 저장되지 않습니다.</p>}
          <div className="space-y-1">
            <label htmlFor={reasonId} className="block text-sm font-semibold text-slate-800">탈퇴 사유</label>
            <input id={reasonId} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} required readOnly={busy}
              className="min-h-10 w-full rounded-xl border border-slate-300 px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600" />
          </div>
          <div className="space-y-1">
            <label htmlFor={nameId} className="block text-sm font-semibold text-slate-800">대상 확인: 원생 이름을 그대로 입력</label>
            <input id={nameId} value={confirmedName} onChange={(event) => setConfirmedName(event.target.value)} required readOnly={busy} autoComplete="off"
              className="min-h-10 w-full rounded-xl border border-slate-300 px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600" />
          </div>
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3 sm:px-6">
          {busy && <span role="status" className="mr-auto self-center text-xs text-slate-600">탈퇴 처리 결과를 확인하는 중입니다.</span>}
          <button ref={cancelButtonRef} type="button" disabled={busy} onClick={() => dialogRef.current?.close()}
            className="min-h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50">돌아가기</button>
          <button type="submit" disabled={!canSubmit || busy}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-rose-700 px-4 text-sm font-bold text-white hover:bg-rose-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 disabled:bg-slate-300 disabled:text-slate-700">
            {busy && <Loader2 size={15} className="motion-safe:animate-spin" aria-hidden="true" />}{busy ? '탈퇴 처리 중…' : '탈퇴 처리 완료'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
