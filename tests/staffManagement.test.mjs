import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {AppError,normalizeError} from '../src/errors/appError.ts';
const source=readFileSync(new URL('../src/services/admin/StaffManagementService.ts',import.meta.url),'utf8');
const input={id:null,branchId:'synthetic-branch',name:'synthetic',phone:'',email:'',memo:'',role:'teacher'};
function service(response={data:{id:'synthetic-id'},error:null}) {
  const calls=[],module={exports:{}};
  const supabase={
    rpc:async(...args)=>{calls.push(['rpc',...args]);return response;},
    from(table){
      calls.push(['from',table]);
      const q={then(resolve,reject){return Promise.resolve(response).then(resolve,reject);}};
      for(const method of ['select','in','eq','update','insert','delete']) q[method]=(...args)=>{calls.push([method,...args]);return q;};
      q.single=async()=>response;
      return q;
    }
  };
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {module,exports:module.exports,require(name){
      if(name.endsWith('supabaseClient'))return {supabase};
      if(name.endsWith('appError'))return {AppError,normalizeError};
      throw new Error('Unexpected dependency');
    }});
  return {...module.exports,calls};
}
test('staff role failure is normalized with no direct-table fallback or retry',async()=>{
  for(const [error,code] of [[{code:'PGRST202',message:'private token'},'SERVER_UPDATE_REQUIRED'],
    [{code:'42501',message:'private phone'},'PERMISSION_DENIED']]) {
    const s=service({data:null,error});
    await assert.rejects(s.removeStaffMember('synthetic-id','user'),e=>e.code===code&&!/private/.test(e.message));
    assert.equal(s.calls.length,1);assert.equal(s.calls[0][0],'rpc');
  }
});
test('saving an existing account role validates the RPC response',async()=>{
  const ok=service({data:{user_id:'synthetic-id',role:'driver'},error:null});
  await ok.saveStaffMember({...input,id:'synthetic-id',source:'user',role:'driver'});
  assert.equal(ok.calls.length,1);
  const noResult=service({data:null,error:null});
  await assert.rejects(noResult.saveStaffMember({...input,id:'synthetic-id',source:'user'}),e=>e.code==='CONFLICT_ERROR');
});
test('manual staff writes require a returned row and do not report zero-row changes as success',async()=>{
  for(const response of [{data:null,error:null},{data:null,error:{code:'42501',message:'private'}}]) {
    const s=service(response);
    await assert.rejects(s.saveStaffMember({...input,id:'synthetic-id',source:'custom'}));
    const r=service(response);await assert.rejects(r.removeStaffMember('synthetic-id','custom'));
  }
});
test('manual staff create/update/delete confirm the affected id',async()=>{
  const s=service();
  await s.saveStaffMember(input);
  await s.saveStaffMember({...input,id:'synthetic-id',source:'custom'});
  await s.removeStaffMember('synthetic-id','custom');
  assert.equal(s.calls.filter(c=>c[0]==='from').length,3);
  assert.equal(s.calls.filter(c=>c[0]==='rpc').length,0);
});
test('staff load rejects permission errors rather than returning a partial list',async()=>{
  const s=service({data:[],error:{code:'42501',message:'private'}});
  await assert.rejects(s.loadStaffRecords('synthetic-branch'),e=>e.code==='PERMISSION_DENIED');
  assert.equal(s.calls.filter(c=>c[0]==='eq').length,2);
});
test('stale edits do not silently insert a manual staff row',async()=>{
  const s=service();await assert.rejects(s.saveStaffMember({...input,id:'missing'}),e=>e.code==='CONFLICT_ERROR');
  assert.equal(s.calls.length,0);
});
test('staff UI has synchronous duplicate protection, finally cleanup and safe error display',()=>{
  const ui=readFileSync(new URL('../src/components/admin/AdminTeacherTab.tsx',import.meta.url),'utf8');
  assert.match(ui,/mutationBusy.current \|\| !canManageStaff/);
  assert.equal((ui.match(/mutationBusy.current = true/g)??[]).length,2);
  assert.equal((ui.match(/mutationBusy.current = false/g)??[]).length,2);
  assert.doesNotMatch(ui,/catch \(err: any\)|err.message|console.error|supabase\./);
  assert.match(ui,/catch \(error: unknown\)/);
  assert.match(ui,/로그인 계정의 권한은 변경되지 않습니다/);
});
