import {supabase} from '../../lib/supabaseClient';
import {environmentConfig} from '../../lib/environment';
import {TESTER_PROJECT_REF} from '../../../config/tester-target.mjs';
import {AppError,normalizeError} from '../../errors/appError';

export interface TesterGrantRequest {
  readonly requestId: string;
  readonly userId: string;
  readonly childId: string;
  readonly optionId: string;
  readonly targetMonth: string;
  readonly scheduleIds: readonly string[];
}
export interface TesterGrantResult {
  success: true; package_id: string; child_id: string; target_month: string;
  testMode: true; externalDelivery: false; replayed: boolean; requestId: string;
}
type GrantStatus = {status:'unconfirmed';requestId:string} |
  {status:'completed';requestId:string;result:TesterGrantResult;currentPassState:'active'|'inactive'|'missing'};
const uuid=(value: unknown): value is string => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const pending=new Map<string,{payload:string;promise:Promise<TesterGrantResult>}>();
function previewOnly() {
  if(environmentConfig.environment!=='preview'||environmentConfig.databaseTarget!=='cloud'||environmentConfig.projectRef!==TESTER_PROJECT_REF)
    throw new AppError('CONFIG_INVALID');
}
function validate(request:TesterGrantRequest) {
  if(!request||typeof request!=='object'||![request.requestId,request.userId,request.childId,request.optionId].every(uuid)
    || !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(request.targetMonth)
    || !Array.isArray(request.scheduleIds)||request.scheduleIds.length>100||!request.scheduleIds.every(uuid)
    || new Set(request.scheduleIds).size!==request.scheduleIds.length) throw new AppError('INPUT_INVALID');
}
// Create once per intended operation, not inside a submit/retry handler. Keep the
// request object until reconciliation completes; do not replace its ID after a timeout.
export function createTesterGrantRequest(input:Omit<TesterGrantRequest,'requestId'>,requestId=crypto.randomUUID()):TesterGrantRequest {
  previewOnly();
  if(!input||!Array.isArray(input.scheduleIds))throw new AppError('INPUT_INVALID');
  const request=Object.freeze({...input,requestId,scheduleIds:Object.freeze([...input.scheduleIds])});
  validate(request);
  return request;
}
function resultFor(value:unknown,requestId:string):TesterGrantResult {
  const r=value as Partial<TesterGrantResult>|null;
  if(!r||r.success!==true||r.testMode!==true||r.externalDelivery!==false||r.requestId!==requestId
    ||!uuid(r.package_id)||!uuid(r.child_id)||typeof r.replayed!=='boolean'
    ||typeof r.target_month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(r.target_month))
    throw new AppError('PACKAGE_GRANT_PENDING');
  return r as TesterGrantResult;
}
export async function submitTesterGrant(request:TesterGrantRequest):Promise<TesterGrantResult> {
  previewOnly();validate(request);
  const body={p_request_id:request.requestId,p_user_id:request.userId,p_child_id:request.childId,
    p_package_option_id:request.optionId,p_target_month:request.targetMonth,p_schedule_ids:[...request.scheduleIds]};
  const payload=JSON.stringify(body),existing=pending.get(request.requestId);
  if(existing) {
    if(existing.payload!==payload) throw new AppError('CONFLICT_ERROR');
    return existing.promise;
  }
  const promise=(async()=>{
    try {
      const {data,error}=await supabase.rpc('grant_tester_member_package_with_schedule',body);
      if(error)throw error;
      const result=resultFor(data,request.requestId);
      if(result.child_id!==request.childId||result.target_month!==request.targetMonth)throw new AppError('PACKAGE_GRANT_PENDING');
      return result;
    } catch(error:unknown) {throw normalizeError(error,'PACKAGE_GRANT_PENDING');}
  })();
  pending.set(request.requestId,{payload,promise});
  try {return await promise;} finally {pending.delete(request.requestId);}
}
export async function getTesterGrantStatus(requestId:string):Promise<GrantStatus> {
  try {
    previewOnly();if(!uuid(requestId))throw new AppError('INPUT_INVALID');
    const {data,error}=await supabase.rpc('get_tester_package_grant_result',{p_request_id:requestId});
    if(error)throw error;
    if(data?.testMode!==true||data.externalDelivery!==false||data.requestId!==requestId)throw new AppError('PACKAGE_GRANT_STATUS_FAILED');
    if(data.status==='unconfirmed')return {status:'unconfirmed',requestId};
    if(data.status!=='completed'||!['active','inactive','missing'].includes(data.currentPassState))throw new AppError('PACKAGE_GRANT_STATUS_FAILED');
    return {status:'completed',requestId,result:resultFor(data.result,requestId),currentPassState:data.currentPassState};
  } catch(error:unknown) {throw normalizeError(error,'PACKAGE_GRANT_STATUS_FAILED');}
}
