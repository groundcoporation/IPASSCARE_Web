export const billingMonthPeriod = (billMonth: string) => {
  const start = `${billMonth}-01`;
  const end = new Date(
    Date.UTC(Number(billMonth.slice(0, 4)), Number(billMonth.slice(5, 7)), 0),
  ).toISOString().slice(0, 10);
  return { start, end };
};
