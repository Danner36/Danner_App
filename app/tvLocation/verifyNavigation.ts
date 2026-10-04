const VERIFY_HOST = 'tv.youtube.com';
const ALLOWED_DOMAINS = ['youtube.com', 'google.com'];

// Lowercase host of an https URL. Other schemes, credentials, and unusual host
// characters return undefined.
export function httpsHost(url: string): string | undefined {
  const match = /^https:\/\/([^/?#\\]*)/i.exec(url);
  if (!match || match[1].includes('@')) {
    return undefined;
  }
  const host = match[1].replace(/:\d*$/, '').toLowerCase();
  return /^[a-z0-9.-]+$/.test(host) ? host : undefined;
}

// Top-frame loads stay on YouTube and Google account hosts so sign-in and 2-Step
// Verification work. Subframe loads are left to the page.
export function allowVerifyNavigation(request: {
  url: string;
  isTopFrame?: boolean;
}): boolean {
  if (request.isTopFrame === false) {
    return true;
  }
  if (request.url === 'about:blank' || request.url === 'about:srcdoc') {
    return true;
  }
  const host = httpsHost(request.url);
  return (
    host !== undefined &&
    ALLOWED_DOMAINS.some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    )
  );
}

export function isVerifyPageUrl(url: string): boolean {
  return httpsHost(url) === VERIFY_HOST;
}
