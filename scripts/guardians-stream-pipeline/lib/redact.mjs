// Listing-site hosts stay out of public Actions logs in two layers: `::add-mask::` covers process
// output this code never sees (browser stderr, unhandled-rejection traces), and the redactor
// rewrites every message this code writes.

export const LISTING_HOST_LABEL = '[listing]';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Accepts a URL or a bare host, so a config value missing its scheme is still masked.
function parseLoose(value) {
  try {
    return new URL(value.includes('://') ? value : `https://${value}`);
  } catch {
    return undefined;
  }
}

export function hostsOf(value) {
  const parsed = parseLoose(String(value ?? '').trim());
  const host = parsed?.hostname?.toLowerCase();
  if (!host) {
    return [];
  }
  return host.startsWith('www.') ? [host, host.slice(4)] : [host];
}

// Longest first, so `www.host` never leaves a stray `www.` in front of the label.
export function redactHosts(text, privateHosts) {
  let redacted = String(text);
  const hosts = [...privateHosts].filter(Boolean).sort((first, second) => second.length - first.length);
  for (const host of hosts) {
    redacted = redacted.replace(new RegExp(escapeRegExp(host), 'gi'), LISTING_HOST_LABEL);
  }
  return redacted;
}

// The value as typed, its normalized URL and origin, and its hosts.
export function maskValuesForUrl(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    return [];
  }
  const values = new Set([text]);
  const parsed = parseLoose(text);
  if (parsed && text.includes('://')) {
    values.add(parsed.href);
    if (parsed.origin !== 'null') {
      values.add(parsed.origin);
    }
  }
  for (const host of hostsOf(text)) {
    values.add(host);
  }
  return [...values];
}

// The runner decodes these three sequences in command data, so a literal `%0A` in a URL has to
// be escaped or the runner would mask a different string.
export function addMaskCommand(value) {
  const escaped = String(value)
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');
  return `::add-mask::${escaped}`;
}

// Workflow commands mean nothing outside Actions, where they would only clutter the output.
export function githubMaskEmitter({ env = process.env, write = (line) => process.stdout.write(`${line}\n`) } = {}) {
  return env.GITHUB_ACTIONS === 'true' ? write : undefined;
}

export function createRedactor({ emit } = {}) {
  const hosts = new Set();
  const masked = new Set();

  return {
    hosts,
    // Registers a URL or host: masks it at once when masking is on, and redacts it from then on.
    add(value) {
      for (const host of hostsOf(value)) {
        hosts.add(host);
      }
      for (const maskValue of maskValuesForUrl(value)) {
        if (emit && !masked.has(maskValue)) {
          masked.add(maskValue);
          emit(addMaskCommand(maskValue));
        }
      }
    },
    text(value) {
      return redactHosts(value, hosts);
    },
  };
}
