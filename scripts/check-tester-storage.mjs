// Real Develop Storage API experiment. Temporary resources, not a release command.
// No keys/passwords/JWTs/signed URLs, file names or response bodies are logged.
import {readFileSync,mkdtempSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createClient} from '@supabase/supabase-js';
import {STORAGE_REF,assertStorageRun,storagePolicySql,storageCleanupSql,isStorageAccessDenied as denied} from './tester-storage-contract.mjs';
const web=new URL('../',import.meta.url),app=new URL('../../IPASSCARE/app/',web);
const workdir=new URL('.codex_tmp/preview-inspect/',app);
const run=randomBytes(6).toString('hex'),bucket=`ipass-tester-${run}`,schema=`tester_files_${run}`;
const base=`https://${STORAGE_REF}.supabase.co`;
let admin,anon,setupAttempted=false,bucketAttempted=false,unknownAccount=false;
const actors=[],paths=new Set(),results=[],cleanupErrors=[];
let phase='preflight',failure,failedPhase;
const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
function cli(args) {
  const r=spawnSync(process.execPath,[fileURLToPath(new URL('node_modules/supabase/dist/supabase.js',app)),...args],
    {cwd:fileURLToPath(app),encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:16*1024*1024});
  if(r.status!==0||r.error) throw new Error('TESTER_STORAGE_CLI_FAILED');
  try{return JSON.parse(r.stdout);}catch{throw new Error('TESTER_STORAGE_CLI_RESPONSE_INVALID');}
}
function sql(source) {
  const directory=mkdtempSync(join(tmpdir(),'ipass-storage-check-')),file=join(directory,'check.sql');
  try {
    writeFileSync(file,source,{mode:0o600});
    return cli(['db','query','--linked','--workdir',fileURLToPath(workdir),'--file',file,'--output','json']).rows;
  } finally {unlinkSync(file);rmdirSync(directory);}
}
function key(keys,role) {
  const value=keys.find(k=>k.name===role)?.api_key;
  let claims;
  try {claims=JSON.parse(Buffer.from(value.split('.')[1],'base64url').toString());}catch{}
  if(claims?.role!==role||claims?.ref!==STORAGE_REF) throw new Error('TESTER_STORAGE_KEY_TARGET_INVALID');
  return value;
}
const checkedFetch=(input,init)=>{
  const url=new URL(typeof input==='string'?input:input.url??String(input));
  if(url.origin!==base||!/^\/(auth|storage)\/v1\//.test(url.pathname)) throw new Error('TESTER_STORAGE_NETWORK_TARGET_INVALID');
  const timeout=AbortSignal.timeout(20000);
  return fetch(input,{...init,signal:init?.signal?AbortSignal.any([init.signal,timeout]):timeout,redirect:'error'});
};
function client(apiKey,token) {
  return createClient(base,apiKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:checkedFetch,...(token?{headers:{Authorization:`Bearer ${token}`}}:{})}});
}
function ok(result,code) {if(result.error) throw new Error(code);return result.data;}
function check(label,passed) {results.push({label,passed:Boolean(passed)});if(!passed) throw new Error('TESTER_STORAGE_CHECK_FAILED');}
async function download(storage,path,expected) {
  const data=ok(await storage.download(path,{cacheNonce:randomUUID()}),'TESTER_STORAGE_DOWNLOAD_FAILED');
  return (await data.text())===expected;
}
try {
  assertStorageRun(readFileSync(new URL('supabase/.temp/project-ref',workdir),'utf8').trim(),run,bucket,schema);
  if(process.argv.length===2) {console.log('Develop-only Storage API check prepared. --run creates temporary private resources and cleans them up.');process.exit(0);}
  if(process.argv.length!==3||process.argv[2]!=='--run') throw new Error('TESTER_STORAGE_ARGUMENT_INVALID');
  const metadata=JSON.parse(readFileSync(new URL('.codex_tmp/environment-schema/preview.json',app),'utf8'));
  if(metadata.functions.some(f=>/net\.http|http_post|http_get|https?:\/\//i.test(f.definition))) throw new Error('TESTER_STORAGE_SQL_REVIEW_REQUIRED');
  const baseline=sql(`begin read only;
    select json_build_object('branches',(select json_agg(id order by id) from public.branches),
      'buckets',(select count(*) from storage.buckets),'policies',(select count(*) from pg_policies where schemaname='storage'),
      'rls',(select relrowsecurity from pg_class where oid='storage.objects'::regclass),
      'schema_exists',to_regnamespace(${literal(schema)}) is not null) as baseline; commit;`)[0]?.baseline;
  if(!baseline||baseline.buckets!==0||baseline.policies!==0||!baseline.rls||baseline.schema_exists
    ||!baseline.branches?.length||baseline.branches.some(b=>!/^devsmoke-[a-f0-9]{10}-[12]$/.test(b)))
    throw new Error('TESTER_STORAGE_BASELINE_REVIEW_REQUIRED');
  const branchA=baseline.branches.find(b=>b.endsWith('-1'));
  const branchB=branchA?.slice(0,-1)+'2';
  if(!branchA||!baseline.branches.includes(branchB))throw new Error('TESTER_STORAGE_BRANCH_FIXTURES_REQUIRED');
  phase='credentials';
  const keys=cli(['projects','api-keys','--project-ref',STORAGE_REF,'--reveal','--output','json']);
  const anonKey=key(keys,'anon');admin=client(key(keys,'service_role'));anon=client(anonKey);
  phase='create-bucket';bucketAttempted=true;
  ok(await admin.storage.createBucket(bucket,{public:false,fileSizeLimit:4096,allowedMimeTypes:['text/plain']}),'TESTER_STORAGE_BUCKET_CREATE_FAILED');
  phase='create-actors';
  for(const [suffix,branch] of [['a',branchA],['b',branchB]]) {
    const email=`ipass-storage-${run}-${suffix}@example.invalid`,password='T3st!'+randomBytes(24).toString('hex');
    unknownAccount=true;
    const data=ok(await admin.auth.admin.createUser({email,password,email_confirm:true,
      app_metadata:{ipasscare_tester:true,ipasscare_test_branch:branch,ipasscare_storage_fixture:run}}),'TESTER_STORAGE_AUTH_CREATE_FAILED');
    if(!/^[0-9a-f-]{36}$/i.test(data.user?.id??''))throw new Error('TESTER_STORAGE_AUTH_RESPONSE_INVALID');
    const actor={id:data.user.id,email,password,branch,metadata:data.user.app_metadata};actors.push(actor);unknownAccount=false;
  }
  phase='install-policy';setupAttempted=true;
  const hashes=metadata.functions.map(f=>`(${literal(f.signature)},${literal(createHash('md5').update(f.definition).digest('hex'))})`).join(',');
  sql(`begin; set local lock_timeout='4s'; set local statement_timeout='25s';
    do $guard$ begin
      if exists(select 1 from (values ${hashes}) expected(signature,hash)
        where md5(pg_get_functiondef(to_regprocedure('public.'||signature))) is distinct from hash)
        or exists(select 1 from pg_policies where schemaname='storage')
        or exists(select 1 from public.branches where id !~ '^devsmoke-[a-f0-9]{10}-[12]$')
        or not exists(select 1 from storage.buckets where id=${literal(bucket)} and not public)
      then raise exception 'TESTER_STORAGE_BASELINE_CHANGED'; end if;
    end $guard$;
    ${actors.map(a=>`insert into public.users(id,email,username,name,role,status,branch_id)
      values(${literal(a.id)}::uuid,${literal(a.email)},${literal('storage-'+run+'-'+a.id)},'가상 파일 검증 계정','director','active',${literal(a.branch)});`).join('\n')}
    ${storagePolicySql(schema,bucket)}
    commit;`);
  phase='login';
  for(const actor of actors) {
    const auth=client(anonKey);
    const data=ok(await auth.auth.signInWithPassword({email:actor.email,password:actor.password}),'TESTER_STORAGE_LOGIN_FAILED');
    if(data.user?.id!==actor.id||!data.session?.access_token)throw new Error('TESTER_STORAGE_SESSION_INVALID');
    actor.client=client(anonKey,data.session.access_token);
    // Password/session remain in memory only; there is no token refresh loop.
    delete actor.password;
  }
  phase='storage-tests';
  const [a,b]=actors,own=`${a.branch}/${randomUUID()}.txt`,other=`${b.branch}/${randomUUID()}.txt`;
  const moved=`${a.branch}/${randomUUID()}.txt`,forged=`${b.branch}/${randomUUID()}.txt`;
  [own,other,moved,forged].forEach(p=>paths.add(p));
  const sa=a.client.storage.from(bucket),sb=b.client.storage.from(bucket);
  const options={contentType:'text/plain',upsert:false};
  const body='synthetic tester storage check';
  check('own_upload',!(await sa.upload(own,body,options)).error);
  check('other_branch_own_upload',!(await sb.upload(other,body,options)).error);
  check('own_download',await download(sa,own,body));
  check('cross_branch_download_denied',denied(await sb.download(own,{cacheNonce:randomUUID()})));
  check('cross_branch_upload_denied',denied(await sa.upload(forged,body,options)));
  check('cross_branch_update_denied',denied(await sb.update(own,body,options)));
  const removal=await sb.remove([own]);
  check('cross_branch_delete_denied',denied(removal)||(!removal.error&&removal.data?.length===0));
  check('owner_file_survives_cross_delete',await download(sa,own,body));
  check('cross_branch_move_denied',denied(await sa.move(own,forged)));
  check('own_move',!(await sa.move(own,moved)).error);
  check('own_update',!(await sa.update(moved,'synthetic edited',options)).error);
  check('own_updated_download',await download(sa,moved,'synthetic edited'));
  const signed=ok(await sa.createSignedUrl(moved,30),'TESTER_STORAGE_SIGN_FAILED');
  const signedUrl=new URL(signed.signedUrl);
  if(signedUrl.origin!==base||!signedUrl.pathname.startsWith(`/storage/v1/object/sign/${bucket}/`))throw new Error('TESTER_STORAGE_SIGN_TARGET_INVALID');
  const signedResponse=await checkedFetch(signedUrl.href);
  check('short_signed_url_download',signedResponse.ok&&(await signedResponse.text())==='synthetic edited');
  check('cross_branch_sign_denied',denied(await sb.createSignedUrl(moved,30)));
  check('anonymous_authenticated_download_denied',denied(await anon.storage.from(bucket).download(moved,{cacheNonce:randomUUID()})));
  const publicResponse=await checkedFetch(`${base}/storage/v1/object/public/${bucket}/${moved}`);
  check('anonymous_public_url_denied',!publicResponse.ok&&[400,401,403,404].includes(publicResponse.status));
  check('tester_cannot_make_bucket_public',denied(await a.client.storage.updateBucket(bucket,{public:true})));
  check('bucket_remains_private',ok(await admin.storage.getBucket(bucket),'TESTER_STORAGE_BUCKET_READ_FAILED').public===false);
  // Server metadata, not just cached JWT claims, controls access after revocation.
  ok(await admin.auth.admin.updateUserById(a.id,{app_metadata:{...a.metadata,ipasscare_tester:false}}),'TESTER_STORAGE_REVOKE_FAILED');
  check('revoked_cached_session_download_denied',denied(await sa.download(moved,{cacheNonce:randomUUID()})));
  check('other_active_actor_still_downloads',await download(sb,other,body));
  check('own_delete',!(await sb.remove([other])).error);
  const afterDelete=await sb.download(other,{cacheNonce:randomUUID()});
  check('deleted_object_not_downloadable',denied(afterDelete));
} catch(error) {failedPhase=phase;failure=error instanceof Error&&/^TESTER_[A-Z_]+$/.test(error.message)?error.message:'TESTER_STORAGE_FAILED';}
finally {
  if(admin) {
    phase='cleanup';
    // Only the randomly named bucket created by this run is emptied/deleted via API.
    if(bucketAttempted) try {
      const existing=await admin.storage.getBucket(bucket);
      if(!existing.error) {
        // Delete only the known paths, rather than the asynchronous empty endpoint.
        if(paths.size)ok(await admin.storage.from(bucket).remove([...paths]),'TESTER_STORAGE_FILES_DELETE_FAILED');
        ok(await admin.storage.deleteBucket(bucket),'TESTER_STORAGE_BUCKET_DELETE_FAILED');
      } else if(!denied(existing))throw new Error('TESTER_STORAGE_BUCKET_CLEANUP_UNCERTAIN');
    } catch {cleanupErrors.push('bucket');}
    if(setupAttempted)try {
      sql(`begin; ${storageCleanupSql(schema,run)}
        ${actors.map(a=>`delete from public.users where id=${literal(a.id)}::uuid and email=${literal(a.email)}
          and exists(select 1 from auth.users where id=${literal(a.id)}::uuid and raw_app_meta_data->>'ipasscare_storage_fixture'=${literal(run)});`).join('\n')}
        commit;`);
    } catch {cleanupErrors.push('policies_or_profiles');}
    for(const actor of actors)try {
      const user=ok(await admin.auth.admin.getUserById(actor.id),'TESTER_STORAGE_ACTOR_READ_FAILED').user;
      if(user?.app_metadata?.ipasscare_storage_fixture!==run||user.email!==actor.email)throw new Error('TESTER_STORAGE_ACTOR_OWNERSHIP_CHANGED');
      ok(await admin.auth.admin.deleteUser(actor.id),'TESTER_STORAGE_ACTOR_DELETE_FAILED');
    } catch {cleanupErrors.push('actor');}
    if(unknownAccount)cleanupErrors.push('uncertain_account_creation');
    try {
      const residue=sql(`begin read only; select json_build_object(
        'bucket',(select count(*) from storage.buckets where id=${literal(bucket)}),
        'policies',(select count(*) from pg_policies where schemaname='storage' and policyname like ${literal('tester_'+run+'_%')}),
        'schema',to_regnamespace(${literal(schema)}) is not null,
        'profiles',(select count(*) from public.users where email like ${literal('ipass-storage-'+run+'-%@example.invalid')}),
        'actors',(select count(*) from auth.users where raw_app_meta_data->>'ipasscare_storage_fixture'=${literal(run)})
        ) as residue; commit;`)[0]?.residue;
      if(!residue||residue.bucket||residue.policies||residue.schema||residue.profiles||residue.actors)cleanupErrors.push('residual_resources');
    }catch{cleanupErrors.push('cleanup_verification');}
  }
}
console.log(JSON.stringify({project:'IPASSCARE-develop',storageApiChecks:results.length,
  passed:!failure&&cleanupErrors.length===0,checks:results,
  ...(failure?{code:failure,phase:failedPhase}:{}),cleanupComplete:cleanupErrors.length===0,
  ...(cleanupErrors.length?{cleanupErrors}:{}),releaseApproved:false,productionChanged:false}));
if(failure||cleanupErrors.length)process.exitCode=1;
