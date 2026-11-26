export const MAX_SLOTS = 30;
export const isCancelledReservation = (status: string | null | undefined) => ["cancelled", "canceled", "취소", "취소요청", "cancel_requested"].includes(status ?? "");
export const weeklyCount = (name: string | null) => Number(name?.match(/주\s*(\d+)\s*회/)?.[1]) || null;
export const excluded = (status: string | null) => /결석|보강/.test((status ?? "").replace(/\s/g, ""));
export const rangeOf = (month: string) => ({ from: `${month}-01`, to: `${month}-${String(new Date(+month.slice(0, 4), +month.slice(5, 7), 0).getDate()).padStart(2, "0")}` });
export const moveMonth = (month: string, amount: number) => { const date = new Date(+month.slice(0, 4), +month.slice(5, 7) - 1 + amount, 1); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; };
export const kstDateKey = (isoDate: string | null | undefined) => {
  if (!isoDate) return null;
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
};
export const isBeforeChildDeletion = (targetDate: string, deletedAt: string | null | undefined) => {
  const deletedDate = kstDateKey(deletedAt);
  return !deletedDate || targetDate < deletedDate;
};
