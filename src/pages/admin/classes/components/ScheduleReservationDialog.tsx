import type { ScheduleSelection } from '../model/scheduleDisplay';

export function ScheduleReservationDialog({ selected, onClose }: { selected: ScheduleSelection; onClose: () => void }) {
  return (
        <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-xs sm:items-center sm:p-6" onClick={() => onClose()}>
          <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black tracking-widest text-blue-600">예약 명단</p>
                <h3 className="mt-1 text-xl font-black">{selected.schedule.target_class}</h3>
                <p className="mt-1 text-sm text-slate-500">{selected.date} · {selected.schedule.start_time.slice(0, 5)}~{selected.schedule.end_time.slice(0, 5)}</p>
              </div>
              <button onClick={() => onClose()} className="rounded-full bg-slate-100 px-3 py-2 text-sm font-black">닫기</button>
            </div>
            <div className="mb-4 flex items-center justify-between rounded-2xl bg-blue-50 px-4 py-3">
              <span className="text-sm font-bold text-blue-900">예약 인원</span>
              <b className="text-blue-700">{selected.reservations.length}{selected.schedule.max_people ? ` / ${selected.schedule.max_people}` : ""}명</b>
            </div>
            {selected.reservations.length ? (
              <div className="space-y-2">
                {selected.reservations.map((reservation, index) => (
                  <div key={reservation.id} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4">
                    <div className="min-w-0">
                      <p className="font-black">{index + 1}. {reservation.children?.child_name ?? "자녀 정보 없음"}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">보호자 {reservation.users?.name ?? "-"}{reservation.users?.phone ? ` · ${reservation.users.phone}` : ""}</p>
                    </div>
                    <div className="text-right">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{reservation.attendance_status ?? reservation.status ?? "예약"}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm font-bold text-slate-400">이 수업에 예약된 자녀가 없습니다.</div>
            )}
          </div>
        </div>
  );
}
