import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import type { TeamKey } from '../leagues/types.ts';
import type { Tile } from '../selection/types.ts';
import { logoFileName, logosToFetch, type LogoIndex } from './logoPlan.ts';

const INDEX_KEY = 'danner.logos.v1';
const CONCURRENT_DOWNLOADS = 2;

const listeners = new Set<() => void>();
let logoVersion = 0;
let backfilling = false;

// The path comes from the current document directory each time, because iOS can move the app
// container on an update.
function logoFile(key: TeamKey): File {
  return new File(Paths.document, logoFileName(key));
}

function notifyLogoChange(): void {
  logoVersion += 1;
  listeners.forEach((listener) => listener());
}

export function subscribeToLogos(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLogoVersion(): number {
  return logoVersion;
}

export function cachedLogoUri(key: TeamKey): string | undefined {
  try {
    const file = logoFile(key);
    return file.exists ? file.uri : undefined;
  } catch {
    return undefined;
  }
}

async function readIndex(): Promise<LogoIndex> {
  try {
    const stored: unknown = JSON.parse((await AsyncStorage.getItem(INDEX_KEY)) ?? '{}');
    return typeof stored === 'object' && stored !== null ? (stored as LogoIndex) : {};
  } catch {
    return {};
  }
}

async function downloadLogo(key: TeamKey, href: string): Promise<void> {
  const directory = new Directory(Paths.document, 'logos');
  directory.create({ idempotent: true, intermediates: true });
  await File.downloadFileAsync(href, logoFile(key), { idempotent: true });
}

// Downloads every missing or changed logo, two at a time. The first failure ends the run, because
// the phone is most likely offline; the next hub mount tries again.
export async function backfillLogos(tiles: readonly Tile[]): Promise<void> {
  if (backfilling) {
    return;
  }
  backfilling = true;
  try {
    const index = await readIndex();
    const queue = logosToFetch(tiles, index, (key) => cachedLogoUri(key) !== undefined);
    if (queue.length === 0) {
      return;
    }
    let failed = false;
    const worker = async () => {
      for (let next = queue.shift(); next && !failed; next = queue.shift()) {
        try {
          await downloadLogo(next.key, next.href);
          index[next.key] = { href: next.href, name: logoFileName(next.key) };
          notifyLogoChange();
        } catch {
          failed = true;
        }
      }
    };
    const workers = Array.from({ length: CONCURRENT_DOWNLOADS }, worker);
    await Promise.all(workers);
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index)).catch(() => undefined);
  } finally {
    backfilling = false;
  }
}

export async function deleteLogo(key: TeamKey): Promise<void> {
  try {
    const file = logoFile(key);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // A leftover file is replaced if the team returns.
  }
  const index = await readIndex();
  if (index[key]) {
    delete index[key];
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index)).catch(() => undefined);
  }
  notifyLogoChange();
}
