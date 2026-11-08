// JSON GET with a timeout and retries for transport failures and 5xx responses. A result
// separates a network failure (no HTTP response, or a 5xx after the retries) from a response that
// arrived: `networkError` names the former, and `ok` with `status` describe the latter.
const USER_AGENT = 'danner-app-team-catalog';
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;

export function shortError(error) {
  const cause = error?.cause;
  return String(cause?.code ?? cause?.message ?? error?.name ?? 'error').slice(0, 80);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJson(url, { timeoutMs = REQUEST_TIMEOUT_MS, sleepImpl = sleep } = {}) {
  let last;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const started = Date.now();
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await response.text();
      const latencyMs = Date.now() - started;
      let body = null;
      let jsonError = false;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text.slice(0, 2048);
        jsonError = true;
      }
      if (response.status >= 500 && attempt < MAX_ATTEMPTS) {
        last = { body, latencyMs, networkError: `HTTP ${response.status}`, ok: false, status: response.status };
        await sleepImpl(attempt * 1000);
        continue;
      }
      return {
        body,
        jsonError,
        latencyMs,
        networkError: response.status >= 500 ? `HTTP ${response.status}` : null,
        ok: response.ok && !jsonError,
        status: response.status,
      };
    } catch (error) {
      last = { body: null, latencyMs: Date.now() - started, networkError: shortError(error), ok: false, status: null };
      if (attempt < MAX_ATTEMPTS) {
        await sleepImpl(attempt * 1000);
      }
    }
  }
  return { ...last, jsonError: false };
}

// Parses `--name value` and `--flag` CLI arguments.
export function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      continue;
    }
    const name = arg.slice(2);
    if (index + 1 < argv.length && !argv[index + 1].startsWith('--')) {
      args[name] = argv[index + 1];
      index += 1;
    } else {
      args[name] = true;
    }
  }
  return args;
}
