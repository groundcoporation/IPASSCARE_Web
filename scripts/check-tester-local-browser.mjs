// Real UI -> local Auth/PostgREST -> isolated PostgreSQL. No cloud connections.
import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createClient} from '@supabase/supabase-js';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {buildTesterLocalSchema} from './tester-local-schema.mjs';
import {testerRpcRules,patchTesterRpc} from './tester-rpc-rules.mjs';
const web=new URL('../',import.meta.url);
// scripts/ is one level below the web root.
const appRoot=new URL('../../IPASSCARE/app/',web);
const run=randomBytes(4).toString('hex'),project='ipasscare-tester-e2e-'+run;
const dir=new URL('.codex_tmp/tester-browser/'+run+'/',appRoot),api='http://127.0.0.1:45441';
const require=createRequire(import.meta.url);
let phase='preflight',attempted=false,networkCreated=false,browser,vite,failure,cleanupComplete=false;
const checks=[];
const check=(label,passed)=>{checks.push({label,passed:!!passed});if(!passed)throw new Error('TESTER_LOCAL_BROWSER_ASSERTION_FAILED');};
const lit=s=>"'"+s.replaceAll("'","''")+"'";
function cli(args,timeout=60000) {
  const env={...process.env,DOCKER_CONTEXT:'desktop-linux'};delete env.DOCKER_HOST;
  const r=spawnSync(process.execPath,[fileURLToPath(new URL('node_modules/supabase/dist/supabase.js',appRoot)),...args,'--workdir',fileURLToPath(dir)],
    {env,encoding:'utf8',windowsHide:true,timeout,maxBuffer:8*1024*1024});
  if(r.error||r.status!==0) {
    const output=(r.stderr??'')+(r.stdout??'');
    throw new Error(/failed to pull|failed to resolve/i.test(output)?'TESTER_LOCAL_IMAGE_DOWNLOAD_FAILED':
      /Applying migration|SQLSTATE/i.test(output)?'TESTER_LOCAL_SCHEMA_BOOTSTRAP_FAILED':'TESTER_LOCAL_CLI_FAILED');
  }
  return r.stdout;
}
function docker(args,input) {
  const r=spawnSync('docker',['--context','desktop-linux',...args],{input,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:8*1024*1024});
  if(r.error||r.status!==0)throw new Error('TESTER_LOCAL_DOCKER_FAILED');return r.stdout;
}
function sql(source) {
  if(!/^ipasscare-tester-e2e-[a-f0-9]{8}$/.test(project))throw new Error('TESTER_LOCAL_TARGET_INVALID');
  return docker(['exec','-i','supabase_db_'+project,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-f','-'],source);
}
const checkedFetch=(input,init)=>{
  const url=new URL(typeof input==='string'?input:input.url??String(input));
  if(url.origin!==api||!/^\/(auth|rest)\/v1\//.test(url.pathname))throw new Error('TESTER_LOCAL_NETWORK_BLOCKED');
  return fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(15000)});
};
try {
  if(process.argv.length!==3||process.argv[2]!=='--run')throw new Error('TESTER_LOCAL_EXPLICIT_RUN_REQUIRED');
  const bytes=readFileSync(new URL('.codex_tmp/environment-schema/preview.json',appRoot));
  if(createHash('sha256').update(bytes).digest('hex')!=='b693080c1507600cd099e584c8c24b979c63357d0324a6176cc26589b6ef3ba6')throw new Error('TESTER_LOCAL_METADATA_CHANGED');
  const m=JSON.parse(bytes);
  const occupied=docker(['ps','--format','{{.Ports}}']);
  if(/4544[0-9]->/.test(occupied))throw new Error('TESTER_LOCAL_PORT_IN_USE');
  mkdirSync(new URL('supabase/migrations/',dir),{recursive:true});
  writeFileSync(new URL('supabase/config.toml',dir),`project_id = "${project}"
[api]
port = 45441
schemas = ["public"]
[db]
port = 45442
shadow_port = 45440
major_version = 17
[db.seed]
enabled = false
[auth]
site_url = "http://127.0.0.1:45441"
[auth.email]
enable_confirmations = false
[studio]
enabled = false
[inbucket]
enabled = false
[storage]
enabled = false
[realtime]
enabled = false
[analytics]
enabled = false
[edge_runtime]
enabled = false
`);
  writeFileSync(new URL('supabase/migrations/20261120000100_synthetic_schema.sql',dir),buildTesterLocalSchema(m));
  if(existsSync(new URL('supabase/.temp/project-ref',dir)))throw new Error('TESTER_LOCAL_REMOTE_LINK_FORBIDDEN');
  phase='start-isolated-stack';attempted=true;
  docker(['network','create','--opt','com.docker.network.bridge.host_binding_ipv4=127.0.0.1',project]);networkCreated=true;
  cli(['start','--network-id',project,'-x','realtime,storage-api,imgproxy,studio,mailpit,edge-runtime,logflare,vector,supavisor,postgres-meta'],300000);
  phase='bindings';
  const ids=docker(['ps','--filter','label=com.supabase.cli.project='+project,'--format','{{.ID}}']).trim().split(/\r?\n/).filter(Boolean);
  const containers=JSON.parse(docker(['inspect',...ids]));
  const bindings=containers.flatMap(c=>Object.values(c.NetworkSettings.Ports??{}).flatMap(bs=>bs??[]));
  const ports=[...new Set(bindings.map(b=>Number(b.HostPort)))];
  let windowsLoopback=false;
  if(process.platform==='win32'&&ports.length&&ports.every(p=>p>=45440&&p<=45449)) {
    const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',
      `$items=@(Get-NetTCPConnection -LocalPort ${ports.join(',')} -State Listen -ErrorAction Stop | ForEach-Object { @{port=[int]$_.LocalPort;loopback=($_.LocalAddress -in @('127.0.0.1','::1'))} }); ConvertTo-Json -InputObject $items -Compress`],
      {encoding:'utf8',windowsHide:true,timeout:15000});
    if(r.status===0)try {const list=JSON.parse(r.stdout);windowsLoopback=Array.isArray(list)&&ports.every(p=>list.some(v=>v.port===p))&&list.every(v=>v.loopback===true);}catch{}
  }
  // Docker Desktop may report IPv6 wildcard inside its VM; require independent
  // Windows host evidence before accepting that representation.
  if(!containers.length||containers.some(c=>!c.Name.endsWith('_'+project))
    ||ports.some(p=>p<45440||p>45449)||bindings.some(b=>!['127.0.0.1','::1'].includes(b.HostIp)&&!(b.HostIp==='::'&&windowsLoopback))
    ||(process.platform==='win32'&&!windowsLoopback))throw new Error('TESTER_LOCAL_BINDINGS_UNSAFE');
  const status=JSON.parse(cli(['status','--output','json']));
  if(status.API_URL!==api||new URL(status.DB_URL).port!=='45442')throw new Error('TESTER_LOCAL_ENDPOINT_INVALID');
  const admin=createClient(api,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:checkedFetch}});
  const branch='devsmoke-'+run+'ab-1',other=branch.slice(0,-1)+'2';
  sql(`insert into public.branches(id,name) values(${lit(branch)},'가상 E2E 지점'),(${lit(other)},'다른 가상 지점');`);
  phase='install-local-candidate';
  const core=readFileSync(new URL('supabase/checks/tester_preview_core_policy.sql',web),'utf8');
  const marker='-- Read-only fixture queries';
  if(core.split(marker).length!==2)throw new Error('TESTER_LOCAL_CANDIDATE_LAYOUT_CHANGED');
  sql(core.split(marker)[0]+'\n'+m.functions.filter(f=>testerRpcRules.has(f.signature)).map(f=>patchTesterRpc(f.definition,testerRpcRules.get(f.signature))).join('\n')+"\nnotify pgrst,'reload schema'; commit;");
  phase='synthetic-auth';
  const email='local-e2e-'+run+'@example.com',password='T3st!'+randomBytes(24).toString('hex');
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{ipasscare_tester:true,ipasscare_test_branch:branch}});
  if(created.error||!created.data.user?.id)throw new Error('TESTER_LOCAL_AUTH_CREATE_FAILED');
  sql(`insert into public.users(id,email,name,role,status,branch_id) values(${lit(created.data.user.id)}::uuid,${lit(email)},'가상 E2E 원장','director','active',${lit(branch)});
    insert into public.academy_teachers(branch_id,name) values(${lit(other)},'다른 지점 가상 직원');`);
  const ownStudent=randomUUID(),otherStudent=randomUUID(),otherStudy=randomUUID(),otherCounsel=randomUUID();
  sql(`insert into public.academy_students(id,branch_id,student_name,attendance_code,is_sms_enabled) values
    (${lit(ownStudent)}::uuid,${lit(branch)},'E2E 가상 원생','E2E_LOCAL',false),
    (${lit(otherStudent)}::uuid,${lit(other)},'다른 지점 가상 원생','E2E_OTHER',false);
    insert into public.academy_study_logs(id,branch_id,student_id,class_name,title,content,is_parent_visible)
    values(${lit(otherStudy)}::uuid,${lit(other)},${lit(otherStudent)}::uuid,'가상 반','다른 지점 학습','다른 지점 기록',false);
    insert into public.academy_counsel_logs(id,branch_id,student_id,content,is_parent_visible)
    values(${lit(otherCounsel)}::uuid,${lit(other)},${lit(otherStudent)}::uuid,'다른 지점 기록',false);`);
  phase='browser';
  const {chromium}=require(process.env.IPASSCARE_BROWSER_RUNTIME||'playwright');
  const config={environment:'development',databaseTarget:'local',projectRef:'local',supabaseUrl:api,supabaseAnonKey:status.ANON_KEY};
  vite=await createServer({root:fileURLToPath(web),configFile:false,define:{__IPASSCARE_ENVIRONMENT__:JSON.stringify(config)},
    server:{host:'127.0.0.1',port:0},plugins:[react(),tailwindcss(),{name:'staff-local-e2e',configureServer(server){server.middlewares.use(async(req,res,next)=>{
      const path=req.url?.split('?')[0];
      if(!['/__staff-live','/__journal-live'].includes(path))return next();
      const fixture=path==='/__staff-live'?'staffLiveFixture.tsx':'journalLiveFixture.tsx';
      res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(path,`<html><div id="root"></div><script type="module" src="/tests/fixtures/${fixture}"></script></html>`));
    });}}]});
  await vite.listen();const origin='http://127.0.0.1:'+vite.httpServer.address().port;
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']});
  const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(15000);
  let unexpectedBlocked=0,fontBlocked=0;const dialogs=[];
  await page.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.origin===origin||(u.origin===api&&/^\/(auth|rest)\/v1\//.test(u.pathname)))return route.continue();
    // Existing site CSS imports two remote fonts. Abort them too, but do not
    // mistake a blocked stylesheet for an attempted cloud business-API call.
    if((u.origin==='https://cdn.jsdelivr.net'&&u.pathname==='/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css')
      ||(u.origin==='https://fonts.googleapis.com'&&u.pathname==='/css2'))fontBlocked++;
    else unexpectedBlocked++;
    return route.abort();
  });
  await page.addInitScript(fixture=>{window.liveFixture=fixture;},{email,password,branch});
  page.on('dialog',async d=>{dialogs.push(d.message());await d.accept();});
  await page.goto(origin+'/__staff-live');
  await page.getByRole('heading',{name:'강사 및 임직원 관리'}).waitFor();
  check('other_branch_staff_hidden',await page.getByText('다른 지점 가상 직원',{exact:true}).count()===0);
  await page.getByRole('button',{name:'임직원 등록',exact:true}).click();
  await page.getByPlaceholder('예: 김선생 / 박기사').fill('E2E 가상 직원');
  await page.getByRole('button',{name:'저장 완료',exact:true}).click();
  await page.getByText('E2E 가상 직원',{exact:true}).waitFor();
  check('real_rest_insert_visible',dialogs.includes('임직원 정보가 저장되었습니다.'));
  const count=()=>Number(sql(`select count(*) from public.academy_teachers where branch_id=${lit(branch)} and name='E2E 가상 직원';`).trim());
  check('db_insert_persisted',count()===1);
  await page.reload();await page.getByText('E2E 가상 직원',{exact:true}).waitFor();check('reload_reads_database',count()===1);
  await page.getByRole('button',{name:'직원 삭제',exact:true}).click();
  await page.getByText('E2E 가상 직원',{exact:true}).waitFor({state:'detached'});
  check('real_rest_delete_persisted',count()===0);
  check('other_branch_row_preserved',Number(sql(`select count(*) from public.academy_teachers where branch_id=${lit(other)};`).trim())===1);
  for(const counsel of [false,true]) {
    const kind=counsel?'counsel':'study',table=counsel?'academy_counsel_logs':'academy_study_logs';
    const foreignId=counsel?otherCounsel:otherStudy;
    phase='journal-'+kind+'-create';
    await page.goto(origin+'/__journal-live'+(counsel?'?counsel':''));
    await page.getByRole('heading',{name:'E2E 가상 원생',exact:true}).waitFor();
    check(kind+'_other_student_hidden',await page.getByText('다른 지점 가상 원생',{exact:true}).count()===0);
    if(!counsel)await page.getByRole('textbox',{name:'일지 제목 *',exact:true}).fill('E2E 학습 제목');
    const editor=()=>page.getByRole('textbox',{name:counsel?'상담 내용 *':'학습 내용 및 수업 진도 *',exact:true});
    await editor().fill('E2E 내부 기록');
    check(kind+'_private_default',!(await page.getByRole('checkbox',{name:'학부모 앱에 공개하고 알림 보내기'}).isChecked()));
    await page.getByRole('button',{name:counsel?'내부용으로 저장':'학원 내부용으로 저장',exact:true}).evaluate(button=>{
      // Two submissions in the same JS task exercise the synchronous request guard.
      const form=button.closest('form');form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
      form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    });
    await page.getByText('E2E 내부 기록',{exact:true}).first().waitFor();
    await page.waitForLoadState('networkidle');
    const ownRows=()=>JSON.parse(sql(`select json_build_object('count',count(*),'private',coalesce(bool_and(not is_parent_visible),true)) from public.${table} where student_id=${lit(ownStudent)}::uuid;`).trim());
    check(kind+'_double_submit_one_private_row',ownRows().count===1&&ownRows().private===true);
    // Unfiltered reads and targeted foreign writes use the actual authenticated REST client.
    const scope=await page.evaluate(async({table,foreignId})=>{
      const {supabase}=await import('/src/lib/supabaseClient.ts');
      const read=await supabase.from(table).select('id');
      const write=await supabase.from(table).update({content:'forged-local-attempt'}).eq('id',foreignId).select('id');
      return {count:read.data?.length,readFailed:!!read.error,writeDenied:write.error?.code==='42501'||(!write.error&&write.data?.length===0)};
    },{table,foreignId});
    check(kind+'_rest_rls_scope',!scope.readFailed&&scope.count===1&&scope.writeDenied);
    phase='journal-'+kind+'-reload-edit';
    await page.reload();await page.getByText('E2E 내부 기록',{exact:true}).waitFor();
    check(kind+'_reload_reads_database',ownRows().count===1);
    await page.getByRole('button',{name:/수정$/}).click();
    await editor().fill('E2E 수정 기록');
    await page.getByRole('button',{name:'알림 없이 수정 저장',exact:true}).click();
    await page.getByText('E2E 수정 기록',{exact:true}).waitFor();
    check(kind+'_edit_persisted',Number(sql(`select count(*) from public.${table} where student_id=${lit(ownStudent)}::uuid and content='E2E 수정 기록';`).trim())===1);
    await page.reload();await page.getByText('E2E 수정 기록',{exact:true}).waitFor();
    phase='journal-'+kind+'-delete';
    await page.getByRole('button',{name:/삭제$/}).click();
    await page.getByText('E2E 수정 기록',{exact:true}).waitFor({state:'detached'});
    check(kind+'_delete_persisted',ownRows().count===0);
    check(kind+'_foreign_row_unchanged',Number(sql(`select count(*) from public.${table} where id=${lit(foreignId)}::uuid and content='다른 지점 기록';`).trim())===1);
  }
  check('private_journals_not_copied_to_parent',Number(sql('select count(*) from public.parent_journal_entries;').trim())===0);
  check('no_cloud_business_requests',unexpectedBlocked===0);
  check('external_font_requests_blocked',fontBlocked>0);
} catch(error) {failure=error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'TESTER_LOCAL_BROWSER_FAILED';}
finally {
  await browser?.close();await vite?.close();
  if(attempted)try {cli(['stop','--no-backup']);cleanupComplete=true;}catch{failure??='TESTER_LOCAL_CLEANUP_FAILED';}
  if(networkCreated)try {docker(['network','rm',project]);}catch{cleanupComplete=false;failure??='TESTER_LOCAL_NETWORK_CLEANUP_FAILED';}
}
console.log(JSON.stringify({localOnly:true,phase,checks,passed:!failure,cleanupComplete,...(failure?{error:failure}:{}),productionChanged:false,existingReproDatabaseChanged:false}));
if(failure)process.exitCode=1;
