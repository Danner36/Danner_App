export const GOOZ_HOST = 'gooz.aapmains.net';

// One row per player provider. A listing whose player matches no row fails that source as
// unknown_provider and the next source runs.
export const PROVIDERS = [
  {
    id: 'gooz',
    host: GOOZ_HOST,
    embedPath: /\/new-stream-embed\/[^/?#]*\d/,
    iframeSelector: `iframe[src*="${GOOZ_HOST}"]`,
    trustedHosts: [],
    offlineMarkers: [],
  },
];

// Matches on a label boundary. A bare endsWith would also accept a squatted sibling host such
// as `not` + the provider's host, which the checks that decide what gets published must refuse.
function hostBelongsTo(hostname, providerHost) {
  const host = String(hostname).toLowerCase();
  return host === providerHost || host.endsWith(`.${providerHost}`);
}

export function providerForHost(hostname) {
  return PROVIDERS.find((provider) => hostBelongsTo(hostname, provider.host));
}

// The provider whose host and embed path both match the URL, else undefined.
export function providerForUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  const provider = providerForHost(parsed.hostname);
  return provider && provider.embedPath.test(parsed.pathname) ? provider : undefined;
}

export function providerShowsOffline(provider, pageText) {
  const text = String(pageText ?? '').toLowerCase();
  return (provider?.offlineMarkers ?? []).some((marker) => text.includes(marker.toLowerCase()));
}
