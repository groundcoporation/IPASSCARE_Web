import {supabase} from '../../lib/supabaseClient';
import {environmentConfig} from '../../lib/environment';
import {AppError,normalizeAsyncError} from '../../errors/appError';
import {TESTER_PROJECT_REF} from '../../../config/tester-target.mjs';
type Operation='send-journal-notification'|'send-attendance-notification'|'send-notice-push';
export function activityNotificationText(result:any,liveText:string):string {
  return result?.testMode===true
    ? `가상 알림 ${Number(result.targetCount??0)}명 처리 기록을 저장했습니다. 실제 알림은 발송하지 않았습니다.`
    : liveText;
}
export async function invokeActivityNotification(operation:Operation,options:{body:Record<string,unknown>}) {
  const fallback=operation==='send-journal-notification'?'JOURNAL_NOTIFICATION_FAILED'
    :operation==='send-attendance-notification'?'ATT_NOTIFICATION_FAILED':'NOTICE_NOTIFICATION_FAILED';
  try {
    if(environmentConfig.databaseTarget==='local')throw new AppError('LOCAL_EXTERNAL_DISABLED');
    if(!['send-journal-notification','send-attendance-notification','send-notice-push'].includes(operation))throw new AppError('INPUT_INVALID');
    const preview=environmentConfig.environment==='preview';
    if(preview&&environmentConfig.projectRef!==TESTER_PROJECT_REF)throw new AppError('PREVIEW_EXTERNAL_DISABLED');
    const result=preview
      ? await supabase.rpc('simulate_tester_activity_notification',{p_operation:operation,p_payload:options.body,p_request_id:crypto.randomUUID()})
      : await supabase.functions.invoke(operation,options);
    if(result.error)throw result.error;
    if(result.data?.success!==true||(preview&&(result.data.testMode!==true||result.data.externalDelivery!==false)))throw new AppError(fallback);
    return {data:result.data,error:null};
  } catch(error:unknown) {
    return {data:null,error:await normalizeAsyncError(error,fallback)};
  }
}
