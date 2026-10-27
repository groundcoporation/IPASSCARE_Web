import type { EnvironmentConfig } from "../../config/environment.cjs";

// Vite validates the public configuration before serving/building the app.
// Keep the Node-only CommonJS validator out of the browser module graph.
declare const __IPASSCARE_ENVIRONMENT__: EnvironmentConfig;
export const environmentConfig: EnvironmentConfig = Object.freeze(__IPASSCARE_ENVIRONMENT__);
