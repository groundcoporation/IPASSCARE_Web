export const TESTER_PROJECT_REF = 'msvwhvonafmeycmcvarv';

// Guard the tester build separately from the reusable app/web environment validator.
export function assertTesterBuildTarget(environment, isolationVerified) {
  if (!isolationVerified) return;
  if (environment.environment !== 'preview' || environment.projectRef !== TESTER_PROJECT_REF) {
    throw new Error('[CONFIG_INVALID] 테스트 로그인은 IPASSCARE-develop Preview 빌드에서만 활성화할 수 있습니다.');
  }
}
