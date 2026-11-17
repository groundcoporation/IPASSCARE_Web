const PAGE_SIZE = 500;

export async function readAttendancePages<T>(
  read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; ) {
    const result = await read(from, from + PAGE_SIZE - 1);
    if (result.error) throw result.error;
    const page = result.data ?? [];
    if (!page.length) return rows;
    rows.push(...page);
    // Advance by the number returned, even if the API applies a lower page cap.
    from += page.length;
  }
}

export async function readAttendanceIdBatches<T>(ids: string[], read: (ids: string[]) => Promise<T[]>): Promise<T[]> {
  const rows: T[] = [];
  for (let index = 0; index < ids.length; index += 40) rows.push(...await read(ids.slice(index, index + 40)));
  return rows;
}
