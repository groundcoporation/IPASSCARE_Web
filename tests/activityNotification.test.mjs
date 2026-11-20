import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {AppError,normalizeAsyncError,errorMessages} from '../src/errors/appError.ts';
const source=readFileSync(new URL('../src/services/notifications/ActivityNotificationService.ts',import.meta.url),'utf8');
function service(environment='preview',projectRef='msvwhvonafmeycmcvarv',response={success:true,testMode:true,externalDelivery:false,targetCount:1},error=null) {
  const calls=[],module={exports:{}};
  const supabase={rpc:async(...args)=>{calls.push(['rpc',...args]);return {data:response,error};},functions:{invoke:async(...args)=>{calls.push(['edge',...args]);return {data:response,error};}}};
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
for(const operation of ['send-journal-notification','send-attendance-notification','send-notice-push']) {
  test(`${operation}: Preview calls only the mock RPC; production keeps the same body`,async()=>{
    const body={id:'synthetic'};
    const preview=service();assert.equal((await preview.invokeActivityNotification(operation,{body})).error,null);
    assert.equal(preview.calls.length,1);assert.equal(preview.calls[0][0],'rpc');
    assert.equal(preview.calls[0][2].p_operation,operation);
    const live=service('production');await live.invokeActivityNotification(operation,{body});
    assert.equal(live.calls[0][0],'edge');assert.equal(live.calls[0][1],operation);assert.equal(live.calls[0][2].body,body);
  });
}
test('wrong Preview and local mode do not send any request',async()=>{
  for(const s of [service('preview','wsdyrercgbvwlssntwvy'),service('development')]) {
    assert.ok((await s.invokeActivityNotification('send-notice-push',{body:{noticeId:'id'}})).error);
    assert.equal(s.calls.length,0);
  }
});
test('missing RPC has a safe error, no retry and no fallback',async()=>{
  const s=service('preview',undefined,null,{code:'PGRST202',message:'sensitive server body'});
  const result=await s.invokeActivityNotification('send-notice-push',{body:{}});
  assert.equal(result.error.code,'SERVER_UPDATE_REQUIRED');assert.doesNotMatch(result.error.message,/sensitive/);assert.equal(s.calls.length,1);
});
test('unmarked mock results are rejected and real delivery wording is not reused',async()=>{
  const s=service('preview',undefined,{success:true});
  assert.ok((await s.invokeActivityNotification('send-journal-notification',{body:{}})).error);
  assert.match(s.activityNotificationText({testMode:true,targetCount:1},'live delivery'),/실제 알림은 발송하지 않았습니다/);
  assert.equal(s.activityNotificationText({},'live delivery'),'live delivery');
});
test('app/web error catalogs match in the shared workspace',async(t)=>{
  const file=new URL('../../../IPASSCARE/app/src/errors/appError.ts',import.meta.url);
  if(!existsSync(file))return t.skip('App checkout is not present in this web-only workspace');
  const app=await import(file.href);
  assert.deepEqual(errorMessages,app.errorMessages);
});
test('activity RPC never sends outside the database',()=>{
  const sql=readFileSync(new URL('../supabase/checks/tester_preview_virtual_activity.sql',import.meta.url),'utf8');
  assert.doesNotMatch(sql,/net\.http|https?:|insert into public.notifications|push_token|billing_token/i);
  assert.match(sql,/'sentCount',0/);
  assert.match(sql,/visible is distinct from true/);
});
