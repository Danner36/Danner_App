import { ESPN_ADAPTERS } from './espn/adapter.ts';
import { MLB_ADAPTER } from './mlb/adapter.ts';
import type { AdapterKey, LeagueAdapter } from './types.ts';

const ADAPTERS: ReadonlyMap<AdapterKey, LeagueAdapter> = new Map(
  [MLB_ADAPTER, ...ESPN_ADAPTERS].map((adapter) => [adapter.key, adapter]),
);

export function adapterFor(key: AdapterKey): LeagueAdapter | undefined {
  return ADAPTERS.get(key);
}

export const SUPPORTED_ADAPTER_KEYS: readonly AdapterKey[] = [...ADAPTERS.keys()];
