// Metadata-only inventory. Never invokes Edge Functions or reads Secret values.
import {readFileSync,mkdtempSync,writeFileSync,unlinkSync,rmdirSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {TESTER_PROJECT_REF} from '../config/tester-target.mjs';
const web=new URL('../',import.meta.url),app=new URL('../../IPASSCARE/app/',web),workdir=new URL('.codex_tmp/preview-inspect/',app);
export function assertServerAuditTarget(ref,args) {
  if(ref.trim()!==TESTER_PROJECT_REF)throw new Error('TESTER_SERVER_TARGET_MISMATCH');
  if(args.length!==1||args[0]!=='--read')throw new Error('TESTER_SERVER_READ_FLAG_REQUIRED');
}
export function automationSql(hasCron) {
  return `begin read only;
select json_build_object(
  'active_cron_jobs',${hasCron?`(select count(*) from cron.job where active)`:'0'},
  'cron_network_commands',${hasCron?`(select count(*) from cron.job where active and command ~* 'https?://|net[.]http|http_request|kspay|ksnet|push|sms')`:'0'},
  'enabled_network_triggers',(select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and t.tgenabled<>'D' and n.nspname in ('public','auth','storage')
      and pg_get_triggerdef(t.oid,true) ~* 'https?://|http_request|net[.]http'),
  'public_network_functions',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and pg_get_functiondef(p.oid) ~* 'https?://|net[.]http|http_request|extensions[.]http')
) as automation; commit;`;
}
export function assessServerInventory(functions,secrets,automation) {
  if(!Array.isArray(functions)||!Array.isArray(secrets)||!automation
    || ['active_cron_jobs','cron_network_commands','enabled_network_triggers','public_network_functions']
      .some(k=>!Number.isInteger(automation[k])||automation[k]<0))throw new Error('TESTER_SERVER_METADATA_INVALID');
  const deployed=functions.map(f=>({name:/^[a-z0-9-]{1,100}$/.test(f.slug??f.name??'')?(f.slug??f.name):'redacted',
    status:/^[A-Z_]{1,40}$/.test(f.status??'')?f.status:'unknown',
    jwtVerified:typeof f.verify_jwt==='boolean'?f.verify_jwt:null}));
  const secretNames=secrets.map(s=>/^[A-Z][A-Z0-9_]{0,79}$/.test(s.name??'')?s.name:'redacted');
  const integrations=secretNames.filter(s=>/KSNET|KSPAY|PAYMENT|SMS|EXPO|PUSH|NAVER|ALIGO|SOLAPI|SENS|TWILIO/.test(s));
  const blockers=[];
  if(deployed.length)blockers.push('deployed_functions_require_server_side_review');
  if(integrations.length)blockers.push('integration_secret_names_require_sandbox_verification');
  if(automation.active_cron_jobs)blockers.push('active_cron_jobs_require_review');
  if(automation.enabled_network_triggers)blockers.push('enabled_network_triggers_require_review');
  if(automation.public_network_functions)blockers.push('sql_network_functions_require_review');
  return {metadataOnly:true,deployedFunctions:deployed,secretNames,integrationSecretNames:integrations,
    automation,blockers,authHooksVerified:false,serverFunctionBodiesVerified:false,
    remainingChecks:['auth_hooks','persisted_database_isolation','mock_integration_behaviour','browser_end_to_end'],
    releaseApproved:false,externalRequestsInvoked:false,secretsValuesRead:false};
}
function cli(args) {
  const r=spawnSync(process.execPath,[fileURLToPath(new URL('node_modules/supabase/dist/supabase.js',app)),...args],
    {encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:4*1024*1024});
  if(r.status!==0||r.error)throw new Error('TESTER_SERVER_READ_FAILED');
  try{return JSON.parse(r.stdout);}catch{throw new Error('TESTER_SERVER_RESPONSE_INVALID');}
}
function query(source) {
  const directory=mkdtempSync(join(tmpdir(),'ipass-server-audit-')),file=join(directory,'read.sql');
  try {writeFileSync(file,source,{mode:0o600});
    return cli(['db','query','--linked','--workdir',fileURLToPath(workdir),'--file',file,'--output','json']).rows;
  } finally {unlinkSync(file);rmdirSync(directory);}
}
function localHints() {
  const folder=new URL('supabase/functions/',app);
  return readdirSync(folder,{withFileTypes:true}).filter(e=>e.isDirectory()&&!e.name.startsWith('_')).flatMap(e=>{
    let code;
    try{code=readFileSync(new URL(e.name+'/index.ts',folder),'utf8');}catch{return [];}
    return [{name:e.name,environmentNames:[...new Set([...code.matchAll(/Deno\.env\.get\(["']([A-Z0-9_]+)["']\)/g)].map(m=>m[1]))],
      mentionsTesterMarker:code.includes('ipasscare_tester'),
      sourceOnly:true,notProofOfDeployedCode:true}];
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    assertServerAuditTarget(readFileSync(new URL('supabase/.temp/project-ref',workdir),'utf8'),process.argv.slice(2));
    const hasCron=query("begin read only; select to_regclass('cron.job') is not null as has_cron; commit;")[0]?.has_cron;
    if(typeof hasCron!=='boolean')throw new Error('TESTER_SERVER_METADATA_INVALID');
    const automation=query(automationSql(hasCron))[0]?.automation;
    const functions=cli(['functions','list','--project-ref',TESTER_PROJECT_REF,'--output','json']);
    // The CLI list endpoint returns Secret names/digests, not Secret values. Digests are discarded.
    const secrets=cli(['secrets','list','--project-ref',TESTER_PROJECT_REF,'--output','json']);
    console.log(JSON.stringify({project:'IPASSCARE-develop',...assessServerInventory(functions,secrets,automation),localSourceHints:localHints()}));
  } catch(error) {
    console.error(error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'TESTER_SERVER_AUDIT_FAILED');
    process.exitCode=1;
  }
}
