/** Shared error contract. Keep app/web copies identical; never show raw server messages. */
export const errorMessages = {
  UNKNOWN_ERROR: "작업을 완료하지 못했습니다. 상태를 확인해 주세요.",
  AUTH_REQUIRED: "다시 로그인해 주세요.",
  PERMISSION_DENIED: "이 작업을 처리할 권한이 없습니다.",
  NETWORK_ERROR: "서버 응답을 확인하지 못했습니다. 처리 내역을 확인한 후 다시 시도해 주세요.",
  SERVER_UPDATE_REQUIRED: "서버 업데이트가 필요합니다. 관리자에게 문의해 주세요.",
  CONFLICT_ERROR: "정보가 변경되었거나 이미 처리되었습니다. 최신 상태를 확인해 주세요.",
  ATT_CHILD_INVALID: "현재 지점의 재원 자녀가 아닙니다. 다시 검색해 주세요.",
  ATT_RESERVATION_INVALID: "예약 정보가 변경되었습니다. 다시 검색해 주세요.",
  ATT_TOO_SOON: "등원 처리 후 1분이 지나야 하원 처리할 수 있습니다.",
  ATT_SAVE_FAILED: "출결을 완료하지 못했습니다. 상태를 다시 조회한 후 시도해 주세요.",
  ATT_UPDATE_REQUIRED: "출결 서버 업데이트가 필요합니다. 관리자에게 문의해 주세요.",
  ATT_NOTIFICATION_FAILED: "출결은 저장되었지만 알림을 전송하지 못했습니다. 출결을 다시 누르지 마세요.",
  BILL_CREATE_FAILED: "청구서 처리를 완료하지 못했습니다. 일부 생성되었을 수 있으니 청구내역을 먼저 확인해 주세요.",
  BILL_SEND_FAILED: "청구서 발송 결과를 확인하지 못했습니다. 청구내역을 확인한 후 다시 시도해 주세요.",
  BILL_NOTIFICATION_FAILED: "청구서는 저장되었지만 알림을 보내지 못했습니다. 청구서를 다시 만들지 말고 납부 알림을 이용해 주세요.",
  BILL_REMINDER_FAILED: "납부 알림 처리 결과를 확인하지 못했습니다. 발송 내역을 확인하고 즉시 반복 발송하지 마세요.",
  BILL_DELETE_FAILED: "청구서를 삭제하지 못했습니다. 결제 여부와 최신 상태를 확인해 주세요.",
  BILL_FREE_FAILED: "무료 처리 결과를 확인하지 못했습니다. 청구내역과 지급 이용권을 먼저 확인해 주세요.",
  BILL_SETTING_FAILED: "자동 청구 설정을 저장하지 못했습니다. 설정을 다시 조회해 주세요.",
  BILL_NOT_FOUND: "청구서를 찾을 수 없습니다.",
  BILL_NOT_FREE: "앱 발송 전인 미납 0원 청구서만 무료 처리할 수 있습니다.",
  BILL_PAYMENT_EXISTS: "기존 결제 또는 결제 예정 내역을 먼저 확인해 주세요.",
  BILL_STUDENT_INVALID: "학생의 지점 정보를 확인해 주세요.",
  BILL_CHILD_INVALID: "재원 자녀 정보를 확인해 주세요.",
  BILL_PARENT_INVALID: "활성 학부모 계정 연결이 필요합니다.",
  BILL_OPTION_INVALID: "지점의 이용권 옵션을 확인해 주세요.",
  BILL_MONTH_INVALID: "청구 월을 확인해 주세요.",
  PAYMENT_SAVE_FAILED: "수납 등록 결과를 확인하지 못했습니다. 결제 내역을 먼저 확인하고 중복 등록하지 마세요.",
  PAYMENT_CONFIRM_PENDING: "결제 예정 내역은 등록됐지만 수납 완료 결과를 확인하지 못했습니다. 기존 내역을 확인하고 새 결제를 등록하지 마세요.",
  PAYMENT_PACKAGE_PENDING: "수납은 완료됐지만 이용권 지급을 확인하지 못했습니다. 다시 결제하지 말고 지급 내역을 확인해 주세요.",
} as const;

export type AppErrorCode = keyof typeof errorMessages;
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly userMessage: string;
  constructor(code: AppErrorCode, cause?: unknown) {
    super(errorMessages[code], { cause });
    this.name = "AppError";
    this.code = code;
    this.userMessage = errorMessages[code];
  }
}
function field(value: unknown, key: string): unknown {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}
function knownCode(value: unknown): value is AppErrorCode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(errorMessages, value);
}
export function normalizeError(error: unknown, fallback: AppErrorCode = "UNKNOWN_ERROR"): AppError {
  if (error instanceof AppError) return error;
  const message = field(error, "message");
  const marker = typeof message === "string" ? message.match(/^\[([A-Z_]+)\]/)?.[1] : undefined;
  const code = field(error, "code");
  if (knownCode(code)) return new AppError(code, error);
  if (knownCode(marker)) return new AppError(marker, error);
  const status = field(error, "status") ?? field(field(error, "context"), "status");
  if (status === 401 || code === "PGRST301") return new AppError("AUTH_REQUIRED", error);
  if (status === 403 || code === "42501") return new AppError("PERMISSION_DENIED", error);
  if (["PGRST202", "PGRST204", "42703", "42883"].includes(String(code))) return new AppError("SERVER_UPDATE_REQUIRED", error);
  if (code === "23505" || status === 409) return new AppError("CONFLICT_ERROR", error);
  // Preserve domain-specific warnings about possibly committed writes.
  if (fallback === "UNKNOWN_ERROR" && typeof message === "string" && /failed to fetch|network request failed|networkerror|timeout/i.test(message)) {
    return new AppError("NETWORK_ERROR", error);
  }
  return new AppError(fallback, error);
}
export function formatError(error: AppError): string {
  return `[${error.code}] ${error.userMessage}`;
}
export interface ErrorContext {
  operation: string;
  transactionId?: string;
}
export function logError(error: AppError, context: ErrorContext): void {
  // Allowlist only. Do not log cause, raw body, token, name, phone, or email.
  console.error("[AppError]", {
    code: error.code,
    operation: /^[a-zA-Z0-9_.-]{1,80}$/.test(context.operation) ? context.operation : "unknown",
    transactionId: context.transactionId && /^[0-9a-f-]{36}$/i.test(context.transactionId) ? context.transactionId : undefined,
  });
}
/** Decode structured Edge errors without trusting server-provided user text. */
export async function normalizeAsyncError(error: unknown, fallback: AppErrorCode): Promise<AppError> {
  if (error instanceof AppError) return error;
  const context = field(error, "context");
  if (context && typeof field(context, "clone") === "function") {
    try {
      const response = context as { clone(): { json(): Promise<unknown> }; status?: number };
      const body = await response.clone().json();
      const bodyCode = field(body, "code");
      const nestedCode = field(field(body, "error"), "code");
      if (knownCode(bodyCode) || knownCode(nestedCode)) return new AppError(knownCode(bodyCode) ? bodyCode : nestedCode as AppErrorCode, error);
      return normalizeError({ code: bodyCode, message: field(body, "error") ?? field(body, "message"), status: response.status }, fallback);
    } catch {
      // Non-JSON responses are normalized using the original status below.
    }
  }
  return normalizeError(error, fallback);
}
