export interface BillingReminderMetadata {
  reminder_count: number;
  last_reminded_at: string | null;
}

// payment_requests and academy_bills have different primary keys.
// Copy only reminder fields, never the payment request's id or other columns.
export function withBillingReminder<T extends { id: string }>(
  bill: T,
  reminder: BillingReminderMetadata | undefined,
): T & Partial<BillingReminderMetadata> {
  if (!reminder) return bill;
  return {
    ...bill,
    reminder_count: reminder.reminder_count,
    last_reminded_at: reminder.last_reminded_at,
  };
}
