import type { Settings } from '../shared/types';
import { createJevProvider } from './jev';
import { createLayaProvider } from './laya';
import type { DecisionProvider } from './provider';

export type { DecisionProvider, ProviderHealth } from './provider';
export { ProviderError } from './errors';

export function createProvider(settings: Settings, fetchImpl: typeof fetch = fetch): DecisionProvider {
  return settings.provider === 'jev'
    ? createJevProvider(settings.jev, fetchImpl)
    : createLayaProvider(settings.laya, fetchImpl);
}
