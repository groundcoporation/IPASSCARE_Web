import { useState } from 'react';
import type { ClassSchedule, ScheduleReservation } from '../model/weeklySchedule';
import { scheduleDays, normalizedScheduleDay, minuteOf, scheduleLocalDate, scheduleHours, currentScheduleSelection, type ScheduleSelection } from '../model/scheduleDisplay';
import { ScheduleReservationDialog } from '../components/ScheduleReservationDialog';

export function WeeklySchedule({ schedules, reservations, weekStart, showBranch, loading = false }: { schedules: ClassSchedule[]; reservations: ScheduleReservation[]; weekStart: Date; showBranch: boolean; loading?: boolean }) {
  const [selection, setSelected] = useState<ScheduleSelection | null>(null);
  const weekKey = scheduleLocalDate(weekStart);
  const selected = currentScheduleSelection(selection, schedules, reservations, weekKey, loading);
  const { startHour, endHour, hourHeight, calendarHeight } = scheduleHours(schedules);
  if (!schedules.length) return <div className="rounded-3xl bg-white p-16 text-center text-sm font-bold text-slate-400 shadow-sm ring-1 ring-slate-200">등록된 활성 시간표가 없습니다.</div>;

  return (
    <section className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-lg font-black">주간 수업 시간표</h2>
        <p className="mt-1 text-sm text-slate-500">DB에 등록된 활성 수업을 요일과 시간 순으로 표시합니다.</p>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[1050px]">
          <div className="grid grid-cols-[76px_repeat(7,minmax(130px,1fr))] border-b border-slate-200 bg-slate-50">
            <div className="p-4 text-center text-xs font-black text-slate-400">시간</div>
            {scheduleDays.map((day) => <div key={day} className="border-l border-slate-200 p-4 text-center font-black">{day}요일</div>)}
          </div>
          <div className="grid grid-cols-[76px_repeat(7,minmax(130px,1fr))]">
            <div className="relative border-r border-slate-200" style={{ height: calendarHeight }}>
              {Array.from({ length: endHour - startHour + 1 }, (_, index) => (
                <span key={index} className="absolute right-3 -translate-y-1/2 text-xs font-bold text-slate-400" style={{ top: index * hourHeight }}>
                  {String(startHour + index).padStart(2, "0")}:00
                </span>
              ))}
            </div>
            {scheduleDays.map((day, dayIndex) => (
              <div key={day} className="relative border-r border-slate-100 bg-[linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)]" style={{ height: calendarHeight, backgroundSize: `100% ${hourHeight}px` }}>
                {schedules.filter((item) => normalizedScheduleDay(item.day_of_week) === day).map((item, index) => {
                  const top = ((minuteOf(item.start_time) - startHour * 60) / 60) * hourHeight;
                  const height = Math.max(48, ((minuteOf(item.end_time) - minuteOf(item.start_time)) / 60) * hourHeight - 4);
                  const date = scheduleLocalDate(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + dayIndex));
                  const booked = reservations.filter((reservation) => reservation.schedule_id === item.id && reservation.class_date === date);
                  return (
                    <button type="button" disabled={loading} key={item.id} onClick={() => setSelected({ schedule: item, date, reservations: booked, sourceSchedules: schedules, sourceReservations: reservations, weekKey })} className="absolute left-1.5 right-1.5 overflow-hidden rounded-xl border border-blue-200 bg-blue-50 p-2.5 text-left shadow-sm transition hover:border-blue-500 hover:bg-blue-100" style={{ top: top + 2, height, marginLeft: index % 2 ? 5 : 0 }} title="예약자 확인">
                      <p className="truncate text-xs font-black text-blue-950">{item.target_class}</p>
                      <p className="mt-1 text-[11px] font-bold text-blue-700">{item.start_time.slice(0, 5)}~{item.end_time.slice(0, 5)}</p>
                      <p className="mt-1 text-[10px] font-black text-blue-600">예약 {booked.length}{item.max_people ? ` / ${item.max_people}` : ""}명</p>
                      {showBranch && <p className="mt-1 truncate text-[10px] text-slate-500">{item.branches?.name ?? item.branch_id ?? "지점 미지정"}</p>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      {selected && (
        <ScheduleReservationDialog selected={selected} onClose={() => setSelected(null)} />
      )}
    </section>
  );
}
