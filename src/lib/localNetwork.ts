import { environmentConfig } from './environment';
import { createLocalFetchGuard } from '../../config/local-network.mjs';
import { AppError } from '../errors/appError';

if (environmentConfig.databaseTarget === 'local') {
  globalThis.fetch = createLocalFetchGuard(globalThis.fetch.bind(globalThis),
    [window.location.origin, environmentConfig.supabaseUrl],
    () => new AppError('LOCAL_EXTERNAL_DISABLED'));
}
