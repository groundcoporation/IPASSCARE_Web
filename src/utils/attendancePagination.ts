export const ATTENDANCE_PAGE_SIZES = [20, 50] as const;
export type AttendancePageSize = typeof ATTENDANCE_PAGE_SIZES[number];

export function paginateAttendance<T>(rows: readonly T[], requestedPage: number, pageSize: AttendancePageSize) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const offset = (page - 1) * pageSize;
  return {
    page,
    totalPages,
    first: rows.length ? offset + 1 : 0,
    last: Math.min(offset + pageSize, rows.length),
    rows: rows.slice(offset, offset + pageSize),
  };
}
