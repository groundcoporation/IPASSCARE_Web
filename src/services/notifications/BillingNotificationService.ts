import {supabase} from '../../lib/supabaseClient';
import {environmentConfig} from '../../lib/environment';
import {AppError,normalizeAsyncError} from '../../errors/appError';
import {TESTER_PROJECT_REF} from '../../../config/tester-target.mjs';

type BillingNotificationOperation='send-academy-bills'|'send-payment-reminders';
export const virtualBillingNotifications=environmentConfig.environment==='preview';

export async function dispatchBillingNotification(operation:BillingNotificationOperation,ids:string[]) {
  try {
    if(environmentConfig.databaseTarget==='local')throw new AppError('LOCAL_EXTERNAL_DISABLED');
    if(!['send-academy-bills','send-payment-reminders'].includes(operation)||ids.length===0||ids.length>100)
      throw new AppError('INPUT_INVALID');
    if(virtualBillingNotifications) {
      if(environmentConfig.projectRef!==TESTER_PROJECT_REF)throw new AppError('PREVIEW_EXTERNAL_DISABLED');
      const {data,error}=await supabase.rpc('simulate_tester_billing_notification',{
        p_operation:operation,p_ids:ids,p_request_id:crypto.randomUUID(),
      });
      if(error)throw error;
      if(data?.testMode!==true||data?.externalDelivery!==false)throw new AppError('BILL_SEND_FAILED');
      return data;
    }
    const body=operation==='send-academy-bills'?{academy_bill_ids:ids}:{payment_request_ids:ids};
    const {data,error}=await supabase.functions.invoke(operation,{body});
    if(error)throw error;
    return data;
  } catch(error:unknown) {
    throw await normalizeAsyncError(error,operation==='send-payment-reminders'?'BILL_REMINDER_FAILED':'BILL_SEND_FAILED');
  }
}
