import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError, normalizeAsyncError } from '../../../../errors/appError.ts';

type Dependencies = { client: Pick<SupabaseClient, 'functions'> };
export interface BillDeliveryResult {
  created: number;
  skipped: number;
  sent: number;
  pushAccepted: number;
  appOnly: number;
  failed: number;
  unconfirmed: number;
  confirmedIds: string[];
  errors: AppError[];
}
const isUuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : null;

/** One request only. Unknown/partial delivery must be checked before another send. */
async function deliver(ids: string[], mode: 'bills' | 'reminders', { client }: Dependencies): Promise<BillDeliveryResult> {
  const fallback = mode === 'bills' ? 'BILL_SEND_FAILED' : 'BILL_REMINDER_FAILED';
  const unique = [...new Set(ids)];
  try {
    if (!unique.length || unique.length > 100 || !unique.every(isUuid)) throw new AppError('INPUT_INVALID');
    const { data, error } = await client.functions.invoke(mode === 'bills' ? 'send-academy-bills' : 'send-payment-reminders', {
      body: mode === 'bills' ? { academy_bill_ids: unique } : { payment_request_ids: unique },
    });
    if (error) throw await normalizeAsyncError(error, fallback);
    const response = record(data);
    if (!response || !Array.isArray(response.results)) throw new AppError(fallback);
    const key = mode === 'bills' ? 'bill_id' : 'payment_request_id';
    const rows = response.results.map(record);
    const result: BillDeliveryResult = { created: 0, skipped: 0, sent: 0, pushAccepted: 0, appOnly: 0, failed: 0, unconfirmed: 0, confirmedIds: [], errors: [] };
    // Do not let unknown/duplicate IDs or aggregate counters masquerade as confirmed sends.
    if (rows.some(row => !row || !unique.includes(String(row[key])))) throw new AppError(fallback);
    for (const id of unique) {
      const matches = rows.filter(row => row?.[key] === id);
      const row = matches.length === 1 ? matches[0] : null;
      if (!row || typeof row.success !== 'boolean') { result.unconfirmed++; continue; }
      if (!row.success) {
        result.failed++;
        // Local catalog only; raw error/warning text may contain private data.
        result.errors.push(normalizeError({ code: row.code }, fallback));
        continue;
      }
      if (mode === 'bills') {
        if (typeof row.created !== 'boolean' || !isUuid(row.payment_request_id)) { result.unconfirmed++; continue; }
        if (row.created) result.created++; else result.skipped++;
      } else {
        if (typeof row.push_sent !== 'boolean') { result.unconfirmed++; continue; }
        result.sent++;
        if (row.push_sent) result.pushAccepted++; else result.appOnly++;
      }
      result.confirmedIds.push(id);
    }
    if (result.unconfirmed) result.errors.push(new AppError(fallback));
    return result;
  } catch (error: unknown) {
    throw normalizeError(error, fallback);
  }
}

export const sendBillsToApp = (ids: string[], dependencies: Dependencies) => deliver(ids, 'bills', dependencies);
export const sendPaymentReminders = (ids: string[], dependencies: Dependencies) => deliver(ids, 'reminders', dependencies);
