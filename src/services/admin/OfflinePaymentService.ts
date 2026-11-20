import {supabase} from '../../lib/supabaseClient';
import {AppError,normalizeError} from '../../errors/appError';
export type OfflineStatus='scheduled'|'paid'|'cancelled';
export interface OfflinePayment {
  id:string;user_id:string;user_name:string;username?:string|null;student_name?:string|null;
  children_names?:string[]|null;final_amount:number;total_amount:number;payment_method:string;status:OfflineStatus;
  scheduled_at?:string|null;paid_at?:string|null;memo?:string|null;
}
export async function loadOfflinePayments(branch:string,status:OfflineStatus):Promise<OfflinePayment[]> {
  try {
    const {data,error}=await supabase.rpc('list_offline_payments',{p_branch_id:branch,p_status:status});
    if(error)throw error;
    if(!Array.isArray(data))throw new AppError('OFFLINE_PAYMENT_LOAD_FAILED');
    const rows=data as OfflinePayment[],ids=[...new Set(rows.map(p=>p.user_id).filter(Boolean))];
    const result=ids.length?await supabase.from('children').select('parent_id,child_name').in('parent_id',ids).is('deleted_at',null):{data:[],error:null};
    if(result.error)throw result.error;
    const names=new Map<string,string[]>();
    for(const child of result.data??[]) {
      if(!child.parent_id||!child.child_name)continue;
      const list=names.get(child.parent_id)??[];
      if(!list.includes(child.child_name))list.push(child.child_name);
      names.set(child.parent_id,list);
    }
    return rows.map(row=>({...row,children_names:names.get(row.user_id)??[]}));
  } catch(error:unknown) {throw normalizeError(error,'OFFLINE_PAYMENT_LOAD_FAILED');}
}
export async function confirmOfflinePayment(id:string,memo:string|null) {
  try {
    const {data,error}=await supabase.rpc('confirm_offline_payment',{p_payment_id:id,p_memo:memo});
    if(error)throw error;
    if(data?.success!==true||data.payment_id!==id)throw new AppError('PAYMENT_SAVE_FAILED');
    return data;
  } catch(error:unknown) {throw normalizeError(error,'PAYMENT_SAVE_FAILED');}
}
export async function cancelOfflinePayment(id:string,reason:string) {
  try {
    const {data,error}=await supabase.rpc('cancel_offline_payment',{p_payment_id:id,p_reason:reason});
    if(error)throw error;
    if(data?.success!==true)throw new AppError('PAYMENT_CANCEL_FAILED');
    return data;
  } catch(error:unknown) {throw normalizeError(error,'PAYMENT_CANCEL_FAILED');}
}
