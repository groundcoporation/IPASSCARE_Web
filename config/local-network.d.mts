export function createLocalFetchGuard(fetcher: typeof fetch, origins: readonly string[], blockedError: () => Error): typeof fetch;
