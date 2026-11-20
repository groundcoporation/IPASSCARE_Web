import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {AppError,normalizeError} from '../src/errors/appError.ts';
const source=readFileSync(new URL('../src/services/admin/OfflinePaymentService.ts',import.meta.url),'utf8');
function service(response,childResponse={data:[],error:null}) {
  const calls=[],module={exports:{}};
  const supabase={rpc:async(...args)=>{calls.push(['rpc',...args]);return response;},from(table){
    calls.push(['from',table]);const q={then(resolve,reject){return Promise.resolve(childResponse).then(resolve,reject);}};
    for(const method of ['select','in','is'])q[method]=()=>q;return q;
  }};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {module,exports:module.exports,require(name){if(name.endsWith('supabaseClient'))return {supabase};if(name.endsWith('appError'))return {AppError,normalizeError};throw new Error('Unexpected dependency');}});
  return {...module.exports,calls};
}
test('offline confirm validates success and affected transaction id',async()=>{
  const s=service({data:{success:true,payment_id:'synthetic-id'},error:null});
  await s.confirmOfflinePayment('synthetic-id',null);assert.equal(s.calls.length,1);
  for(const data of [null,{success:true,payment_id:'different'},{success:false}]) {
    const bad=service({data,error:null});await assert.rejects(bad.confirmOfflinePayment('synthetic-id',null),e=>e.code==='PAYMENT_SAVE_FAILED');
  }
});
test('offline missing RPC and permission errors never retry or fall back to table writes',async()=>{
  for(const [error,code] of [[{code:'PGRST202',message:'private token'},'SERVER_UPDATE_REQUIRED'],[{code:'42501',message:'private phone'},'PERMISSION_DENIED']]) {
    const s=service({data:null,error});
    await assert.rejects(s.confirmOfflinePayment('id',null),e=>e.code===code&&!/private/.test(e.message));
    await assert.rejects(s.cancelOfflinePayment('id','synthetic'),e=>e.code===code);
    assert.equal(s.calls.length,2);assert.ok(s.calls.every(c=>c[0]==='rpc'));
  }
});
test('offline cancel requires a confirmed success result',async()=>{
  const bad=service({data:null,error:null});
  await assert.rejects(bad.cancelOfflinePayment('id','synthetic'),e=>e.code==='PAYMENT_CANCEL_FAILED');
  const ok=service({data:{success:true,already_cancelled:true},error:null});await ok.cancelOfflinePayment('id','synthetic');
  assert.equal(ok.calls.length,1);
});
test('offline list joins child names but rejects partial data on child query failure',async()=>{
  const response={data:[{id:'id',user_id:'parent'}],error:null};
  const ok=service(response,{data:[{parent_id:'parent',child_name:'synthetic'},{parent_id:'parent',child_name:'synthetic'}],error:null});
  const rows=await ok.loadOfflinePayments('branch','scheduled');assert.equal(rows[0].children_names.length,1);
  const bad=service(response,{data:[],error:{code:'42501',message:'private'}});
  await assert.rejects(bad.loadOfflinePayments('branch','scheduled'),e=>e.code==='PERMISSION_DENIED');
});
test('offline list rejects an invalid RPC result instead of implying an empty ledger',async()=>{
  const s=service({data:null,error:null});await assert.rejects(s.loadOfflinePayments('branch','paid'),e=>e.code==='OFFLINE_PAYMENT_LOAD_FAILED');
});
test('offline UI has shared synchronous mutation locking, safe errors and stale-load protection',()=>{
  const ui=readFileSync(new URL('../src/components/admin/AdminOfflinePaymentTab.tsx',import.meta.url),'utf8');
  assert.equal((ui.match(/if \(mutationBusy.current\) return/g)??[]).length,2);
  assert.equal((ui.match(/mutationBusy.current = false/g)??[]).length,2);
  assert.match(ui,/version === loadVersion.current/);
  assert.match(ui,/currentScope.current.branch !== activeBranchId/);
  assert.match(ui,/transactionId:payment.id/);
  assert.doesNotMatch(ui,/console.error|error\?\.message|catch \(error: any\)|supabase\./);
});
