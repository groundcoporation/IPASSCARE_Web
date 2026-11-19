// Recovery only for a validated random bucket created by the Storage experiment.
// No recursive metadata deletes and no SQL writes to storage tables.
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createClient} from '@supabase/supabase-js';
import {STORAGE_REF,assertStorageRun} from './tester-storage-contract.mjs';
const web=new URL('../',import.meta.url),app=new URL('../../IPASSCARE/app/',web),workdir=new URL('.codex_tmp/preview-inspect/',app);
let phase='target',files=0;
function safeError(error) {
  return {status:Number(error?.statusCode??error?.status)||undefined,
    code:typeof error?.code==='string'&&/^[A-Za-z_]{1,60}$/.test(error.code)?error.code:undefined,
    type:typeof error?.name==='string'&&/^[A-Za-z]{1,60}$/.test(error.name)?error.name:undefined};
}
try {
  const bucket=process.argv[2],run=bucket?.match(/^ipass-tester-([a-f0-9]{12})$/)?.[1];
  assertStorageRun(readFileSync(new URL('supabase/.temp/project-ref',workdir),'utf8').trim(),run,bucket,`tester_files_${run}`);
  if(process.argv.length!==4||process.argv[3]!=='--cleanup')throw new Error('RECOVERY_ARGUMENT_INVALID');
  const r=spawnSync(process.execPath,[fileURLToPath(new URL('node_modules/supabase/dist/supabase.js',app)),
    'projects','api-keys','--project-ref',STORAGE_REF,'--reveal','--output','json'],
    {encoding:'utf8',windowsHide:true,timeout:60000});
  if(r.status!==0)throw new Error('RECOVERY_KEY_READ_FAILED');
  const key=JSON.parse(r.stdout).find(k=>k.name==='service_role')?.api_key;
  const claims=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString());
  if(claims.ref!==STORAGE_REF||claims.role!=='service_role')throw new Error('RECOVERY_KEY_TARGET_INVALID');
  const admin=createClient(`https://${STORAGE_REF}.supabase.co`,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const unwrap=result=>{if(result.error)throw Object.assign(new Error('RECOVERY_API_FAILED'),{safe:safeError(result.error)});return result.data;};
  phase='bucket-ownership';
  const b=unwrap(await admin.storage.getBucket(bucket));
  const age=Date.now()-Date.parse(b.created_at);
  if(b.id!==bucket||b.public!==false||!Number.isFinite(age)||age<0||age>2*60*60*1000)
    throw new Error('RECOVERY_BUCKET_REVIEW_REQUIRED');
  const storage=admin.storage.from(bucket),paths=[];
  const roots=unwrap(await storage.list('',{limit:100}));
  if(roots.length>2||roots.some(p=>p.id!==null||!/^devsmoke-[a-f0-9]{10}-[12]$/.test(p.name)))
    throw new Error('RECOVERY_PATH_REVIEW_REQUIRED');
  for(const folder of roots) {
    const entries=unwrap(await storage.list(folder.name,{limit:100}));
    if(entries.length>20||entries.some(p=>!p.id||!/^[a-f0-9-]{36}\.txt$/.test(p.name)))throw new Error('RECOVERY_PATH_REVIEW_REQUIRED');
    for(const entry of entries)paths.push(folder.name+'/'+entry.name);
  }
  phase='remove-owned-dummy-files';
  if(paths.length)unwrap(await storage.remove(paths));
  files=paths.length;
  phase='delete-owned-bucket';
  unwrap(await admin.storage.deleteBucket(bucket));
  phase='verify';
  const buckets=unwrap(await admin.storage.listBuckets());
  if(buckets.some(b=>b.id===bucket))throw new Error('RECOVERY_RESIDUE');
  console.log(JSON.stringify({project:'IPASSCARE-develop',cleanupComplete:true,dummyFilesRemoved:files,bucketRemoved:true}));
} catch(error) {
  console.error(JSON.stringify({cleanupComplete:false,phase,dummyFilesRemoved:files,
    code:/^[A-Z_]+$/.test(error?.message??'')?error.message:'RECOVERY_FAILED',...error.safe}));
  process.exitCode=1;
}
