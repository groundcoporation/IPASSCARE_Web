// Develop-only, rollback-only policy experiment. Never prints raw CLI output.
import { readFileSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TESTER_PROJECT_REF } from '../config/tester-target.mjs';

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
export function buildWriteCheck(core, probes, metadata) {
  const marker = 'select json_build_object(\n  \'core_read_scope_passed\'';
  if (core.split(marker).length !== 2 || !probes.trim().endsWith('rollback;'))
    throw new Error('TESTER_WRITE_LAYOUT_CHANGED');
  // Pin reviewed function bodies and triggers, refusing drift before any writes.
  // No network-enabled SQL/function body is accepted by this limited experiment.
  if (metadata.functions.some(f => /net\.http|http_post|http_get|dblink|extensions\.http|pg_net|https?:\/\//i.test(f.definition)))
    throw new Error('TESTER_EXTERNAL_SQL_REVIEW_REQUIRED');
  const literal = v => "'" + String(v).replaceAll("'", "''") + "'";
  const md5 = v => createHash('md5').update(v).digest('hex');
  const functions = metadata.functions.map(f => `(${literal(f.signature)},${literal(md5(f.definition))})`).join(',\n');
  const triggers = metadata.triggers.filter(t => t.schema === 'public');
  const guard = `\ndo $reviewed$ begin
    if exists (select 1 from (values ${functions}) expected(signature,hash)
      where md5(pg_get_functiondef(to_regprocedure('public.'||signature))) is distinct from hash)
      or (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
        join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal) <> ${triggers.length}
      ${triggers.map(t => `or not exists(select 1 from pg_trigger t where t.tgrelid=to_regclass(${literal('public.'+t.tablename)})
        and t.tgname=${literal(t.name)} and md5(pg_get_triggerdef(t.oid,true))=${literal(md5(t.definition))} and t.tgenabled=${literal(t.enabled)})`).join('\n')}
    then raise exception 'TESTER_REVIEWED_FUNCTIONS_CHANGED'; end if;
  end $reviewed$;\n`;
  return core.split(marker)[0].replace('begin;', 'begin;'+guard) + '\n' + probes;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let temporaryDirectory, temporaryFile;
  try {
    let sqlFile = new URL('supabase/checks/tester_preview_core_policy.sql', web);
    let sql = readFileSync(sqlFile, 'utf8');
    const writeMode = process.argv.includes('--write');
    if (writeMode) {
      sql = buildWriteCheck(sql,
        readFileSync(new URL('supabase/checks/tester_preview_write_probes.sql', web), 'utf8'),
        JSON.parse(readFileSync(new URL('.codex_tmp/environment-schema/preview.json', app), 'utf8')));
    }
    validateTesterCheck(readFileSync(new URL('supabase/.temp/project-ref', workdir), 'utf8'), sql);
    if (process.argv.length === 2) {
      console.log('Develop target and rollback guards verified. Use --run for the temporary DB check.');
    } else {
      if (process.argv.length !== (writeMode ? 4 : 3) || process.argv[2] !== '--run'
        || (writeMode && process.argv[3] !== '--write')) throw new Error('TESTER_ARGUMENT_INVALID');
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
        const sqlState = (result.stderr || result.stdout || '').match(/ERROR:\s*([0-9A-Z]{5}):/)?.[1];
        console.error(JSON.stringify({ passed: false, sqlState: sqlState ?? 'CLI_FAILED',
          nextAction: 'Check rollback and metadata before any retry. Raw response suppressed.' }));
        process.exitCode = 1;
      } else {
        let report;
        try { report = JSON.parse(result.stdout).rows?.[0]?.tester_core_report; } catch { /* no raw output */ }
        if (report?.core_read_scope_passed !== true || report?.release_approved !== false)
          throw new Error('TESTER_CHECK_RESPONSE_INVALID');
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
