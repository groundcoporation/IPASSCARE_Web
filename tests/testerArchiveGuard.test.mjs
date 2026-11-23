import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {guardTesterArchiveStudent} from '../scripts/tester-student-archive.mjs';
const migration=readFileSync(new URL('../supabase/migrations/202611170004_archive_academy_student.sql',import.meta.url),'utf8');
test('temporary archive migration guards the actor before early return and keeps bill trigger intact',()=>{
  const guarded=guardTesterArchiveStudent(migration);
  assert.match(guarded,/core_scope\(\)='' then/);
  assert.ok(guarded.indexOf('is_tester_actor()')<guarded.indexOf("'already_archived'"));
  assert.match(guarded,/create trigger require_active_student_for_new_bill/);
  assert.doesNotMatch(guarded,/\bcommit\s*;|\brollback\s*;/i);
  assert.throws(()=>guardTesterArchiveStudent(migration.replace('commit;','commit; commit;')),/INVALID/);
  assert.throws(()=>guardTesterArchiveStudent(migration.replace('archive_academy_student(','unexpected(')),/INVALID/);
});
