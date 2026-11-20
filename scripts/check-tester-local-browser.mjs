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
import {guardTesterManualAttendance} from './tester-manual-attendance.mjs';
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
  // Apply only to this newly created disposable DB, never to a linked project.
  const partialFix=readFileSync(new URL('supabase/migrations/202611200001_fix_offline_partial_cancellation_status.sql',web),'utf8');
  const acl=()=>sql("select md5(proowner::text||coalesce(proacl::text,'')||prosecdef::text||coalesce(proconfig::text,'')) from pg_proc where oid='public.cancel_offline_payment(uuid,text)'::regprocedure;").trim();
  const definitionHash=()=>sql("select md5(pg_get_functiondef('public.cancel_offline_payment(uuid,text)'::regprocedure));").trim();
  const beforeAcl=acl();sql(partialFix);const fixedHash=definitionHash();sql(partialFix);
  check('partial_fix_preserves_function_acl_security',acl()===beforeAcl);
  check('partial_fix_idempotent_apply',definitionHash()===fixedHash);
  sql('begin;\n'+guardTesterManualAttendance(readFileSync(new URL('supabase/migrations/202611170002_register_manual_ledger_attendance.sql',web),'utf8'))+'\ncommit;');
  phase='synthetic-auth';
  const email='local-e2e-'+run+'@example.com',password='T3st!'+randomBytes(24).toString('hex');
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{ipasscare_tester:true,ipasscare_test_branch:branch}});
  if(created.error||!created.data.user?.id)throw new Error('TESTER_LOCAL_AUTH_CREATE_FAILED');
  const attendanceEmail='local-ledger-'+run+'@example.com',attendancePassword='T3st!'+randomBytes(24).toString('hex');
  const ledgerActor=await admin.auth.admin.createUser({email:attendanceEmail,password:attendancePassword,email_confirm:true});
  if(ledgerActor.error||!ledgerActor.data.user?.id)throw new Error('TESTER_LOCAL_LEDGER_AUTH_CREATE_FAILED');
  sql(`insert into public.users(id,email,name,role,status,branch_id) values(${lit(created.data.user.id)}::uuid,${lit(email)},'가상 E2E 원장','director','active',${lit(branch)});
    insert into public.academy_teachers(branch_id,name) values(${lit(other)},'다른 지점 가상 직원');`);
  sql(`insert into public.users(id,email,name,role,status,branch_id) values(${lit(ledgerActor.data.user.id)}::uuid,${lit(attendanceEmail)},'가상 출결 원장','director','active',${lit(branch)});`);
  const ownStudent=randomUUID(),otherStudent=randomUUID(),otherStudy=randomUUID(),otherCounsel=randomUUID();
  sql(`insert into public.academy_students(id,branch_id,student_name,attendance_code,is_sms_enabled) values
    (${lit(ownStudent)}::uuid,${lit(branch)},'E2E 가상 원생','E2E_LOCAL',false),
    (${lit(otherStudent)}::uuid,${lit(other)},'다른 지점 가상 원생','E2E_OTHER',false);
    insert into public.academy_study_logs(id,branch_id,student_id,class_name,title,content,is_parent_visible)
    values(${lit(otherStudy)}::uuid,${lit(other)},${lit(otherStudent)}::uuid,'가상 반','다른 지점 학습','다른 지점 기록',false);
    insert into public.academy_counsel_logs(id,branch_id,student_id,content,is_parent_visible)
    values(${lit(otherCounsel)}::uuid,${lit(other)},${lit(otherStudent)}::uuid,'다른 지점 기록',false);`);
  phase='seed-local-payments';
  const parentIds=[];
  for(const suffix of ['own','other']) {
    const actor=await admin.auth.admin.createUser({email:`local-parent-${run}-${suffix}@example.com`,email_confirm:true});
    if(actor.error||!actor.data.user?.id)throw new Error('TESTER_LOCAL_PARENT_CREATE_FAILED');
    parentIds.push(actor.data.user.id);
  }
  const bill=randomUUID(),otherBill=randomUUID();
  for(const [i,student,b,receipt] of [[0,ownStudent,branch,bill],[1,otherStudent,other,otherBill]]) {
    const child=randomUUID(),product=randomUUID(),option=randomUUID();
    sql(`insert into public.users(id,name,role,status,branch_id) values(${lit(parentIds[i])}::uuid,${lit(i?'다른 지점 수납 보호자':'E2E 수납 보호자')},'user','active',${lit(b)});
      insert into public.children(id,parent_id,branch_id,child_name,child_birth) values(${lit(child)}::uuid,${lit(parentIds[i])}::uuid,${lit(b)},'E2E 수납 자녀','20180101');
      update public.academy_students set parent_user_id=${lit(parentIds[i])}::uuid,child_id=${lit(child)}::uuid where id=${lit(student)}::uuid;
      insert into public.packages(id,branch_id,name,voucher_type,is_active) values(${lit(product)}::uuid,${lit(b)},'E2E 수납 이용권','lesson',true);
      insert into public.package_options(id,package_id,branch_id,label,price,total_count) values(${lit(option)}::uuid,${lit(product)}::uuid,${lit(b)},'E2E 3회',100,3);
      insert into public.academy_student_classes(student_id,package_option_id,status) values(${lit(student)}::uuid,${lit(option)}::uuid,'active');
      insert into public.academy_bills(id,student_id,branch_id,bill_month,amount_due,original_amount)
      values(${lit(receipt)}::uuid,${lit(student)}::uuid,${lit(b)},to_char(now() at time zone 'Asia/Seoul','YYYY-MM'),100,100);`);
  }
  // Seed scheduled receipts via the same reviewed RPC. Only fake local money is recorded.
  sql(`begin; select set_config('request.jwt.claims',json_build_object('sub',${lit(created.data.user.id)},'role','authenticated')::text,true);
    select public.schedule_offline_payment(${lit(bill)}::uuid,100,'CASH',now(),'E2E 가상 수납');
    commit;
    insert into public.payments(user_id,branch_id,total_amount,final_amount,payment_method,status,source,academy_bill_id)
    values(${lit(parentIds[1])}::uuid,${lit(other)},100,100,'CASH','scheduled','onsite',${lit(otherBill)}::uuid);`);
  const payment=sql(`select id from public.payments where academy_bill_id=${lit(bill)}::uuid;`).trim();
  const foreignPayment=sql(`select id from public.payments where academy_bill_id=${lit(otherBill)}::uuid;`).trim();
  phase='browser';
  const {chromium}=require(process.env.IPASSCARE_BROWSER_RUNTIME||'playwright');
  const config={environment:'development',databaseTarget:'local',projectRef:'local',supabaseUrl:api,supabaseAnonKey:status.ANON_KEY};
  vite=await createServer({root:fileURLToPath(web),configFile:false,define:{__IPASSCARE_ENVIRONMENT__:JSON.stringify(config)},
    server:{host:'127.0.0.1',port:0},plugins:[react(),tailwindcss(),{name:'staff-local-e2e',configureServer(server){server.middlewares.use(async(req,res,next)=>{
      const path=req.url?.split('?')[0];
      if(!['/__staff-live','/__journal-live','/__offline-live','/__attendance-live'].includes(path))return next();
      const fixture=path==='/__staff-live'?'staffLiveFixture.tsx':path==='/__offline-live'?'offlineLiveFixture.tsx':path==='/__attendance-live'?'attendanceLiveFixture.tsx':'journalLiveFixture.tsx';
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
  await page.addInitScript(fixture=>{window.liveFixture=fixture;},{email,password,branch,attendanceEmail,attendancePassword});
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
  phase='offline-confirm';
  await page.goto(origin+'/__offline-live');
  await page.getByText('E2E 수납 보호자',{exact:true}).waitFor();
  check('offline_other_branch_hidden',await page.getByText('다른 지점 수납 보호자',{exact:true}).count()===0);
  let confirms=0;
  page.on('request',r=>{if(new URL(r.url()).pathname==='/rest/v1/rpc/confirm_offline_payment')confirms++;});
  await page.locator('article').getByRole('button',{name:'수납 완료',exact:true}).evaluate(b=>{b.click();b.click();});
  await page.getByText('표시할 현장결제가 없습니다.',{exact:true}).waitFor();
  await page.waitForLoadState('networkidle');
  check('offline_confirm_one_request',confirms===1);
  check('offline_payment_paid',Number(sql(`select count(*) from public.payments where id=${lit(payment)}::uuid and status='paid';`).trim())===1);
  check('offline_bill_paid',Number(sql(`select count(*) from public.academy_bills where id=${lit(bill)}::uuid and status='paid' and amount_paid=100;`).trim())===1);
  const issued=()=>Number(sql(`select count(*) from public.user_packages where payment_id=${lit(payment)}::uuid;`).trim());
  check('offline_one_pass_issued',issued()===1);
  const replay=await page.evaluate(async id=>{const {supabase}=await import('/src/lib/supabaseClient.ts');const r=await supabase.rpc('confirm_offline_payment',{p_payment_id:id,p_memo:null});return !r.error&&r.data?.already_paid===true;},payment);
  check('offline_server_repeat_no_second_pass',replay&&issued()===1);
  await page.getByRole('button',{name:'수납 완료',exact:true}).click();
  await page.getByText('E2E 수납 보호자',{exact:true}).waitFor();
  await page.reload();await page.getByRole('heading',{name:'현장결제 관리',exact:true}).waitFor();
  // Reload defaults to scheduled; switch back to the persisted paid record.
  await page.getByRole('button',{name:'수납 완료',exact:true}).click();
  await page.getByText('E2E 수납 보호자',{exact:true}).waitFor();
  check('offline_paid_reload',issued()===1);
  phase='offline-cancel';
  await page.locator('article').getByRole('button',{name:'결제 취소',exact:true}).click();
  await page.getByText('표시할 현장결제가 없습니다.',{exact:true}).waitFor();
  check('offline_cancel_persisted',Number(sql(`select count(*) from public.payments where id=${lit(payment)}::uuid and status='cancelled';`).trim())===1);
  check('offline_unused_pass_recalled',Number(sql(`select count(*) from public.user_packages where payment_id=${lit(payment)}::uuid and status='cancelled' and remaining_count=0;`).trim())===1);
  check('offline_bill_reset_unpaid',Number(sql(`select count(*) from public.academy_bills where id=${lit(bill)}::uuid and status='unpaid' and amount_paid=0;`).trim())===1);
  const denied=await page.evaluate(async({branch,id})=>{
    const {supabase}=await import('/src/lib/supabaseClient.ts');
    const list=await supabase.rpc('list_offline_payments',{p_branch_id:branch,p_status:'all'});
    const cancel=await supabase.rpc('cancel_offline_payment',{p_payment_id:id,p_reason:'synthetic forbidden attempt'});
    return list.error?.code==='42501'&&cancel.error?.code==='42501';
  },{branch:other,id:foreignPayment});
  check('offline_foreign_rpc_denied',denied);
  check('offline_foreign_receipt_preserved',Number(sql(`select count(*) from public.payments where id=${lit(foreignPayment)}::uuid and status='scheduled';`).trim())===1);
  phase='offline-partial-payment';
  const partialBill=randomUUID();
  sql(`begin; select set_config('request.jwt.claims',json_build_object('sub',${lit(created.data.user.id)},'role','authenticated')::text,true);
    insert into public.academy_bills(id,student_id,branch_id,bill_month,amount_due,original_amount)
    values(${lit(partialBill)}::uuid,${lit(ownStudent)}::uuid,${lit(branch)},to_char(now() at time zone 'Asia/Seoul','YYYY-MM'),100,100);
    select public.schedule_offline_payment(${lit(partialBill)}::uuid,40,'CASH',now(),'E2E 부분 수납 40');
    select public.schedule_offline_payment(${lit(partialBill)}::uuid,60,'CASH',now(),'E2E 부분 수납 60'); commit;`);
  await page.getByRole('button',{name:'결제 예정',exact:true}).click();
  const receiptRow=amount=>page.locator('article').filter({has:page.getByText(amount+'원',{exact:true})});
  await receiptRow(40).getByRole('button',{name:'수납 완료',exact:true}).click();
  await receiptRow(40).waitFor({state:'detached'});
  check('partial_first_receipt_updates_bill',Number(sql(`select count(*) from public.academy_bills where id=${lit(partialBill)}::uuid and status='partial' and amount_paid=40;`).trim())===1);
  check('partial_no_pass_before_full_payment',Number(sql(`select count(*) from public.user_packages u join public.payments p on p.id=u.payment_id where p.academy_bill_id=${lit(partialBill)}::uuid;`).trim())===0);
  await receiptRow(60).getByRole('button',{name:'수납 완료',exact:true}).click();
  await receiptRow(60).waitFor({state:'detached'});
  check('partial_second_receipt_completes_bill',Number(sql(`select count(*) from public.academy_bills where id=${lit(partialBill)}::uuid and status='paid' and amount_paid=100;`).trim())===1);
  check('partial_full_payment_one_pass',Number(sql(`select count(*) from public.user_packages u join public.payments p on p.id=u.payment_id where p.academy_bill_id=${lit(partialBill)}::uuid;`).trim())===1);
  await page.getByRole('button',{name:'수납 완료',exact:true}).click();
  phase='offline-partial-cancellation';
  await receiptRow(60).getByRole('button',{name:'결제 취소',exact:true}).click();
  await receiptRow(60).waitFor({state:'detached'});
  check('partial_cancel_keeps_remaining_amount',Number(sql(`select count(*) from public.academy_bills where id=${lit(partialBill)}::uuid and amount_paid=40;`).trim())===1);
  check('partial_cancel_keeps_partial_status',Number(sql(`select count(*) from public.academy_bills where id=${lit(partialBill)}::uuid and status='partial' and amount_paid=40;`).trim())===1);
  const partialPayment=sql(`select id from public.payments where academy_bill_id=${lit(partialBill)}::uuid and final_amount=60;`).trim();
  const cancelReplay=await page.evaluate(async id=>{const {supabase}=await import('/src/lib/supabaseClient.ts');const r=await supabase.rpc('cancel_offline_payment',{p_payment_id:id,p_reason:'synthetic repeated cancellation'});return !r.error&&r.data?.already_cancelled===true;},partialPayment);
  check('partial_repeat_cancel_preserves_balance',cancelReplay&&Number(sql(`select count(*) from public.academy_bills where id=${lit(partialBill)}::uuid and status='partial' and amount_paid=40;`).trim())===1);
  await receiptRow(40).getByRole('button',{name:'결제 취소',exact:true}).click();
  await receiptRow(40).waitFor({state:'detached'});
  check('partial_all_cancelled_resets_zero_unpaid',Number(sql(`select count(*) from public.academy_bills where id=${lit(partialBill)}::uuid and status='unpaid' and amount_paid=0;`).trim())===1);
  phase='offline-permission-revocation';
  sql(`update public.users set status='deleted' where id=${lit(created.data.user.id)}::uuid;`);
  const previousDialogs=dialogs.length;
  await page.getByRole('button',{name:'새로고침',exact:true}).click();
  await page.waitForFunction(count=>window.document.querySelector('section')&&!window.document.querySelector('article'),previousDialogs);
  await page.waitForLoadState('networkidle');
  check('offline_revoked_session_safe_error',dialogs.slice(previousDialogs).some(m=>m.includes('[PERMISSION_DENIED]')));
  phase='attendance-seed';
  const attendancePass=randomUUID(),attendanceReservation=randomUUID(),attendanceProduct=randomUUID(),attendanceOption=randomUUID();
  const child=sql(`select child_id from public.academy_students where id=${lit(ownStudent)}::uuid;`).trim();
  const otherChild=sql(`select child_id from public.academy_students where id=${lit(otherStudent)}::uuid;`).trim();
  const today=sql("select (now() at time zone 'Asia/Seoul')::date;").trim();
  sql(`insert into public.packages(id,branch_id,name,voucher_type,is_active) values(${lit(attendanceProduct)}::uuid,${lit(branch)},'E2E 출결 전용 이용권','lesson',true);
    insert into public.package_options(id,package_id,branch_id,label,price,total_count) values(${lit(attendanceOption)}::uuid,${lit(attendanceProduct)}::uuid,${lit(branch)},'E2E 출결 3회',100,3);
    insert into public.user_packages(id,user_id,child_id,branch_id,package_id,option_id,package_name,total_count,remaining_count,status,voucher_type,beneficiary_type,valid_from,valid_until,expiry_date)
    values(${lit(attendancePass)}::uuid,${lit(parentIds[0])}::uuid,${lit(child)}::uuid,${lit(branch)},${lit(attendanceProduct)}::uuid,${lit(attendanceOption)}::uuid,
      'E2E 출결 전용 이용권',3,3,'active','lesson','child',date '${today}',date '${today}'+30,(date '${today}'+30)::timestamptz);
    insert into public.reservations(id,user_id,child_id,branch_id,package_id,class_date,status,attendance_status,reservation_type)
    values(${lit(attendanceReservation)}::uuid,${lit(parentIds[0])}::uuid,${lit(child)}::uuid,${lit(branch)},${lit(attendancePass)}::uuid,date '${today}','confirmed','yet','regular');`);
  phase='attendance-register';
  const openLedger=async()=>{
    await page.getByRole('button',{name:'출결관리',exact:true}).click();
    await page.getByRole('button',{name:'출결 조회 (원생 장부)',exact:true}).click();
    await page.getByRole('heading',{name:'월별 출결 장부',exact:true}).waitFor();
    await page.getByText('E2E 출결 전용 이용권',{exact:true}).waitFor();
  };
  await page.goto(origin+'/__attendance-live');await openLedger();
  const attendanceRow=()=>page.locator('tbody tr').filter({has:page.getByText('E2E 출결 전용 이용권',{exact:true})});
  check('attendance_initial_remaining_three',await attendanceRow().getByText('잔여 3회',{exact:true}).count()===1);
  let registrations=0;
  page.on('request',r=>{if(new URL(r.url()).pathname==='/rest/v1/rpc/register_manual_ledger_attendance')registrations++;});
  await attendanceRow().getByRole('button',{name:/출석 등록$/}).click();
  await page.getByRole('button',{name:'출석 완료 체크하기',exact:true}).evaluate(button=>{
    const form=button.closest('form');form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  });
  await attendanceRow().getByRole('button',{name:/출석 기록 보기$/}).waitFor();await page.waitForLoadState('networkidle');
  check('attendance_duplicate_click_one_rpc',registrations===1);
  const remaining=()=>Number(sql(`select remaining_count from public.user_packages where id=${lit(attendancePass)}::uuid;`).trim());
  check('attendance_consumes_once',remaining()===2);
  check('attendance_single_saved_checkin',Number(sql(`select count(*) from public.attendance_logs where child_id=${lit(child)}::uuid and date=date '${today}' and check_in is not null;`).trim())===1);
  const consumed=()=>Number(sql(`select count(*) from public.package_usage_logs where user_package_id=${lit(attendancePass)}::uuid and status='consumed';`).trim());
  check('attendance_usage_consumed_once',consumed()===1);
  const duplicateRegistration=await page.evaluate(async({child,pass,date})=>{
    const {supabase}=await import('/src/lib/supabaseClient.ts');const r=await supabase.rpc('register_manual_ledger_attendance',{p_child_id:child,p_date:date,p_package_id:pass});
    return !r.error&&r.data?.status==='already_registered';
  },{child,pass:attendancePass,date:today});
  check('attendance_server_repeat_no_extra_use',duplicateRegistration&&remaining()===2&&consumed()===1);
  await page.reload();await openLedger();
  await attendanceRow().getByRole('button',{name:/출석 기록 보기$/}).waitFor();
  check('attendance_reload_remaining_two',await attendanceRow().getByText('잔여 2회',{exact:true}).count()===1);
  const usage=JSON.parse(sql(`select json_build_object('id',id,'at',consumed_at) from public.package_usage_logs where user_package_id=${lit(attendancePass)}::uuid and status='consumed';`).trim());
  phase='attendance-cancel';
  await attendanceRow().getByRole('button',{name:/출석 기록 보기$/}).click();
  await page.getByRole('dialog',{name:'출석 기록 상세',exact:true}).getByRole('button',{name:'출석 취소',exact:true}).evaluate(b=>{b.click();b.click();});
  await page.getByRole('dialog',{name:'출석 기록 상세',exact:true}).waitFor({state:'hidden'});await page.waitForLoadState('networkidle');
  check('attendance_cancel_restores_once',remaining()===3&&consumed()===0);
  check('attendance_cancel_clears_checkin',Number(sql(`select count(*) from public.attendance_logs where child_id=${lit(child)}::uuid and date=date '${today}' and check_in is not null;`).trim())===0);
  const duplicateCancellation=await page.evaluate(async({child,pass,date,usage})=>{
    const {supabase}=await import('/src/lib/supabaseClient.ts');const r=await supabase.rpc('cancel_attendance_ledger_entry',{
      p_child_id:child,p_date:date,p_package_id:pass,p_usage_id:usage.id,p_expected_consumed_at:usage.at});
    return r.error?.message?.includes('[CONFLICT_ERROR]')||(!r.error&&r.data?.restored===0);
  },{child,pass:attendancePass,date:today,usage});
  check('attendance_repeat_cancel_never_over_restores',duplicateCancellation&&remaining()===3);
  await page.reload();await openLedger();
  check('attendance_cancel_persisted_after_reload',await attendanceRow().getByRole('button',{name:/출석 기록 보기$/}).count()===0&&remaining()===3);
  const foreignAttendance=await page.evaluate(async({child,pass,date})=>{
    const {supabase}=await import('/src/lib/supabaseClient.ts');const r=await supabase.rpc('register_manual_ledger_attendance',{p_child_id:child,p_date:date,p_package_id:pass});
    return r.error?.message?.includes('[PERMISSION_DENIED]')||r.error?.code==='42501';
  },{child:otherChild,pass:attendancePass,date:today});
  check('attendance_foreign_child_rpc_denied',foreignAttendance&&remaining()===3);
  phase='attendance-shared-api-refresh';
  const previousRegistrations=registrations;
  const sharedAttendance=await page.evaluate(async({reservation,child,branch,date})=>{
    const {supabase}=await import('/src/lib/supabaseClient.ts');
    const r=await supabase.rpc('process_lesson_check_in',{p_reservation_id:reservation,p_child_id:child,p_branch_id:branch,p_class_date:date});
    return !r.error&&r.data?.status==='consumed';
  },{reservation:attendanceReservation,child,branch,date:today});
  check('shared_lesson_api_consumes',sharedAttendance);
  check('shared_lesson_api_usage_matches',remaining()===2&&consumed()===1);
  await page.getByRole('button',{name:'새로고침',exact:true}).click();
  await attendanceRow().getByRole('button',{name:/출석 기록 보기$/}).waitFor();
  check('shared_lesson_api_reflected_in_ledger',await attendanceRow().getByText('잔여 2회',{exact:true}).count()===1);
  check('shared_lesson_refresh_does_not_register_again',registrations===previousRegistrations);
  phase='tester-attendance-revoked-token';
  sql(`update public.users set status='active' where id=${lit(created.data.user.id)}::uuid;`);
  const cachedTester=await page.evaluate(async()=>{
    const {supabase}=await import('/src/lib/supabaseClient.ts');
    const f=window.liveFixture;const r=await supabase.auth.signInWithPassword({email:f.email,password:f.password});
    return !r.error&&r.data.user?.app_metadata?.ipasscare_tester===true;
  });
  check('tester_attendance_cached_token_prepared',cachedTester);
  const activeUsage=JSON.parse(sql(`select json_build_object('id',id,'at',consumed_at) from public.package_usage_logs where user_package_id=${lit(attendancePass)}::uuid and status='consumed';`).trim());
  const activeRoundtrip=await page.evaluate(async({child,pass,date,usage})=>{
    const {supabase}=await import('/src/lib/supabaseClient.ts');
    const cancelled=await supabase.rpc('cancel_attendance_ledger_entry',{
      p_child_id:child,p_date:date,p_package_id:pass,p_usage_id:usage.id,p_expected_consumed_at:usage.at});
    if(cancelled.error||cancelled.data?.cancelled!==true)return false;
    const registered=await supabase.rpc('register_manual_ledger_attendance',{p_child_id:child,p_date:date,p_package_id:pass});
    return !registered.error&&registered.data?.status==='registered';
  },{child,pass:attendancePass,date:today,usage:activeUsage});
  check('tester_active_attendance_cancel_register_allowed',activeRoundtrip&&remaining()===2&&consumed()===1);
  sql(`update auth.users set raw_app_meta_data=raw_app_meta_data-'ipasscare_tester'-'ipasscare_test_branch' where id=${lit(created.data.user.id)}::uuid;`);
  const cachedClaim=await page.evaluate(async()=>{
    const {supabase}=await import('/src/lib/supabaseClient.ts');const {data}=await supabase.auth.getSession();
    const payload=data.session?.access_token?.split('.')[1];
    return !!payload&&JSON.parse(atob(payload.replace(/-/g,'+').replace(/_/g,'/'))).app_metadata?.ipasscare_tester===true;
  });
  check('tester_attendance_revocation_keeps_cached_jwt_claim',cachedClaim);
  const currentUsage=JSON.parse(sql(`select json_build_object('id',id,'at',consumed_at) from public.package_usage_logs where user_package_id=${lit(attendancePass)}::uuid and status='consumed';`).trim());
  const revokedCancel=await page.evaluate(async({child,pass,date,usage})=>{
    const {supabase}=await import('/src/lib/supabaseClient.ts');const r=await supabase.rpc('cancel_attendance_ledger_entry',{
      p_child_id:child,p_date:date,p_package_id:pass,p_usage_id:usage.id,p_expected_consumed_at:usage.at});
    return r.error?.code==='42501'||r.error?.message?.includes('[PERMISSION_DENIED]');
  },{child,pass:attendancePass,date:today,usage:currentUsage});
  check('tester_revoked_attendance_cancel_denied',revokedCancel);
  const deniedRegistration=()=>page.evaluate(async({child,pass,date})=>{
    const {supabase}=await import('/src/lib/supabaseClient.ts');const r=await supabase.rpc('register_manual_ledger_attendance',{p_child_id:child,p_date:date,p_package_id:pass});
    return r.error?.code==='42501'||r.error?.message?.includes('[PERMISSION_DENIED]');
  },{child,pass:attendancePass,date:today});
  check('tester_revoked_attendance_register_denied',await deniedRegistration());
  check('tester_revoked_attendance_state_unchanged',remaining()===2&&consumed()===1);
  sql(`update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||jsonb_build_object('ipasscare_tester',true,'ipasscare_test_branch',${lit(branch)}) where id=${lit(created.data.user.id)}::uuid;
    update public.users set status='deleted' where id=${lit(created.data.user.id)}::uuid;`);
  check('tester_suspended_attendance_register_denied',await deniedRegistration());
  const suspendedCancellation=await page.evaluate(async({child,pass,date,usage})=>{
    const {supabase}=await import('/src/lib/supabaseClient.ts');const r=await supabase.rpc('cancel_attendance_ledger_entry',{
      p_child_id:child,p_date:date,p_package_id:pass,p_usage_id:usage.id,p_expected_consumed_at:usage.at});
    return r.error?.code==='42501'||r.error?.message?.includes('[PERMISSION_DENIED]');
  },{child,pass:attendancePass,date:today,usage:currentUsage});
  check('tester_suspended_attendance_cancel_denied',suspendedCancellation&&remaining()===2&&consumed()===1);
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
