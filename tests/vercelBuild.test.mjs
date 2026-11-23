import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveWebBuildMode,TESTER_BRANCH} from '../scripts/build-web.mjs';
const preview={VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:TESTER_BRANCH,VITE_APP_ENV:'preview',
  VITE_SUPABASE_PROJECT_REF:'msvwhvonafmeycmcvarv',VITE_SUPABASE_URL:'https://msvwhvonafmeycmcvarv.supabase.co',
  VITE_SUPABASE_ANON_KEY:'sb_publishable_fixture_public_key_for_unit_test'};
test('only tester branch Preview selects preview mode',()=>{
  assert.equal(resolveWebBuildMode(preview),'preview');
  assert.equal(resolveWebBuildMode({}),'production');
  assert.equal(resolveWebBuildMode({VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'main'}),'production');
  assert.equal(resolveWebBuildMode({...preview,VERCEL_GIT_COMMIT_REF:'feature/other'}),'production');
});
test('tester promotion, missing branch, production DB and incomplete variables fail closed',()=>{
  for(const env of [{...preview,VERCEL_ENV:'production'},{...preview,VERCEL_GIT_COMMIT_REF:''},
    {...preview,VITE_APP_ENV:'production'}, {...preview,VITE_SUPABASE_PROJECT_REF:'wsdyrercgbvwlssntwvy'},
    {...preview,VITE_SUPABASE_ANON_KEY:''}])assert.throws(()=>resolveWebBuildMode(env),/CONFIG_INVALID/);
});
