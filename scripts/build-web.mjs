import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {TESTER_PROJECT_REF} from '../config/tester-target.mjs';
const {resolveEnvironment}=createRequire(import.meta.url)('../config/environment.cjs');
export const TESTER_BRANCH='feature/admin-uiux-tester';

export function resolveWebBuildMode(env) {
  if(env.VERCEL_ENV==='production'&&env.VERCEL_GIT_COMMIT_REF===TESTER_BRANCH)
    throw new Error('[CONFIG_INVALID] 테스터 브랜치는 Production으로 배포할 수 없습니다.');
  if(env.VERCEL_ENV!=='preview')return 'production';
  if(!env.VERCEL_GIT_COMMIT_REF)
    throw new Error('[CONFIG_INVALID] Preview 배포의 Git 브랜치 정보를 확인해 주세요.');
  if(env.VERCEL_GIT_COMMIT_REF!==TESTER_BRANCH)return 'production';
  const config=resolveEnvironment({environment:env.VITE_APP_ENV,projectRef:env.VITE_SUPABASE_PROJECT_REF,
    supabaseUrl:env.VITE_SUPABASE_URL,supabaseAnonKey:env.VITE_SUPABASE_ANON_KEY},'preview');
  if(config.projectRef!==TESTER_PROJECT_REF)
    throw new Error('[CONFIG_INVALID] 테스터 Preview는 Develop DB만 사용할 수 있습니다.');
  return 'preview';
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const mode=resolveWebBuildMode(process.env);
    const result=spawnSync(process.execPath,[fileURLToPath(new URL('../node_modules/vite/bin/vite.js',import.meta.url)),'build','--mode',mode],
      {stdio:'inherit',windowsHide:true});
    process.exitCode=result.error?1:result.status??1;
  } catch {
    console.error('[CONFIG_INVALID] 배포 환경 설정이 올바르지 않습니다. 테스터 브랜치의 Preview 전용 설정을 확인해 주세요.');
    process.exitCode=1;
  }
}
