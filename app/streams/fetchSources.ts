import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TeamKey } from '../leagues/types.ts';
import type { RunProgress } from './getVideo.ts';
import {
  streamsFromDocument,
  streamsPathForKey,
  type PlayableStream,
} from './sources.ts';
import { workerStreamsUrl } from './workerConfig.ts';

const REPOSITORY = 'Danner36/Danner_App';
const SOURCES_FETCH_TIMEOUT_MS = 8_000;
const TEST_SOURCES_URL = __DEV__
  ? process.env.EXPO_PUBLIC_TEAM_SOURCES_URL
  : undefined;

export type SourcesSession = {
  commitSha?: Promise<string | undefined>;
};

export type SourcesOptions = {
  allowStaleCache?: boolean;
  // Asks the Worker for this game's run state and progress.
  event?: string;
  preferLive?: boolean;
  session?: SourcesSession;
  signal?: AbortSignal;
};

export type SourcesResult = {
  progress?: RunProgress;
  runState?: string;
  streams: PlayableStream[];
};

function sourcesStorageKey(teamKey: TeamKey): string {
  return `danner.sources.${teamKey}.v1`;
}

function withCacheBust(url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}refresh=${Date.now()}`;
}

async function fetchLatestCommitSha(
  path: string,
  signal: AbortSignal,
): Promise<string | undefined> {
  const response = await fetch(
    `https://api.github.com/repos/${REPOSITORY}/commits?path=${path}&per_page=1`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'danner-apps',
      },
      signal,
    },
  );
  if (!response.ok) {
    return undefined;
  }
  const commits = (await response.json()) as Array<{ sha?: string }>;
  return typeof commits[0]?.sha === 'string' ? commits[0].sha : undefined;
}

// Each attempt gets its own budget. Sharing one controller across the fallback chain lets a slow
// first source abort the very fallbacks that exist to cover it.
async function withSourcesTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  outerSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = setTimeout(abort, SOURCES_FETCH_TIMEOUT_MS);
  outerSignal?.addEventListener('abort', abort);
  if (outerSignal?.aborted) {
    controller.abort();
  }
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timeout);
    outerSignal?.removeEventListener('abort', abort);
  }
}

function runProgressFromHeader(value: string | null): RunProgress | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value) as Partial<RunProgress>;
    if (
      (parsed.step === 'source_start' || parsed.step === 'found') &&
      typeof parsed.k === 'number' &&
      typeof parsed.n === 'number'
    ) {
      return { k: parsed.k, n: parsed.n, step: parsed.step };
    }
  } catch {}
  return undefined;
}

async function readDocument(
  url: string,
  signal: AbortSignal,
): Promise<{ progress?: RunProgress; runState?: string; text: string }> {
  const response = await fetch(withCacheBust(url), {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
    signal,
  });
  if (!response.ok) {
    throw new Error('The approved video list is unavailable.');
  }
  return {
    progress: runProgressFromHeader(response.headers.get('X-Run-Progress')),
    runState: response.headers.get('X-Run-State') ?? undefined,
    text: await response.text(),
  };
}

function testSourcesUrl(teamKey: TeamKey): string | undefined {
  if (!TEST_SOURCES_URL) {
    return undefined;
  }
  const separator = TEST_SOURCES_URL.includes('?') ? '&' : '?';
  return `${TEST_SOURCES_URL}${separator}team=${encodeURIComponent(teamKey)}`;
}

// Worker, then raw GitHub by the file's latest commit during a Get video session (only after the
// Worker fails), then raw GitHub `main`, then the last valid copy on the phone.
export async function fetchSources(
  teamKey: TeamKey,
  school: boolean,
  options?: SourcesOptions,
): Promise<SourcesResult> {
  const path = streamsPathForKey(teamKey);
  const remoteUrl = `https://raw.githubusercontent.com/${REPOSITORY}/main/${path}`;
  const testUrl = testSourcesUrl(teamKey);
  const sourcesUrl = testUrl ?? remoteUrl;
  const persistRemote = testUrl === undefined;
  const allowStaleCache = options?.allowStaleCache !== false && persistRemote;
  const preferLive =
    options?.preferLive === true || options?.allowStaleCache === false;
  const signal = options?.signal;
  const storageKey = sourcesStorageKey(teamKey);

  const read = async (url: string): Promise<SourcesResult> => {
    const document = await withSourcesTimeout(
      (requestSignal) => readDocument(url, requestSignal),
      signal,
    );
    const streams = streamsFromDocument(JSON.parse(document.text), { school });
    if (!streams) {
      throw new Error('The approved video list is invalid.');
    }
    if (persistRemote) {
      try {
        await AsyncStorage.setItem(storageKey, document.text);
      } catch {}
    }
    return {
      progress: document.progress,
      runState: document.runState,
      streams,
    };
  };

  try {
    let lastError: unknown;
    const workerUrl = workerStreamsUrl(teamKey, options?.event);
    if (workerUrl && (preferLive || persistRemote)) {
      try {
        return await read(workerUrl);
      } catch (workerError) {
        lastError = workerError;
      }
    }
    // The commit lookup costs one unauthenticated GitHub API call, so it runs only after the
    // Worker fails and is shared by every fetch in the same Get video session.
    if (preferLive && persistRemote) {
      const session = options?.session ?? {};
      session.commitSha ??= withSourcesTimeout(
        (requestSignal) => fetchLatestCommitSha(path, requestSignal),
        signal,
      ).catch(() => undefined);
      const sha = await session.commitSha;
      if (sha) {
        try {
          return await read(
            `https://raw.githubusercontent.com/${REPOSITORY}/${sha}/${path}`,
          );
        } catch (shaError) {
          lastError = shaError;
        }
      }
    }
    try {
      return await read(sourcesUrl);
    } catch (mainError) {
      lastError = mainError;
    }
    throw lastError ?? new Error('The approved video list is unavailable.');
  } catch {
    if (allowStaleCache) {
      try {
        const cachedDocument = await AsyncStorage.getItem(storageKey);
        if (cachedDocument) {
          return {
            streams:
              streamsFromDocument(JSON.parse(cachedDocument), { school }) ?? [],
          };
        }
      } catch {}
    }
    return { streams: [] };
  }
}
