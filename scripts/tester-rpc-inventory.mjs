// Offline inventory only. A reviewed entry point is not proof that its trigger
// effects or downstream calls are safe. Never prints SQL bodies or row data.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {testerRpcRules} from './tester-rpc-rules.mjs';

// Individually inspected read-only predicates/date helpers. They are not a
// tester authorization boundary; any definition drift returns to pending.
const reviewedReads=new Map([
  ['can_manage_branch(text)','87af4689fd1b8f210dbc58e045fd0ffd68729e85119f829a8821d83b87f46edc'],
  ['can_manage_pickup_schedule(text)','83b59128793b7b6389a2704f4ae42a3a0d1382102edfa43d7a75a1fe01ec8838'],
  ['is_shuttle_operator_role(text)','4c1a58779af0dfe74df7a7cdeffa09f509fa630b6596ca93eda26874f6865812'],
  ['is_staff_role(text)','dfb3cbaafdc0ca96c3f5e5b4e21976110f05674d2e3b079dbba85511bd1032e6'],
  ['lesson_week_start(date)','2409a73ddbded086d996026ad47062ede27f1a275f3ba690ad71b991e83215fd'],
  ['safe_yyyymmdd_to_date(text)','8c0724254395b5c00eaf54cfcd3d9674b943eab9d651d35a056d603d64e0eab1'],
]);

export function inventoryTesterRpc(metadata) {
  if(!Array.isArray(metadata?.functions))throw new Error('TESTER_RPC_METADATA_INVALID');
  const rows=metadata.functions.map(f=>{
    if(typeof f.signature!=='string'||typeof f.definition!=='string'||!Array.isArray(f.grants)
      ||!/^[a-z_][a-z0-9_]*\([a-z0-9_, \[\]]*\)$/.test(f.signature))
      throw new Error('TESTER_RPC_METADATA_INVALID');
    const clientCallable=f.grants.some(g=>['PUBLIC','anon','authenticated'].includes(g.role)&&g.privilege==='EXECUTE');
    const trigger=/\bRETURNS\s+(?:event_)?trigger\b/i.test(f.definition);
    const definer=/\bSECURITY\s+DEFINER\b/i.test(f.definition);
    const guarded=testerRpcRules.has(f.signature);
    const reviewedRead=reviewedReads.get(f.signature)===createHash('sha256').update(f.definition.replaceAll('\r\n','\n')).digest('hex');
    const category=trigger?'trigger_review_separate':!clientCallable?'server_only':guarded?'guard_candidate':reviewedRead?'reviewed_read_helper':
      definer?'client_definer_review_required':'client_invoker_review_required';
    return {signature:f.signature,category,clientCallable,definer,
      anonymousExecute:f.grants.some(g=>['PUBLIC','anon'].includes(g.role)&&g.privilege==='EXECUTE')};
  });
  const pending=rows.filter(r=>r.category.endsWith('_review_required'));
  return {cachedMetadataOnly:true,releaseApproved:false,functions:rows,
    pending:pending.map(r=>r.signature),pendingCount:pending.length,
    guardedMetadataCount:rows.filter(r=>r.category==='guard_candidate').length,
    temporaryGuardSignatures:[...testerRpcRules.keys()].filter(s=>!rows.some(r=>r.signature===s)),
    remainingChecks:['trigger_side_effects','auth_hooks','persisted_install_and_recovery','preview_portal_live_e2e']};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    if(process.argv.length!==3||process.argv[2]!=='--cached')throw new Error('TESTER_RPC_CACHED_FLAG_REQUIRED');
    const metadata=JSON.parse(readFileSync(new URL('../../../IPASSCARE/app/.codex_tmp/environment-schema/preview.json',import.meta.url),'utf8'));
    console.log(JSON.stringify(inventoryTesterRpc(metadata)));
  } catch(error) {
    console.error(error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'TESTER_RPC_INVENTORY_FAILED');
    process.exitCode=1;
  }
}
