const VERIFY_HOST = 'tv.youtube.com';
const ACCOUNTS_HOST = 'accounts.google.com';
const ALLOWED_DOMAINS = ['youtube.com', 'google.com'];

export const VERIFY_URL = 'https://tv.youtube.com/verify';
export const SIGN_IN_URL = VERIFY_URL;
export const SWITCH_ACCOUNT_URL =
  'https://accounts.google.com/AccountChooser?continue=https%3A%2F%2Ftv.youtube.com%2F';

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

// Google's refusal to sign in inside an embedded browser, recognized from the address and
// page title because the account view runs no script on Google's pages.
export function isGoogleBlockPage(url: string, title?: string): boolean {
  if (httpsHost(url) !== ACCOUNTS_HOST) {
    return false;
  }
  const page = url.toLowerCase();
  const heading = (title ?? '').toLowerCase();
  return (
    page.includes('/signin/rejected') ||
    page.includes('disallowed_useragent') ||
    heading.includes('disallowed_useragent') ||
    heading.includes('browser or app may not be secure')
  );
}

export type AccountViewProgress = {
  sawAccountsPage: boolean;
  blocked: boolean;
  finished: boolean;
};

// The account view is finished on the first tv.youtube.com page after any
// accounts.google.com page; Google's own redirect hosts may sit between the two.
export function accountViewProgress(
  sawAccountsPage: boolean,
  url: string,
  title?: string,
): AccountViewProgress {
  const seen = sawAccountsPage || httpsHost(url) === ACCOUNTS_HOST;
  return {
    sawAccountsPage: seen,
    blocked: isGoogleBlockPage(url, title),
    finished: sawAccountsPage && isVerifyPageUrl(url),
  };
}
