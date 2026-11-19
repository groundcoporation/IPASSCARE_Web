export function isTesterPath(path: string) {
  return path.replace(/\/+$/, '') === '/tester';
}

export function mayOpenTestLogin(environment: string, isolationVerified: boolean, path: string) {
  return environment === 'preview' && isolationVerified && isTesterPath(path);
}

export function testLoginUrl(value: string | undefined, currentOrigin: string) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value);
    const productionHost = url.hostname === 'ipasscare.com' || url.hostname === 'www.ipasscare.com';
    if (url.protocol !== 'https:' || productionHost || url.origin === currentOrigin || url.username || url.password
      || url.search || url.hash || (url.pathname !== '/' && !isTesterPath(url.pathname))) return null;
    return new URL('/tester', url.origin).href;
  } catch {
    return null;
  }
}

export function hasTesterMarker(user: { app_metadata?: Record<string, unknown> }) {
  return user.app_metadata?.ipasscare_tester === true;
}

export function isTestDirector(profile: { role: string; branch_id: string | null }, user: { app_metadata?: Record<string, unknown> }) {
  return hasTesterMarker(user) && profile.role === 'director' && Boolean(profile.branch_id)
    && /^devsmoke-[a-f0-9]{10}-[12]$/.test(profile.branch_id ?? '')
    && user.app_metadata?.ipasscare_test_branch === profile.branch_id;
}
