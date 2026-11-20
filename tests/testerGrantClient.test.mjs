import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {AppError,normalizeError} from '../src/errors/appError.ts';
const source=readFileSync(new URL('../src/services/admin/TesterPackageGrantService.ts',import.meta.url),'utf8');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const input={userId:id(1),childId:id(2),optionId:id(3),targetMonth:'2026-11-01',scheduleIds:[id(4)]};
const result={success:true,package_id:id(5),child_id:id(2),target_month:'2026-11-01',testMode:true,externalDelivery:false,replayed:false,requestId:id(6)};
function service(handler=async()=>({data:result,error:null}),environment='preview',projectRef='msvwhvonafmeycmcvarv') {
  const calls=[],module={exports:{}};
  const supabase={rpc:async(name,body)=>{calls.push({name,body});return handler(name,body);}};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {module,exports:module.exports,crypto:{randomUUID:()=>id(6)},require(name){
      if(name.endsWith('supabaseClient'))return {supabase};
      if(name.endsWith('environment'))return {environmentConfig:{environment,projectRef,databaseTarget:environment==='development'?'local':'cloud'}};
      if(name.endsWith('tester-target.mjs'))return {TESTER_PROJECT_REF:'msvwhvonafmeycmcvarv'};
      if(name.endsWith('appError'))return {AppError,normalizeError};
      throw new Error('Unexpected dependency');
    }});
  return {...module.exports,calls};
}
test('grant request takes an immutable snapshot and keeps its ID on submission',async()=>{
  const s=service(),scheduleIds=[id(4)];
  const request=s.createTesterGrantRequest({...input,scheduleIds});scheduleIds.push(id(7));
  assert.ok(Object.isFrozen(request));assert.ok(Object.isFrozen(request.scheduleIds));
  await s.submitTesterGrant(request);await s.submitTesterGrant(request);
  assert.equal(s.calls.length,2);assert.equal(s.calls[0].body.p_request_id,s.calls[1].body.p_request_id);
  assert.equal(s.calls[0].body.p_schedule_ids.length,1);
  assert.equal(s.calls[0].name,'grant_tester_member_package_with_schedule');
});
test('simultaneous clicks share one request and a changed payload cannot reuse its in-flight ID',async()=>{
  let release;
  const s=service(()=>new Promise(resolve=>{release=resolve;})),request=s.createTesterGrantRequest(input);
  const a=s.submitTesterGrant(request),b=s.submitTesterGrant(request);
  await assert.rejects(s.submitTesterGrant({...request,optionId:id(8)}),e=>e.code==='CONFLICT_ERROR');
  assert.equal(s.calls.length,1);release({data:result,error:null});
  assert.equal((await a).package_id,(await b).package_id);
});
test('lost submit response leads to read-only reconciliation, not automatic regrant',async()=>{
  const s=service(async(name)=>{
    if(name==='grant_tester_member_package_with_schedule')throw new Error('private raw server token');
    return {data:{status:'completed',requestId:id(6),testMode:true,externalDelivery:false,result,currentPassState:'active'},error:null};
  });
  const request=s.createTesterGrantRequest(input);
  await assert.rejects(s.submitTesterGrant(request),e=>e.code==='PACKAGE_GRANT_PENDING'&&!/private/.test(e.message));
  const status=await s.getTesterGrantStatus(request.requestId);
  assert.equal(status.status,'completed');assert.equal(status.result.package_id,id(5));
  assert.equal(s.calls.filter(c=>c.name==='grant_tester_member_package_with_schedule').length,1);
  assert.equal(s.calls[1].body.p_request_id,request.requestId);
});
test('unconfirmed is not failure and an inactive pass is not automatically replaced',async()=>{
  const s=service(async()=>({data:{status:'unconfirmed',requestId:id(6),testMode:true,externalDelivery:false},error:null}));
  assert.equal((await s.getTesterGrantStatus(id(6))).status,'unconfirmed');
  assert.equal(s.calls.length,1);
  const inactive=service(async()=>({data:{status:'completed',requestId:id(6),testMode:true,externalDelivery:false,result,currentPassState:'inactive'},error:null}));
  assert.equal((await inactive.getTesterGrantStatus(id(6))).currentPassState,'inactive');
  assert.equal(inactive.calls[0].name,'get_tester_package_grant_result');
});
test('production, local and wrong Preview targets never make grant/status requests',async()=>{
  for(const [environment,project] of [['production','msvwhvonafmeycmcvarv'],['development','msvwhvonafmeycmcvarv'],['preview','wsdyrercgbvwlssntwvy']]) {
    const s=service(undefined,environment,project);
    assert.throws(()=>s.createTesterGrantRequest(input),e=>e.code==='CONFIG_INVALID');
    await assert.rejects(s.submitTesterGrant({...input,requestId:id(6)}),e=>e.code==='CONFIG_INVALID');
    await assert.rejects(s.getTesterGrantStatus(id(6)),e=>e.code==='CONFIG_INVALID');
    assert.equal(s.calls.length,0);
  }
});
test('missing RPC and permission failure do not fall back or retry',async()=>{
  for(const [error,code] of [[{code:'PGRST202',message:'private'},'SERVER_UPDATE_REQUIRED'],[{code:'42501',message:'private'},'PERMISSION_DENIED']]) {
    const s=service(async()=>({data:null,error}));
    await assert.rejects(s.submitTesterGrant(s.createTesterGrantRequest(input)),e=>e.code===code);
    assert.equal(s.calls.length,1);
  }
});
test('responses must match the request, target and virtual-only markers',async()=>{
  for(const change of [{requestId:id(7)},{child_id:id(7)},{externalDelivery:true},{testMode:false},{target_month:'2026-12-01'}]) {
    const s=service(async()=>({data:{...result,...change},error:null}));
    await assert.rejects(s.submitTesterGrant(s.createTesterGrantRequest(input)),e=>e.code==='PACKAGE_GRANT_PENDING');
  }
});
test('invalid month and duplicate schedules are rejected before network writes',async()=>{
  const s=service();
  assert.throws(()=>s.createTesterGrantRequest({...input,targetMonth:'2026-13-01'}),e=>e.code==='INPUT_INVALID');
  assert.throws(()=>s.createTesterGrantRequest({...input,scheduleIds:[id(4),id(4)]}),e=>e.code==='INPUT_INVALID');
  assert.equal(s.calls.length,0);
});
