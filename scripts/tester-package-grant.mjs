import {patchTesterRpc,testerPackageGrantScope} from './tester-rpc-rules.mjs';
export function buildTesterPackageGrant(metadata,wrapper) {
  const signature='grant_member_package_with_schedule(uuid,uuid,uuid,date,uuid[])';
  const original=metadata.functions.find(f=>f.signature===signature)?.definition;
  const name='CREATE OR REPLACE FUNCTION public.grant_member_package_with_schedule(';
  if(!original?.startsWith(name)||original.split(name).length!==2) throw new Error('TESTER_GRANT_BASELINE_CHANGED');
  // A reviewed private copy keeps the original business transaction; clients cannot call it.
  const privateCopy=patchTesterRpc(original.replace(name,'CREATE OR REPLACE FUNCTION ipasscare_preview_access.grant_member_package_with_schedule('),testerPackageGrantScope);
  return privateCopy+'\nrevoke all on function ipasscare_preview_access.'+signature+' from public,anon,authenticated;\n'+wrapper;
}
