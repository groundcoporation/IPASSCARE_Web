import type { EnvironmentConfig } from './environment.cjs';

export const TESTER_PROJECT_REF: string;
export function assertTesterBuildTarget(
  environment: Pick<EnvironmentConfig, 'environment' | 'projectRef'>,
  isolationVerified: boolean,
): void;
