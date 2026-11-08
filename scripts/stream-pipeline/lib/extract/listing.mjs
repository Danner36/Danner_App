// Drives one listing source in the browser context it is handed: open the listing, pick the link
// for this game, open the game page, press play and read the player URL. Which player hosts and
// embed paths count comes only from the provider table.

import {
  PROVIDERS,
  providerForHost,
  providerForUrl,
  providerShowsOffline,
} from './providers.mjs';
import { redactHosts } from '../redact.mjs';

const EMBED_IFRAME_SELECTOR = PROVIDERS.map((provider) => provider.iframeSelector).join(', ');
const PROVIDER_HOSTS = PROVIDERS.map((provider) => provider.host);
const PROVIDER_URL_PATTERN = new RegExp(
  `https?:\\/\\/(?:[a-z0-9-]+\\.)*(?:${PROVIDER_HOSTS.map(escapeRegExp).join('|')})[^\\s"'<>)]*`,
  'gi',
);
export const EXTRACT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
export const PLAYER_EMBED_WAIT_MS = 20_000;
export const EMBED_IFRAME_WAIT_MS = 8_000;
export const POST_PLAY_WAIT_MS = 5_000;
const LINK_NAVIGATION_WAIT_MS = 15_000;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isValidPlayerUrl(url) {
  return providerForUrl(url) !== undefined;
}

// Entries are published with allowInsecureHttp false, which the phone only accepts for https.
// A provider serves the same embed over https, so an http match is upgraded.
export function httpsProviderUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' && providerForHost(parsed.hostname)) {
      parsed.protocol = 'https:';
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase() || undefined;
  } catch {
    return undefined;
  }
}

function rememberPrivateHost(privateHosts, url) {
  const host = hostOf(url);
  if (host) {
    privateHosts.add(host);
  }
}

function isPrivateHost(host, privateHosts) {
  for (const privateHost of privateHosts) {
    if (
      host === privateHost ||
      host.endsWith(`.${privateHost}`) ||
      privateHost.endsWith(`.${host}`)
    ) {
      return true;
    }
  }
  return false;
}

export function urlPathForLog(url) {
  try {
    return new URL(url).pathname || '/';
  } catch {
    return '(invalid URL)';
  }
}

// Listing-site URLs log as a path only. Other URLs log without their query, which can name the
// embedding site (for example a YouTube chat `embed_domain`).
export function describeUrlForLog(url, privateHosts = new Set()) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!host) {
      return redactHosts(url, privateHosts);
    }
    if (isPrivateHost(host, privateHosts)) {
      return parsed.pathname || '/';
    }
    return redactHosts(`${parsed.origin}${parsed.pathname}`, privateHosts);
  } catch {
    return '(invalid URL)';
  }
}

function normalizeUrl(value, baseUrl) {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }
  if (value.startsWith('blob:')) {
    return undefined;
  }
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function isProviderUrl(url) {
  try {
    return providerForHost(new URL(url).hostname) !== undefined;
  } catch {
    return false;
  }
}

export function isIgnoredPlayerFrame(url) {
  if (typeof url !== 'string' || !url.trim()) {
    return false;
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (parsed.pathname.includes('/cdn-cgi/challenge-platform/')) {
      return true;
    }
    if (
      host === 'challenges.cloudflare.com' ||
      host.endsWith('.challenges.cloudflare.com')
    ) {
      return true;
    }
    if (
      host === 'youtube.com' ||
      host === 'www.youtube.com' ||
      host === 'youtube-nocookie.com' ||
      host === 'www.youtube-nocookie.com' ||
      host.endsWith('.youtube.com')
    ) {
      return true;
    }
    return host === 'www.recaptcha.net' || host === 'recaptcha.net';
  } catch {
    return false;
  }
}

export function videoPlayMethod(videoCount) {
  return Number(videoCount) > 0 ? 'video.play()' : undefined;
}

function scorePlayerUrl(url) {
  if (!isValidPlayerUrl(url)) {
    return -1;
  }
  let score = 10;
  const parsed = new URL(url);
  if (parsed.searchParams.has('ad')) {
    score += 2;
  }
  if (parsed.protocol === 'https:') {
    score += 1;
  }
  return score;
}

function pickBestPlayerUrl(urls) {
  const unique = [...new Set(urls.filter(isValidPlayerUrl))];
  if (unique.length === 0) {
    return undefined;
  }
  return unique.sort((first, second) => scorePlayerUrl(second) - scorePlayerUrl(first))[0];
}

function findProviderUrlsInText(text, baseUrl) {
  const matches = [];
  for (const match of text.matchAll(PROVIDER_URL_PATTERN)) {
    const normalized = normalizeUrl(match[0], baseUrl);
    if (normalized && isProviderUrl(normalized)) {
      matches.push(normalized);
    }
  }
  return matches;
}

async function collectDomProviderUrls(page) {
  return page.evaluate((hosts) => {
    const urls = [];
    const remember = (value) => {
      if (typeof value !== 'string' || !value || value.startsWith('blob:')) {
        return;
      }
      try {
        const parsed = new URL(value, window.location.href);
        // Same label-boundary rule as providerForHost; this runs in the page, so it cannot import.
        const hostname = parsed.hostname.toLowerCase();
        if (hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
          urls.push(parsed.toString());
        }
      } catch {}
    };

    for (const iframe of document.querySelectorAll('iframe[src], iframe[data-src]')) {
      remember(iframe.getAttribute('src'));
      remember(iframe.getAttribute('data-src'));
    }
    for (const anchor of document.querySelectorAll('a[href]')) {
      remember(anchor.getAttribute('href'));
    }
    for (const element of document.querySelectorAll('[src], [data-url], [data-stream]')) {
      remember(element.getAttribute('src'));
      remember(element.getAttribute('data-url'));
      remember(element.getAttribute('data-stream'));
    }

    return urls;
  }, PROVIDER_HOSTS);
}

function currentUrls(networkUrls) {
  return typeof networkUrls === 'function' ? networkUrls() : networkUrls;
}

// Best-effort page reads. A navigation in progress destroys the execution context, which must
// not end the run.
async function settle(read, fallback) {
  try {
    return await read();
  } catch {
    return fallback;
  }
}

async function readPlayerFromLoadedPage(page, pageUrl, networkUrls) {
  const html = await settle(() => page.content(), '');
  const htmlMatches = findProviderUrlsInText(html, pageUrl);
  const domMatches = await settle(() => collectDomProviderUrls(page), []);

  const frameUrlMatches = [];
  const frameMatches = [];
  for (const frame of page.frames()) {
    const frameUrl = normalizeUrl(frame.url(), pageUrl);
    if (frameUrl && isProviderUrl(frameUrl)) {
      frameUrlMatches.push(frameUrl);
    }
    try {
      const frameDomMatches = await collectDomProviderUrls(frame);
      frameMatches.push(...frameDomMatches);
      const frameHtml = await frame.content();
      frameMatches.push(...findProviderUrlsInText(frameHtml, frameUrl ?? pageUrl));
    } catch {}
  }

  // Frames the game page actually loaded come first, so they win a score tie.
  const bestUrl = pickBestPlayerUrl([
    ...frameUrlMatches,
    ...frameMatches,
    ...domMatches,
    ...htmlMatches,
    ...currentUrls(networkUrls),
  ]);
  const playerUrl = bestUrl ? httpsProviderUrl(bestUrl) : undefined;
  return { found: Boolean(playerUrl), playerUrl };
}

// An empty result is reported as config_missing, never widened to another team.
function hrefNeedlesFromOptions(options = {}) {
  const values = Array.isArray(options.hrefNeedles) ? options.hrefNeedles : [];
  return values
    .filter((needle) => typeof needle === 'string' && needle.trim())
    .map((needle) => needle.trim().toLowerCase());
}

export function slugifyName(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[&'’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Listing slugs follow team names ("detroit-tigers"). Shorter forms cover listings that drop the
// city or the mascot: word suffixes of at least four characters ("tigers", "red-sox") and
// prefixes of at least two words ("kansas-state"). Longest first.
export function opponentSlugVariants(opponentName) {
  const words = slugifyName(opponentName).split('-').filter(Boolean);
  if (words.length === 0) {
    return [];
  }
  const variants = new Set([words.join('-')]);
  for (let index = 1; index < words.length; index += 1) {
    const suffix = words.slice(index).join('-');
    if (suffix.length >= 4) {
      variants.add(suffix);
    }
    if (index >= 2) {
      variants.add(words.slice(0, index).join('-'));
    }
  }
  return [...variants].sort((first, second) => second.length - first.length);
}

function opponentMatchLength(href, needles, variants) {
  let text;
  try {
    const parsed = new URL(href);
    text = decodeURIComponent(`${parsed.pathname}${parsed.search}`).toLowerCase();
  } catch {
    return 0;
  }
  // The team's own tokens are removed first so "iowa-state-cyclones" cannot satisfy an
  // opponent variant such as "iowa-state".
  for (const needle of needles) {
    text = text.split(needle).join(' ');
  }
  for (const variant of variants) {
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(variant)}($|[^a-z0-9])`);
    if (pattern.test(text)) {
      return variant.length;
    }
  }
  return 0;
}

function listingLinkKey(href) {
  try {
    const parsed = new URL(href);
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return undefined;
  }
}

// Chooses the one listing link for this game. Every needle must appear in the href. When more
// than one link matches and an opponent is known, the opponent narrows them (the longest
// matching variant wins); requireOpponent: true also demands the opponent on a lone match.
// More than one remaining link fails as ambiguous_link unless exactly one carries the highest
// listing-folder score, so a football link is never published for a basketball game or game 1
// for game 2.
export function selectListingLink(links, options = {}) {
  const needles = hrefNeedlesFromOptions(options);
  if (needles.length === 0) {
    return { failure: 'config_missing', matches: [] };
  }

  const seen = new Set();
  const matches = [];
  for (const link of links ?? []) {
    const key = typeof link?.href === 'string' ? listingLinkKey(link.href) : undefined;
    if (!key || seen.has(key)) {
      continue;
    }
    const hrefLower = link.href.toLowerCase();
    if (!needles.every((needle) => hrefLower.includes(needle))) {
      continue;
    }
    seen.add(key);
    matches.push(link);
  }
  if (matches.length === 0) {
    return { failure: 'link_not_found', matches };
  }

  let narrowed = matches;
  const variants = opponentSlugVariants(options.opponentName);
  const enforceOpponent = options.requireOpponent === true;
  if (variants.length > 0 && (enforceOpponent || matches.length > 1)) {
    const scored = matches.map((link) => ({
      length: opponentMatchLength(link.href, needles, variants),
      link,
    }));
    const best = Math.max(...scored.map((entry) => entry.length));
    if (best === 0 && enforceOpponent) {
      return { failure: 'opponent_not_found', matches };
    }
    if (best > 0) {
      narrowed = scored.filter((entry) => entry.length === best).map((entry) => entry.link);
    }
  }

  if (narrowed.length > 1) {
    const topScore = Math.max(...narrowed.map((link) => link.score ?? 0));
    const top = narrowed.filter((link) => (link.score ?? 0) === topScore);
    if (top.length !== 1) {
      return { failure: 'ambiguous_link', matches: narrowed };
    }
    narrowed = top;
  }

  return { link: narrowed[0], matches };
}

export function extractRunsHeaded() {
  if (process.env.EXTRACT_HEADLESS === '1') {
    return false;
  }
  if (process.env.EXTRACT_HEADED === '1') {
    return true;
  }
  return process.env.GITHUB_ACTIONS === 'true';
}

export async function launchExtractBrowser() {
  const { chromium } = await import('playwright');
  return chromium.launch({
    args: ['--disable-blink-features=AutomationControlled'],
    headless: !extractRunsHeaded(),
  });
}

export async function newExtractContext(browser) {
  return browser.newContext({
    locale: 'en-US',
    timezoneId: 'America/New_York',
    userAgent: EXTRACT_USER_AGENT,
    viewport: { width: 1280, height: 720 },
  });
}

// Polls until the listing yields a usable link or a definite ambiguity. A listing still loading
// rows, or mid-navigation through a challenge, keeps polling until the deadline. A closed page
// or an abandoned attempt ends the wait, because the poll's sleep rejects at once on a closed page.
async function waitForListingLink(page, options, timeoutMs = 15_000, isAbandoned = () => false) {
  const deadline = Date.now() + timeoutMs;
  let selection = selectListingLink(await findInnerLinks(page, options), options);
  while (
    !selection.link &&
    selection.failure !== 'ambiguous_link' &&
    Date.now() < deadline &&
    !page.isClosed() &&
    !isAbandoned()
  ) {
    await settle(() => page.waitForTimeout(1_000), undefined);
    selection = selectListingLink(await findInnerLinks(page, options), options);
  }
  return selection;
}

export function isCloudflareChallengeTitle(title) {
  return typeof title === 'string' && title.toLowerCase().includes('just a moment');
}

export function isChallengeFrameUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      parsed.pathname.includes('/cdn-cgi/challenge-platform/') ||
      host === 'challenges.cloudflare.com' ||
      host.endsWith('.challenges.cloudflare.com')
    );
  } catch {
    return false;
  }
}

export function httpFailureCode(status) {
  if (typeof status !== 'number' || status < 400) {
    return undefined;
  }
  return status >= 500 ? 'http_5xx' : 'http_4xx';
}

// A challenge is answered with 403 or 503 and can clear in the same page load, so those two
// statuses are not a failure while a challenge marker is present.
async function isChallengeResponse(page, response) {
  const status = response?.status?.();
  if (status !== 403 && status !== 503) {
    return false;
  }
  return response.headers?.()['cf-mitigated'] === 'challenge' || pageShowsChallenge(page);
}

async function pageShowsChallenge(page) {
  const title = await settle(() => page.title(), '');
  return (
    isCloudflareChallengeTitle(title) ||
    page.frames().some((frame) => isChallengeFrameUrl(frame.url()))
  );
}

export function navigationFailureCode(error) {
  return error?.name === 'TimeoutError' ? 'nav_timeout' : 'nav_error';
}

// Reached only when no provider URL was found: something embeds a player that no provider row
// recognizes, or the page has no player at all.
export function playerFailureCode({ frameCount, iframeCount, videoCount }) {
  return frameCount > 0 || iframeCount > 0 || videoCount > 0
    ? 'unknown_provider'
    : 'player_not_found';
}

async function playerPageCounts(page) {
  const summary = await playerPageSummary(page);
  const videoCount = await settle(
    () => page.evaluate(() => document.querySelectorAll('video').length),
    0,
  );
  return {
    cloudflareChallenge: summary.cloudflareChallenge,
    title: summary.title,
    // playerPageSummary already dropped challenge, YouTube and reCAPTCHA frames; the first
    // remaining frame is the game page itself.
    frameCount: Math.max(summary.frameUrls.length - 1, 0),
    iframeCount: summary.iframes.filter((url) => !isIgnoredPlayerFrame(url)).length,
    videoCount,
  };
}

async function embedFailureCode(page, capture, playerUrl) {
  if (httpFailureCode(capture.embedStatus(playerUrl))) {
    return 'unplayable';
  }
  const provider = providerForUrl(playerUrl);
  if (!provider?.offlineMarkers.length) {
    return undefined;
  }
  const frame = page.frames().find((candidate) => providerForUrl(candidate.url()) === provider);
  const text = await settle(() => frame.content(), '');
  return providerShowsOffline(provider, text) ? 'unplayable' : undefined;
}

async function playerPageSummary(page) {
  const frameUrls = page
    .frames()
    .map((frame) => frame.url())
    .filter((url) => url && url !== 'about:blank' && !isIgnoredPlayerFrame(url));
  const details = await settle(
    () =>
      page.evaluate(() => ({
        iframes: [...document.querySelectorAll('iframe[src], iframe[data-src]')]
          .map((node) => {
            const value = node.getAttribute('src') || node.getAttribute('data-src');
            try {
              return value ? new URL(value, window.location.href).toString() : undefined;
            } catch {
              return undefined;
            }
          })
          .filter(Boolean)
          .slice(0, 12),
        title: document.title,
        url: window.location.href,
      })),
    { iframes: [], title: '', url: page.url() },
  );
  return {
    cloudflareChallenge: isCloudflareChallengeTitle(details.title),
    frameUrls: frameUrls.slice(0, 12),
    iframes: details.iframes,
    title: details.title,
    url: details.url,
  };
}

function networkHasPlayer(networkUrls) {
  return currentUrls(networkUrls).some((url) => isValidPlayerUrl(url));
}

function pageHasProviderFrame(page) {
  return page.frames().some((frame) => {
    const frameUrl = frame.url();
    return frameUrl && isProviderUrl(frameUrl);
  });
}

export async function waitForPlayerEmbeds(page, networkUrls, timeoutMs = PLAYER_EMBED_WAIT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (networkHasPlayer(networkUrls) || pageHasProviderFrame(page)) {
      return true;
    }
    const summary = await playerPageSummary(page);
    if (summary.iframes.length > 0 || summary.frameUrls.length > 1) {
      return true;
    }
    await page.waitForTimeout(1_000);
  }
  return false;
}

async function primePlayerPage(page) {
  try {
    await page.evaluate(() => {
      window.scrollTo(0, Math.floor(document.body.scrollHeight / 2));
    });
    await page.mouse.click(640, 360);
  } catch {}
}

async function clickListingAnchor(page, href) {
  try {
    return await page.evaluate((target) => {
      for (const anchor of document.querySelectorAll('a[href]')) {
        const rawHref = anchor.getAttribute('href');
        if (!rawHref) {
          continue;
        }
        let absoluteHref;
        try {
          absoluteHref = new URL(rawHref, window.location.href).toString();
        } catch {
          continue;
        }
        if (absoluteHref !== target) {
          continue;
        }
        anchor.click();
        return true;
      }
      return false;
    }, href);
  } catch {
    // The click can navigate before evaluate returns; the URL wait below decides.
    return true;
  }
}

async function openInnerPageFromLink(page, innerLink, options, capture) {
  const timeoutMs = (options.timeoutSeconds ?? 90) * 1000;
  const listingUrl = page.url();
  capture.armForNavigation();

  // Waiting starts before the click so a fast navigation is not missed. waitForLoadState alone
  // returns at once because the listing itself is already loaded.
  const navigated = page
    .waitForURL((url) => url.toString() !== listingUrl, {
      timeout: Math.min(timeoutMs, LINK_NAVIGATION_WAIT_MS),
      waitUntil: 'domcontentloaded',
    })
    .then(
      () => true,
      () => false,
    );
  const clicked = await clickListingAnchor(page, innerLink.href);

  if (!clicked || !(await navigated)) {
    await page.goto(innerLink.href, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });
  }

  await settle(() => page.waitForTimeout(3_000), undefined);
}

async function listingPageSummary(page) {
  const challengeFrames = page
    .frames()
    .map((frame) => frame.url())
    .filter((url) => isIgnoredPlayerFrame(url));
  const details = await settle(
    () =>
      page.evaluate(() => ({
        anchorCount: document.querySelectorAll('a[href]').length,
        title: document.title,
        url: window.location.href,
      })),
    { anchorCount: 0, title: '', url: page.url() },
  );
  return { ...details, challengeFrames };
}

async function findInnerLinks(page, options) {
  const hrefNeedles = hrefNeedlesFromOptions(options);
  if (hrefNeedles.length === 0) {
    return [];
  }
  const leagueHints = (options.leagueHints ?? []).map((hint) => hint.toLowerCase());

  return settle(
    () =>
      page.evaluate(
        ({ hrefNeedles: needles, leagueHints: hints }) => {
          const matches = [];

          for (const anchor of document.querySelectorAll('a[href]')) {
            const href = anchor.getAttribute('href');
            if (
              !href ||
              href.startsWith('#') ||
              href.toLowerCase().startsWith('javascript:')
            ) {
              continue;
            }

            let absoluteHref;
            try {
              absoluteHref = new URL(href, window.location.href).toString();
            } catch {
              continue;
            }

            const hrefLower = absoluteHref.toLowerCase();
            if (!needles.every((needle) => hrefLower.includes(needle))) {
              continue;
            }

            matches.push({
              href: absoluteHref,
              hrefNeedleMatched: true,
              score: hints.some((hint) => hrefLower.includes(hint)) ? 13 : 10,
              text: anchor.textContent?.replace(/\s+/g, ' ').trim() ?? '',
            });
          }

          matches.sort((first, second) => second.score - first.score);
          return matches;
        },
        { hrefNeedles, leagueHints },
      ),
    [],
  );
}

const PLAY_SELECTORS = [
  '.media-control-button.media-control-icon.paused',
  'button[aria-label*="Play" i]',
  'button[title*="Play" i]',
  '.plyr__control--overlaid',
  '.vjs-big-play-button',
  '.play-button',
  '[class*="big-play" i]',
  '[class*="play-btn" i]',
  '[class*="play_button" i]',
  '.jw-icon-playback',
  'video',
];

async function clickPlayInTarget(target) {
  for (const selector of PLAY_SELECTORS) {
    const locator = target.locator(selector).first();
    if ((await settle(() => locator.count(), 0)) === 0) {
      continue;
    }
    try {
      await locator.click({ force: true, timeout: 4000 });
      return selector;
    } catch {}
  }

  try {
    const videoCount = await target.evaluate(() => {
      const videos = document.querySelectorAll('video');
      for (const video of videos) {
        video.muted = true;
        void video.play();
      }
      return videos.length;
    });
    return videoPlayMethod(videoCount);
  } catch {}

  return undefined;
}

async function pressPlayEverywhere(page) {
  await primePlayerPage(page);

  const candidates = [];
  for (const frame of page.frames()) {
    const url = frame.url();
    if (isIgnoredPlayerFrame(url)) {
      continue;
    }
    const isMain = frame === page.mainFrame();
    candidates.push({
      rank: !isMain && isProviderUrl(url) ? 0 : isMain ? 1 : 2,
      target: isMain ? page : frame,
    });
  }
  candidates.sort((first, second) => first.rank - second.rank);

  let pressed = false;
  for (const { target } of candidates) {
    if (await clickPlayInTarget(target)) {
      pressed = true;
    }
  }

  try {
    await page.waitForSelector(EMBED_IFRAME_SELECTOR, { timeout: EMBED_IFRAME_WAIT_MS });
  } catch {}

  await page.waitForTimeout(POST_PLAY_WAIT_MS);
  return pressed;
}

async function readPlayerWithRetry(page, pageUrl, networkUrls) {
  const firstPass = await readPlayerFromLoadedPage(page, pageUrl, networkUrls);
  if (firstPass.found) {
    return firstPass;
  }

  await settle(() => page.waitForTimeout(3_000), undefined);
  return readPlayerFromLoadedPage(page, pageUrl, networkUrls);
}

// Collects provider URLs seen on the network. Every URL is tagged with the main-frame document it
// belongs to; armForNavigation() makes the next main-frame commit start a new document, and
// urls() returns only the current document's URLs. So a listing page's requests, including
// responses that finish after the game page commits, never count as the game page's player.
export function createPlayerCapture(page, pageUrl) {
  let armed = false;
  let documentIndex = 0;
  let documentResponse;
  const embedStatuses = new Map();
  const entries = [];
  const requestDocuments = new WeakMap();

  const documentForRequest = (request) => {
    if (requestDocuments.has(request)) {
      return requestDocuments.get(request);
    }
    let index = documentIndex;
    try {
      // The game page's own navigation request is issued before its commit.
      if (armed && request.isNavigationRequest() && request.frame() === page.mainFrame()) {
        index = documentIndex + 1;
      }
    } catch {}
    requestDocuments.set(request, index);
    return index;
  };

  const remember = (url, index, baseUrl) => {
    const normalized = normalizeUrl(url, baseUrl);
    if (normalized && isProviderUrl(normalized)) {
      entries.push({ index, url: normalized });
    }
  };

  page.on('request', (request) => {
    remember(request.url(), documentForRequest(request), pageUrl);
  });
  const rememberStatus = (response) => {
    try {
      if (isValidPlayerUrl(response.url())) {
        embedStatuses.set(httpsProviderUrl(response.url()), response.status());
      }
      if (response.request().isNavigationRequest() && response.frame() === page.mainFrame()) {
        documentResponse = response;
      }
    } catch {}
  };

  page.on('response', async (response) => {
    const index = documentForRequest(response.request());
    remember(response.url(), index, pageUrl);
    rememberStatus(response);
    try {
      const body = await response.text();
      for (const match of findProviderUrlsInText(body, response.url())) {
        entries.push({ index, url: match });
      }
    } catch {}
  });
  page.on('framenavigated', (frame) => {
    if (armed && frame === page.mainFrame()) {
      armed = false;
      documentIndex += 1;
    }
  });

  return {
    armForNavigation() {
      armed = true;
    },
    // The newest main-frame document response, so a click navigation's status is visible.
    documentResponse() {
      return documentResponse;
    },
    embedStatus(url) {
      return embedStatuses.get(httpsProviderUrl(url));
    },
    urls() {
      return entries
        .filter((entry) => entry.index === documentIndex)
        .map((entry) => entry.url);
    },
  };
}

async function openPageWithCapture(context, pageUrl, options) {
  const page = await context.newPage();
  const capture = createPlayerCapture(page, pageUrl);

  // Every main-frame host is reported as it commits, so a redirect target is masked before
  // anything can print it.
  const onHost = options.sourceAttempt.onHost;
  if (onHost) {
    page.on('framenavigated', (frame) => {
      const host = /^https?:/i.test(frame.url()) ? hostOf(frame.url()) : undefined;
      if (host && frame === page.mainFrame()) {
        onHost(host);
      }
    });
  }

  const response = await page.goto(pageUrl, {
    waitUntil: 'domcontentloaded',
    timeout: (options.timeoutSeconds ?? 90) * 1000,
  });
  await settle(() => page.waitForTimeout(POST_PLAY_WAIT_MS), undefined);

  return { capture, page, response };
}

function linkFailureLines(selection, options, forLog) {
  const paths = selection.matches.slice(0, 5).map((link) => forLog(link.href));
  if (selection.failure === 'ambiguous_link') {
    return [
      `More than one listing link matches this game: ${paths.join(' ')}. Add a distinguishing href needle for this sport.`,
    ];
  }
  if (selection.failure === 'opponent_not_found') {
    return [
      `No matching listing link names ${options.opponentName}. Matching paths: ${paths.join(' ')}.`,
    ];
  }
  return [];
}

// Runs one source inside the caller's browser context. Every failure comes back as a
// listing-failover code in `failure`; a found player comes back as `playerUrl`.
export async function extractFromListing(baseUrl, options = {}) {
  const attempt = options.sourceAttempt ?? {};
  const hrefNeedles = hrefNeedlesFromOptions(options);
  const hrefNeedle = hrefNeedles.join(' + ');
  const logLines = [];
  const game = options.game;
  const opponentName =
    typeof options.opponentName === 'string' && options.opponentName.trim()
      ? options.opponentName.trim()
      : undefined;
  const selectionOptions = {
    hrefNeedles,
    leagueHints: options.leagueHints,
    opponentName,
    requireOpponent: options.requireOpponent === true,
  };
  const privateHosts = attempt.privateHosts ?? new Set();
  const notePrivateUrl = (url) => {
    rememberPrivateHost(privateHosts, url);
    const host = hostOf(url);
    if (host) {
      attempt.onHost?.(host);
    }
  };
  notePrivateUrl(baseUrl);
  const forLog = (url) => describeUrlForLog(url, privateHosts);
  const remember = (message) => {
    logLines.push(message);
  };
  const failureResult = (failure) => ({ failure, found: false, logLines });
  const rememberGame = () => {
    if (game) {
      remember(`Using game date ${game.officialDate} game ${game.gameNumber} vs ${game.opponentName}.`);
    }
  };

  if (hrefNeedles.length === 0) {
    remember('No listing href needles are configured.');
    return failureResult('config_missing');
  }

  try {
    if (extractRunsHeaded()) {
      remember('Running headed browser for Cloudflare-protected pages.');
    }
    remember(`Opening listing path ${urlPathForLog(baseUrl)}`);

    let opened;
    try {
      opened = await openPageWithCapture(attempt.context, baseUrl, { ...options, sourceAttempt: attempt });
    } catch (error) {
      remember('Listing page did not load.');
      return failureResult(navigationFailureCode(error));
    }
    const { capture, page: basePage, response: baseResponse } = opened;
    notePrivateUrl(basePage.url());
    remember('Base page loaded.');

    // A challenge that already cleared replaced the document, so the newest response decides.
    const listingResponse = () => capture.documentResponse() ?? baseResponse;
    const firstResponse = listingResponse();
    const httpFailure = httpFailureCode(firstResponse?.status?.());
    if (httpFailure && !(await isChallengeResponse(basePage, firstResponse))) {
      remember(`Listing page answered HTTP ${firstResponse.status()}.`);
      return failureResult(httpFailure);
    }
    attempt.onStage?.('link');

    remember(
      opponentName
        ? `Searching page elements for href containing "${hrefNeedle}" and opponent ${opponentName}...`
        : `Searching page elements for href containing "${hrefNeedle}"...`,
    );

    const selection = await waitForListingLink(
      basePage,
      selectionOptions,
      attempt.linkWaitMs,
      attempt.isAbandoned,
    );
    const innerLink = selection.link;
    for (const match of selection.matches ?? []) {
      notePrivateUrl(match.href);
    }

    if (!innerLink) {
      const listing = await listingPageSummary(basePage);
      remember('No video found.');
      if (
        (selection.failure ?? 'link_not_found') === 'link_not_found' &&
        ((await isChallengeResponse(basePage, listingResponse())) ||
          (await pageShowsChallenge(basePage)))
      ) {
        remember('The listing is still showing a challenge page.');
        rememberGame();
        return failureResult('bot_challenge');
      }
      for (const line of linkFailureLines(selection, selectionOptions, forLog)) {
        remember(line);
      }
      remember(`Listing page at ${forLog(listing.url)} has ${listing.anchorCount} links.`);
      if (isCloudflareChallengeTitle(listing.title)) {
        remember(`Cloudflare challenge page title: "${listing.title}".`);
      }
      if (listing.challengeFrames.length > 0) {
        remember(`Challenge frame present: ${forLog(listing.challengeFrames[0])}`);
      }
      rememberGame();
      return failureResult(selection.failure ?? 'link_not_found');
    }

    notePrivateUrl(innerLink.href);
    remember(`Found link element: "${innerLink.text}"`);
    remember(`Link path is: ${forLog(innerLink.href)}`);
    remember(`Opening video page: ${forLog(innerLink.href)}`);

    attempt.onStage?.('game');
    try {
      await openInnerPageFromLink(basePage, innerLink, options, capture);
    } catch {
      remember('Video page did not load.');
      return failureResult('game_nav');
    }
    const innerPage = basePage;
    notePrivateUrl(innerPage.url());
    remember('Video page loaded.');

    const gameResponse = capture.documentResponse();
    if (httpFailureCode(gameResponse?.status?.()) && !(await isChallengeResponse(innerPage, gameResponse))) {
      remember('Video page returned an error.');
      return failureResult('game_nav');
    }

    const embedsReady = await waitForPlayerEmbeds(innerPage, capture.urls, attempt.embedWaitMs);
    // A challenge that cleared during the wait replaced the document with a successful one.
    if (httpFailureCode(capture.documentResponse()?.status?.())) {
      remember('Video page returned an error.');
      return failureResult('game_nav');
    }
    attempt.onStage?.('player');
    if (embedsReady) {
      remember('Player embeds are present on the video page.');
    } else {
      const playerBeforePlay = await playerPageSummary(innerPage);
      remember('Player embeds did not appear on the video page.');
      if (playerBeforePlay.cloudflareChallenge) {
        remember(`Cloudflare challenge page is still showing: "${playerBeforePlay.title}".`);
      }
    }

    remember('Pressing play on the video player...');
    remember(
      (await pressPlayEverywhere(innerPage))
        ? 'Play activated using: player control'
        : 'No play control was found; scanning anyway.',
    );

    remember('Scanning video page for a provider player URL...');
    const extraction = await readPlayerWithRetry(innerPage, innerLink.href, capture.urls);
    rememberGame();

    if (!extraction.playerUrl) {
      const counts = await playerPageCounts(innerPage);
      remember('No video found.');
      remember(
        `Player page has ${counts.frameCount} frames, ${counts.iframeCount} iframes and ${counts.videoCount} videos.`,
      );
      if (counts.cloudflareChallenge) {
        remember('The video page is still showing a challenge page.');
      }
      return failureResult(playerFailureCode(counts));
    }

    remember(`Inner player URL is: ${extraction.playerUrl}`);
    attempt.onStage?.('entry');
    const embedFailure = await embedFailureCode(innerPage, capture, extraction.playerUrl);
    if (embedFailure) {
      remember('The player page did not load a playable embed.');
      return failureResult(embedFailure);
    }

    return { found: true, logLines, playerUrl: extraction.playerUrl };
  } catch (error) {
    // Playwright errors quote the URL being loaded.
    throw new Error(
      redactHosts(error instanceof Error ? error.message : String(error), privateHosts),
    );
  }
}
