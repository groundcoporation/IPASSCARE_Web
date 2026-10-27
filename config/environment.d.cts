export type EnvironmentName = "development" | "preview" | "production";
export interface EnvironmentInput {
  environment?: string;
  projectRef?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}
export interface EnvironmentConfig {
  readonly databaseTarget: "local" | "cloud";
  readonly environment: EnvironmentName;
  readonly projectRef: string;
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
}
export const PRODUCTION_PROJECT_REF: string;
export function resolveEnvironment(input: EnvironmentInput, expectedEnvironment?: string): EnvironmentConfig;
