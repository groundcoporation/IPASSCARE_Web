// Develop-only, rollback-only policy experiment. Never prints raw CLI output.
import { readFileSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TESTER_PROJECT_REF } from '../config/tester-target.mjs';
import { testerRpcRules, patchTesterRpc } from './tester-rpc-rules.mjs';

const web = new URL('../', import.meta.url);
const app = new URL('../../IPASSCARE/app/', web);
const workdir = new URL('.codex_tmp/preview-inspect/', app);
export function validateTesterCheck(ref, sql) {
  if (ref.trim() !== TESTER_PROJECT_REF) throw new Error('TESTER_TARGET_MISMATCH');
  const clean = sql.replace(/--[^\n]*/g, '').trim();
  if (!/^begin;/i.test(clean) || !/rollback;$/i.test(clean) || /\bcommit\s*;/i.test(clean)
    || !clean.includes('TESTER_PREVIEW_SYNTHETIC_FIXTURES_REQUIRED')
    || !clean.includes('TESTER_PREVIEW_POLICY_BASELINE_CHANGED'))
    throw new Error('TESTER_ROLLBACK_GUARD_REQUIRED');
}
export function validateTesterAudit(ref, sql) {
  if (ref.trim() !== TESTER_PROJECT_REF) throw new Error('TESTER_TARGET_MISMATCH');
  const clean = sql.replace(/--[^\n]*/g,'').trim();
  if (!/^begin read only;/i.test(clean) || !/commit;$/i.test(clean)
    || /\b(insert|update|delete|alter|create|truncate|drop|grant|revoke|call|do)\b/i.test(clean)
    || !clean.includes('tester_surface_report')) throw new Error('TESTER_READ_ONLY_REQUIRED');
}
export function buildWriteCheck(core, probes, metadata) {
  core = core.replaceAll('\r\n', '\n');
  probes = probes.replaceAll('\r\n', '\n');
  const marker = 'select json_build_object(\n  \'core_read_scope_passed\'';
  if (core.split(marker).length !== 2 || !probes.trim().endsWith('rollback;'))
    throw new Error('TESTER_WRITE_LAYOUT_CHANGED');
  // Pin reviewed function bodies and triggers, refusing drift before any writes.
  // No network-enabled SQL/function body is accepted by this limited experiment.
  if (metadata.functions.some(f => /net\.http|http_post|http_get|dblink|extensions\.http|pg_net|https?:\/\//i.test(f.definition)))
    throw new Error('TESTER_EXTERNAL_SQL_REVIEW_REQUIRED');
  const guardedRpc = metadata.functions.filter(f => testerRpcRules.has(f.signature));
  const patches = guardedRpc.map(f => patchTesterRpc(f.definition,testerRpcRules.get(f.signature))).join('\n');
  core = core.replace('-- Read-only fixture queries', () => patches+'\n-- Read-only fixture queries');
  const literal = v => "'" + String(v).replaceAll("'", "''") + "'";
  const md5 = v => createHash('md5').update(v).digest('hex');
  const functions = metadata.functions.map(f => `(${literal(f.signature)},${literal(md5(f.definition))})`).join(',\n');
  const triggers = metadata.triggers.filter(t => t.schema === 'public');
  const policies = metadata.policies ?? [];
  const policyGuards = policies.map(p => `or not exists(select 1 from pg_policies p
    where p.schemaname='public' and p.tablename=${literal(p.tablename)} and p.policyname=${literal(p.policyname)}
      and p.permissive=${literal(p.permissive)} and p.cmd=${literal(p.cmd)}
      and p.roles::text[]=array[${p.roles.map(literal).join(',')}]::text[]
      and coalesce(p.qual,'')=${literal(p.qual??'')} and coalesce(p.with_check,'')=${literal(p.with_check??'')})`).join('\n');
  const guard = `\ndo $reviewed$ begin
    if exists (select 1 from (values ${functions}) expected(signature,hash)
      where md5(pg_get_functiondef(to_regprocedure('public.'||signature))) is distinct from hash)
      or (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
        join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal) <> ${triggers.length}
      ${triggers.map(t => `or not exists(select 1 from pg_trigger t where t.tgrelid=to_regclass(${literal('public.'+t.tablename)})
        and t.tgname=${literal(t.name)} and md5(pg_get_triggerdef(t.oid,true))=${literal(md5(t.definition))} and t.tgenabled=${literal(t.enabled)})`).join('\n')}
      or (select count(*) from pg_policies where schemaname='public') <> ${policies.length}
      ${policyGuards}
    then raise exception 'TESTER_REVIEWED_FUNCTIONS_CHANGED'; end if;
  end $reviewed$;\n`;
  return core.split(marker)[0].replace('begin;', () => 'begin;'+guard) + '\n' + probes;
}
export function buildManualWriteCheck(core, probes, metadata, migration, manualProbes) {
  migration = migration.replaceAll('\r\n', '\n').trim();
  if (!/^begin;\s/i.test(migration) || !/commit;$/i.test(migration)
    || metadata.functions.some(f => f.signature.startsWith('register_manual_ledger_attendance(')))
    throw new Error('TESTER_MANUAL_BASELINE_REVIEW_REQUIRED');
  const body = migration.replace(/^begin;\s*/i, '').replace(/\s*commit;$/i, '');
  if (/\bcommit\s*;|\brollback\s*;|net\.http|https?:\/\//i.test(body)
    || (body.match(/create or replace function/gi) ?? []).length !== 1
    || !body.includes('function public.register_manual_ledger_attendance(')
    || !body.includes('revoke all on function public.register_manual_ledger_attendance(uuid,date,uuid) from public, anon;'))
    throw new Error('TESTER_MANUAL_MIGRATION_INVALID');
  if (probes.split('-- TESTER_MANUAL_PROBES').length !== 2) throw new Error('TESTER_MANUAL_LAYOUT_CHANGED');
  const expanded = probes.replace('-- TESTER_MANUAL_PROBES', () => body+'\n'+manualProbes)
    .replace("'core_read_scope_passed',true,", "'core_read_scope_passed',true,'temporary_manual_rpc',true,");
  return buildWriteCheck(core, expanded, metadata);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let temporaryDirectory, temporaryFile;
  try {
    const auditMode = process.argv.includes('--audit');
    let sqlFile = new URL(auditMode ? 'supabase/checks/tester_preview_surfaces_audit.sql' : 'supabase/checks/tester_preview_core_policy.sql', web);
    let sql = readFileSync(sqlFile, 'utf8');
    const writeMode = process.argv.includes('--write');
    const manualMode = process.argv.includes('--manual');
    if (writeMode) {
      const probes = readFileSync(new URL('supabase/checks/tester_preview_write_probes.sql', web), 'utf8');
      const metadata = JSON.parse(readFileSync(new URL('.codex_tmp/environment-schema/preview.json', app), 'utf8'));
      sql = manualMode ? buildManualWriteCheck(sql,probes,metadata,
        readFileSync(new URL('supabase/migrations/202611170002_register_manual_ledger_attendance.sql', web),'utf8'),
        readFileSync(new URL('supabase/checks/tester_preview_manual_attendance_probes.sql', web),'utf8')+'\n'+
        readFileSync(new URL('supabase/checks/tester_preview_extended_probes.sql', web),'utf8')+'\n'+
        readFileSync(new URL('supabase/checks/tester_preview_rpc_probes.sql', web),'utf8')+'\n'+
        readFileSync(new URL('supabase/checks/tester_preview_virtual_billing.sql', web),'utf8')+'\n'+
        readFileSync(new URL('supabase/checks/tester_preview_virtual_billing_probes.sql', web),'utf8')+'\n'+
        readFileSync(new URL('supabase/checks/tester_preview_virtual_activity.sql', web),'utf8')+'\n'+
        readFileSync(new URL('supabase/checks/tester_preview_virtual_activity_probes.sql', web),'utf8')+'\n'+
        readFileSync(new URL('supabase/checks/tester_preview_catalog_probes.sql', web),'utf8')+'\n'+
        readFileSync(new URL('supabase/checks/tester_preview_menu_probes.sql', web),'utf8'))
        : buildWriteCheck(sql,probes,metadata);
    }
    const ref = readFileSync(new URL('supabase/.temp/project-ref', workdir), 'utf8');
    if (auditMode) validateTesterAudit(ref,sql); else validateTesterCheck(ref,sql);
    if (process.argv.length === 2) {
      console.log('Develop target and rollback guards verified. Use --run for the temporary DB check.');
    } else {
      if (process.argv.length !== (manualMode ? 5 : (writeMode || auditMode) ? 4 : 3) || process.argv[2] !== '--run'
        || (auditMode && (writeMode || manualMode || process.argv[3] !== '--audit'))
        || (writeMode && process.argv[3] !== '--write')
        || (manualMode && (!writeMode || process.argv[4] !== '--manual'))) throw new Error('TESTER_ARGUMENT_INVALID');
      if (writeMode) {
        temporaryDirectory = mkdtempSync(join(tmpdir(), 'ipasscare-tester-check-'));
        temporaryFile = join(temporaryDirectory, 'rollback.sql');
        writeFileSync(temporaryFile, sql, { mode: 0o600 });
        sqlFile = pathToFileURL(temporaryFile);
      }
      const result = spawnSync(process.execPath, [fileURLToPath(new URL('node_modules/supabase/dist/supabase.js', app)),
        'db', 'query', '--linked', '--workdir', fileURLToPath(workdir),
        '--file', fileURLToPath(sqlFile), '--output', 'json'],
      { cwd: fileURLToPath(app), encoding: 'utf8', windowsHide: true, timeout: 60000 });
      if (result.error || result.status !== 0) {
        const diagnostic = result.stderr || result.stdout || '';
        const sqlState = diagnostic.match(/ERROR:\s*([0-9A-Z]{5}):/)?.[1];
        const token = diagnostic.match(/syntax error at or near "([a-zA-Z_$]{1,40})"/)?.[1];
        // Identifiers/type names only; never expose SQL values or raw server text.
        const typeMismatch = diagnostic.match(/column "([a-z_]{1,63})" is of type ([a-z_ ]{1,63}) but expression is of type ([a-z_ ]{1,63})/i);
        const errorCategory = ['UNION types','argument of AND','argument of OR','argument of NOT',
          'argument of WITH CHECK','argument of policy','structure of query does not match','datatype mismatch']
          .find(category => diagnostic.includes(category));
        const sqlLine = diagnostic.match(/LINE (\d+):/)?.[1];
        console.error(JSON.stringify({ passed: false, sqlState: sqlState ?? 'CLI_FAILED',
          ...(token ? { syntaxToken: token } : {}),
          ...(typeMismatch ? { column: typeMismatch[1], expectedType: typeMismatch[2].trim(), actualType: typeMismatch[3].trim() } : {}),
          ...(errorCategory ? { errorCategory } : {}), ...(sqlLine ? { sqlLine: Number(sqlLine) } : {}),
          nextAction: 'Check rollback and metadata before any retry. Raw response suppressed.' }));
        process.exitCode = 1;
      } else {
        let report;
        try { const row = JSON.parse(result.stdout).rows?.[0]; report = auditMode ? row?.tester_surface_report : row?.tester_core_report; } catch { /* no raw output */ }
        if ((auditMode ? report?.metadata_only !== true : report?.core_read_scope_passed !== true) || report?.release_approved !== false)
          throw new Error('TESTER_CHECK_RESPONSE_INVALID');
        if (/eyJ[A-Za-z0-9_-]{12,}\.|sb_secret_|sbp_[A-Za-z0-9]{12,}/.test(JSON.stringify(report)))
          throw new Error('TESTER_METADATA_SECRET_REVIEW_REQUIRED');
        console.log(JSON.stringify({ project: 'IPASSCARE-develop', ...report, transactionFinished: true }));
        if (writeMode && report.direct_write_passed !== true) process.exitCode = 1;
      }
    }
  } catch (error) {
    console.error(error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'TESTER_CHECK_FAILED');
    process.exitCode = 1;
  } finally {
    if (temporaryFile) unlinkSync(temporaryFile);
    if (temporaryDirectory) rmdirSync(temporaryDirectory);
  }
}
