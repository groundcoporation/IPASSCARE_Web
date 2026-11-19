import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {AppError,normalizeAsyncError} from '../src/errors/appError.ts';
const source=readFileSync(new URL('../src/services/notifications/BillingNotificationService.ts',import.meta.url),'utf8');
function service(environment,projectRef='msvwhvonafmeycmcvarv',response={testMode:true,externalDelivery:false,created:1},error=null) {
  const calls=[];
  const supabase={rpc:async(...args)=>{calls.push(['rpc',...args]);return {data:response,error};},
    functions:{invoke:async(...args)=>{calls.push(['edge',...args]);return {data:response,error};}}};
  const module={exports:{}};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {module,exports:module.exports,crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000001'},require(name){
      if(name.endsWith('supabaseClient'))return {supabase};
      if(name.endsWith('environment'))return {environmentConfig:{environment,projectRef,databaseTarget:environment==='development'?'local':'cloud'}};
      if(name.endsWith('appError'))return {AppError,normalizeAsyncError};
      if(name.endsWith('tester-target.mjs'))return {TESTER_PROJECT_REF:'msvwhvonafmeycmcvarv'};
      throw new Error('Unexpected dependency');
    }});
  return {...module.exports,calls};
}
test('Preview invokes only virtual RPC; production keeps its original Edge endpoint and body',async()=>{
  const preview=service('preview');await preview.dispatchBillingNotification('send-academy-bills',['bill']);
  assert.equal(preview.calls.length,1);assert.equal(preview.calls[0][0],'rpc');
  assert.equal(preview.calls[0][1],'simulate_tester_billing_notification');
  assert.equal(preview.calls[0][2].p_operation,'send-academy-bills');
  const prod=service('production');await prod.dispatchBillingNotification('send-payment-reminders',['payment']);
  assert.equal(prod.calls.length,1);assert.equal(prod.calls[0][0],'edge');
  assert.equal(prod.calls[0][1],'send-payment-reminders');
  assert.equal(prod.calls[0][2].body.payment_request_ids[0],'payment');
});
test('wrong Preview project and local environment never invoke DB or external delivery',async()=>{
  for(const s of [service('preview','wsdyrercgbvwlssntwvy'),service('development')]) {
    await assert.rejects(s.dispatchBillingNotification('send-academy-bills',['bill']));assert.equal(s.calls.length,0);
  }
});
test('missing RPC is surfaced without Edge/table fallback or automatic retries',async()=>{
  const s=service('preview',undefined,null,{code:'PGRST202',message:'sensitive raw response'});
  await assert.rejects(s.dispatchBillingNotification('send-academy-bills',['bill']),{code:'SERVER_UPDATE_REQUIRED'});
  assert.equal(s.calls.length,1);assert.equal(s.calls[0][0],'rpc');
});
test('Preview rejects unmarked responses and invalid operations without reporting live delivery',async()=>{
  const s=service('preview',undefined,{success:true});
  await assert.rejects(s.dispatchBillingNotification('send-academy-bills',['bill']),{code:'BILL_SEND_FAILED'});
  const invalid=service('preview');
  await assert.rejects(invalid.dispatchBillingNotification('payment-confirm',['bill']),{code:'INPUT_INVALID'});
  await assert.rejects(invalid.dispatchBillingNotification('send-academy-bills',[]),{code:'INPUT_INVALID'});
  assert.equal(invalid.calls.length,0);
});
test('virtual SQL has no network or real notification write and isolates outbox access',()=>{
  const sql=readFileSync(new URL('../supabase/checks/tester_preview_virtual_billing.sql',import.meta.url),'utf8');
  assert.doesNotMatch(sql,/net\.http|https?:|insert into public.notifications|billing_token|push_token/i);
  assert.match(sql,/primary key\(actor_id,request_id\)/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/revoke all on ipasscare_preview_delivery.outbox from public,anon,authenticated/);
  const ui=readFileSync(new URL('../src/components/admin/AdminBillingTab.tsx',import.meta.url),'utf8');
  assert.match(ui,/가상 청구서 처리 결과 — 실제 발송 없음/);
  assert.match(ui,/가상 재알림 처리 결과 — 실제 발송 없음/);
});
