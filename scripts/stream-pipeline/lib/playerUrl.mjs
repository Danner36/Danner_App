// Rebuilds a player URL from validated parts, because the result is committed to a public file and
// a host could otherwise ride along in a query, userinfo, fragment, port or extra path segment.
// providers.mjs says which hosts are players; this table says what their real URLs look like.

import { PROVIDERS } from './extract/providers.mjs';

const MAX_URL_LENGTH = 2048;

const URL_RULES = {
  gooz: {
    path: /^\/new-stream-embed\/\d{1,12}$/,
    query: { ad: /^\d{1,12}$/ },
  },
};

// The canonical https URL, or undefined for anything but a provider's exact host, its anchored
// embed path and its known query parameters. Nothing is dropped silently: an unknown part rejects
// the URL.
export function canonicalPlayerUrl(value) {
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH || value.includes('#')) {
    return undefined;
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) {
    return undefined;
  }

  const provider = PROVIDERS.find((row) => row.host === parsed.hostname.toLowerCase());
  const rule = provider ? URL_RULES[provider.id] : undefined;
  if (!rule || !rule.path.test(parsed.pathname)) {
    return undefined;
  }

  const params = [...parsed.searchParams];
  if (new Set(params.map(([name]) => name)).size !== params.length) {
    return undefined;
  }
  if (params.some(([name, text]) => !Object.hasOwn(rule.query, name) || !rule.query[name].test(text))) {
    return undefined;
  }

  const known = Object.keys(rule.query).filter((name) => parsed.searchParams.has(name));
  const search = known.map((name) => `${name}=${parsed.searchParams.get(name)}`).join('&');
  return `https://${provider.host}${parsed.pathname}${search ? `?${search}` : ''}`;
}
