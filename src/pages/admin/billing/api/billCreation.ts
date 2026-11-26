import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError, logError } from '../../../../errors/appError.ts';
import type { PreparedBillItem } from '../model/billGeneration';

export interface BillCreationResult {
  created: number;
  existing: number;
  failed: number;
  unconfirmed: number;
  notAttempted: number;
  errors: AppError[];
}

/** Per-item transactions only. Never repeat a write; stop on ambiguous outcomes. */
export async function createBillBatch(items: PreparedBillItem[], { client }: { client: Pick<SupabaseClient, 'rpc'> }): Promise<BillCreationResult> {
  const result: BillCreationResult = { created: 0, existing: 0, failed: 0, unconfirmed: 0, notAttempted: 0, errors: [] };
  for (const [index, item] of items.entries()) {
    if (!item.parameters) {
      result.failed++;
      const error = item.error || new AppError('BILL_OPTION_INVALID');
      result.errors.push(error);
      logError(error, { operation: 'billing.create.item' });
      continue;
    }
    let issue: AppError | undefined;
    let transactionId: string | undefined;
    try {
      const { data, error } = await client.rpc('create_manual_student_bill', item.parameters);
      transactionId = typeof data?.bill_id === 'string' ? data.bill_id : undefined;
      if (error) issue = normalizeError(error, 'BILL_CREATE_UNCONFIRMED');
      else if (data?.success !== true || typeof data.created !== 'boolean' || !transactionId
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(transactionId)) {
        issue = new AppError('BILL_CREATE_UNCONFIRMED');
      } else if (data.created) result.created++;
      else result.existing++;
    } catch (error: unknown) {
      issue = normalizeError(error, 'BILL_CREATE_UNCONFIRMED');
    }
    if (issue) {
      result.errors.push(issue);
      logError(issue, { operation: 'billing.create.item', transactionId });
      if (issue.code === 'BILL_CREATE_UNCONFIRMED' || issue.code === 'NETWORK_ERROR') {
        result.unconfirmed++;
        result.notAttempted = items.length - index - 1;
        break;
      }
      result.failed++;
    }
  }
  return result;
}
