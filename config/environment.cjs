// Shared app/web environment contract. Keep both repository copies identical.
const PRODUCTION_PROJECT_REF = "wsdyrercgbvwlssntwvy";
exports.PRODUCTION_PROJECT_REF = PRODUCTION_PROJECT_REF;

exports.resolveEnvironment = function resolveEnvironment(input, expectedEnvironment) {
  const invalid = () => { throw new Error("[CONFIG_INVALID] 실행 환경 설정이 없거나 서로 일치하지 않습니다. 환경별 설정을 확인해 주세요."); };
  const environment = input.environment;
  if (!["development", "preview", "production"].includes(environment)) invalid();
  if (expectedEnvironment && environment !== expectedEnvironment) invalid();
  const projectRef = String(input.projectRef || "").trim();
  const supabaseUrl = String(input.supabaseUrl || "").trim();
  const supabaseAnonKey = String(input.supabaseAnonKey || "").trim();
  const isLocal = projectRef === "local";
  if (isLocal) {
    if (environment !== "development" || supabaseUrl !== "http://127.0.0.1:45431") invalid();
  } else {
    if (!/^[a-z0-9]{20}$/.test(projectRef)) invalid();
    if (supabaseUrl !== `https://${projectRef}.supabase.co`) invalid();
    if ((environment === "production") !== (projectRef === PRODUCTION_PROJECT_REF)) invalid();
  }
  // Browser/mobile bundles may contain only public keys, never secret/service-role keys.
  if (!supabaseAnonKey.startsWith("sb_publishable_")) {
    try {
      const payload = JSON.parse(atob(supabaseAnonKey.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (payload.role !== "anon") invalid();
      if (isLocal ? (payload.ref != null && payload.ref !== "local") : payload.ref !== projectRef) invalid();
    } catch { invalid(); }
  }
  if (supabaseAnonKey.length < 24) invalid();
  return Object.freeze({ environment, projectRef, supabaseUrl, supabaseAnonKey, databaseTarget: isLocal ? "local" : "cloud" });
};
