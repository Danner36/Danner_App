import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getEmbeddedAppVersion } from '../hub/appUpdate';
import type { TeamKey } from '../leagues/types.ts';
import { getInstallTimes } from '../modules/danner-app-update/src';
import {
  loadSelection,
  SELECTION_KEY,
  type SelectionStorage,
} from './migrations.ts';
import { emptySelection } from './ops.ts';
import type { SelectionV1 } from './types.ts';

const STORAGE_TIMEOUT_MS = 3_000;
const TEST_SELECTION = __DEV__ ? process.env.EXPO_PUBLIC_TEST_SELECTION : undefined;

function sourcesStorageKey(key: TeamKey): string {
  return `danner.sources.${key}.v1`;
}

function withinTimeout<T>(work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('The phone storage did not answer.')),
      STORAGE_TIMEOUT_MS,
    );
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const storage: SelectionStorage = {
  multiGet: (keys) => withinTimeout(AsyncStorage.multiGet(keys)),
  multiRemove: (keys) => withinTimeout(AsyncStorage.multiRemove(keys)),
  setItem: (key, value) => withinTimeout(AsyncStorage.setItem(key, value)),
};

function nowIso(): string {
  return new Date().toISOString();
}

export type SelectionChange = (selection: SelectionV1, now: string) => SelectionV1;

export type SelectionStore = {
  // Applies a change and saves it. False when nothing could be saved.
  apply: (change: SelectionChange) => Promise<boolean>;
  loaded: boolean;
  readOnly: boolean;
  // Loads again and answers whether the session is still read-only.
  reload: () => Promise<boolean>;
  selection: SelectionV1;
};

type StoreState = Pick<SelectionStore, 'loaded' | 'readOnly' | 'selection'>;

export function useSelectionStore(): SelectionStore {
  const [state, setState] = useState<StoreState>(() => ({
    loaded: false,
    readOnly: true,
    selection: emptySelection(nowIso()),
  }));
  const stateRef = useRef(state);
  stateRef.current = state;
  const loadingRef = useRef<Promise<boolean> | undefined>(undefined);
  const writesRef = useRef<Promise<unknown>>(Promise.resolve());

  const reload = useCallback((): Promise<boolean> => {
    if (!loadingRef.current) {
      loadingRef.current = loadSelection({
        appVersion: getEmbeddedAppVersion() ?? 'development',
        getInstallTimes,
        now: nowIso,
        storage,
        testSelection: TEST_SELECTION?.split(',').filter(Boolean),
      })
        .then((loaded) => {
          stateRef.current = { ...loaded, loaded: true };
          setState(stateRef.current);
          return loaded.readOnly;
        })
        .finally(() => {
          loadingRef.current = undefined;
        });
    }
    return loadingRef.current;
  }, []);

  useEffect(() => {
    void reload();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' && stateRef.current.readOnly) {
        void reload();
      }
    });
    return () => subscription.remove();
  }, [reload]);

  const apply = useCallback((change: SelectionChange): Promise<boolean> => {
    const write = writesRef.current.then(async () => {
      if (stateRef.current.readOnly) {
        return false;
      }
      const current = stateRef.current.selection;
      const next = change(current, nowIso());
      if (next === current) {
        return true;
      }
      try {
        await storage.setItem(SELECTION_KEY, JSON.stringify(next));
      } catch {
        return false;
      }
      stateRef.current = { ...stateRef.current, selection: next };
      setState(stateRef.current);
      return true;
    });
    writesRef.current = write;
    return write;
  }, []);

  return { apply, loaded: state.loaded, readOnly: state.readOnly, reload, selection: state.selection };
}

export async function removeSourcesCache(key: TeamKey): Promise<void> {
  await AsyncStorage.removeItem(sourcesStorageKey(key)).catch(() => undefined);
}
