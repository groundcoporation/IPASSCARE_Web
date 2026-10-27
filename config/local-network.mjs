// Local development only. Production fetch remains unmodified.
export function createLocalFetchGuard(fetcher, origins, blockedError) {
  const allowed = new Set(origins.map(value => {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1','localhost','[::1]'].includes(url.hostname))
      throw new Error('[CONFIG_INVALID] 로컬 네트워크 설정을 확인해 주세요.');
    return url.origin;
  }));
  return async function localFetch(input, init) {
    let url;
    try {
      const value = typeof input === 'string' ? input : input?.url ?? String(input);
      url = new URL(value, origins[0]);
    } catch { throw blockedError(); }
    if (!allowed.has(url.origin) || url.username || url.password) throw blockedError();
    // Refuse redirects rather than following a local endpoint to a paid/external service.
    return fetcher(input, { ...init, redirect: 'error' });
  };
}
