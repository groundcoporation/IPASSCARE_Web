import { formatError, logError, normalizeAsyncError, type AppErrorCode, type ErrorContext } from "./appError";

export async function handleError(error: unknown, fallback: AppErrorCode, context: ErrorContext) {
  const normalized = await normalizeAsyncError(error, fallback);
  logError(normalized, context);
  window.alert(formatError(normalized));
  return normalized;
}
