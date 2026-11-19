export function createPreviewSupabaseFetch(
  fetcher: typeof fetch,
  projectUrl: string,
  blockedResponse: () => Response,
): typeof fetch;
