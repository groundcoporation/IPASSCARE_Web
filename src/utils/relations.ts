export const firstJoined = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value;
