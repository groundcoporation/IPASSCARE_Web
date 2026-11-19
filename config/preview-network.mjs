// Browser-side defence in depth. A Preview project must also isolate server integrations.
export function createPreviewSupabaseFetch(fetcher, projectUrl, blockedResponse) {
  const origin = new URL(projectUrl).origin;
  return async (input, init) => {
    let url;
    try {
      url = new URL(typeof input === 'string' ? input : input?.url ?? String(input), origin);
    } catch {
      return blockedResponse();
    }
    if (url.origin !== origin || url.username || url.password || !/^\/(?:auth|rest|storage)\/v1\//.test(url.pathname)) {
      return blockedResponse();
    }
    return fetcher(input, { ...init, redirect: 'error' });
  };
}
