/**
 * Backward compatibility stub for fetch interceptor.
 * Forwards to the unified network interceptor.
 */
import { installNetworkInterceptor, uninstallNetworkInterceptor } from './network';

export const installFetchInterceptor = installNetworkInterceptor;
export const uninstallFetchInterceptor = uninstallNetworkInterceptor;
