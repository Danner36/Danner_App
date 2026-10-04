const GOOZ_HOST = 'gooz.aapmains.net';
const GOOZ_EMBED_PATH = /\/new-stream-embed\/([^/?#]+)/;
const GOOZ_URL_PATTERN =
  /https?:\/\/(?:[a-z0-9-]+\.)*gooz\.aapmains\.net[^\s"'<>)]*/gi;
export const EXTRACT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
export const PLAYER_EMBED_WAIT_MS = 20_000;
export const GOOZ_IFRAME_WAIT_MS = 8_000;
export const POST_PLAY_WAIT_MS = 5_000;
const LINK_NAVIGATION_WAIT_MS = 15_000;

// Matches on a label boundary, the same way GOOZ_URL_PATTERN does. A bare endsWith would
// also accept `notgooz.aapmains.net`, letting a squatted sibling host through the checks
// that decide what gets published into the streams document.
export function isGoozHost(hostname) {
  const host = String(hostname).toLowerCase();
  return host === GOOZ_HOST || host.endsWith(`.${GOOZ_HOST}`);
}

function goozEmbedId(url) {
  try {
    const parsed = new URL(url);
    if (!isGoozHost(parsed.hostname)) {
      return undefined;
    }
    const match = parsed.pathname.match(GOOZ_EMBED_PATH);
    if (!match) {
      return undefined;
    }
    const segment = match[1];
    if (!segment || !/\d/.test(segment)) {
      return undefined;
    }
    return segment;
  } catch {
    return undefined;
  }
}

export function isValidGoozPlayerUrl(url) {
  return goozEmbedId(url) !== undefined;
}

// Entries are published with allowInsecureHttp false, which the phone only accepts for https.
// The provider serves the same embed over https, so an http match is upgraded.
export function httpsProviderUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' && isGoozHost(parsed.hostname)) {
      parsed.protocol = 'https:';
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

const LISTING_HOST_LABEL = '[listing]';

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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// The listing host, its full hrefs, and extract.baseUrl stay out of public Actions logs.
export function redactHosts(text, privateHosts) {
  let redacted = String(text);
  for (const host of privateHosts) {
    if (host) {
      redacted = redacted.replace(new RegExp(escapeRegExp(host), 'gi'), LISTING_HOST_LABEL);
    }
  }
  return redacted;
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

function isGoozUrl(url) {
  try {
    return isGoozHost(new URL(url).hostname);
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

function scoreGoozUrl(url) {
  if (!isValidGoozPlayerUrl(url)) {
    return -1;
  }
  let score = 0;
  const parsed = new URL(url);
  if (parsed.pathname.includes('/new-stream-embed/')) {
    score += 10;
  }
  if (parsed.searchParams.has('ad')) {
    score += 2;
  }
  if (parsed.protocol === 'https:') {
    score += 1;
  }
  return score;
}

function pickBestGoozUrl(urls) {
  const unique = [...new Set(urls.filter(isValidGoozPlayerUrl))];
  if (unique.length === 0) {
    return undefined;
  }
  return unique.sort((first, second) => scoreGoozUrl(second) - scoreGoozUrl(first))[0];
}

function findGoozInText(text, baseUrl) {
  const matches = [];
  for (const match of text.matchAll(GOOZ_URL_PATTERN)) {
    const normalized = normalizeUrl(match[0], baseUrl);
    if (normalized && isGoozUrl(normalized)) {
      matches.push(normalized);
    }
  }
  return matches;
}

async function collectDomGoozUrls(page) {
  return page.evaluate((host) => {
    const urls = [];
    const remember = (value) => {
      if (typeof value !== 'string' || !value || value.startsWith('blob:')) {
        return;
      }
      try {
        const parsed = new URL(value, window.location.href);
        // Same label-boundary rule as isGoozHost; this runs in the page, so it cannot import.
        const hostname = parsed.hostname.toLowerCase();
        if (hostname === host || hostname.endsWith(`.${host}`)) {
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
  }, GOOZ_HOST);
}

function buildStreamEntry(goozUrl, game) {
  const entry = {
    kind: 'web',
    url: goozUrl,
    allowInsecureHttp: false,
    trustedHosts: [],
  };

  if (!game) {
    return entry;
  }

  return {
    gameDates: [game.officialDate],
    gameNumbers: [game.gameNumber],
    ...entry,
    ...(game.sport ? { sport: game.sport } : {}),
  };
}

export function buildBlankStreamEntry(game) {
  return {
    gameDates: game ? [game.officialDate] : ['YYYY-MM-DD'],
    gameNumbers: game ? [game.gameNumber] : [1],
    kind: 'web',
    url: '',
    allowInsecureHttp: false,
    trustedHosts: [],
    ...(game?.sport ? { sport: game.sport } : {}),
  };
}

function pushStep(steps, step, message, details = {}) {
  const entry = { step, message, ...details };
  steps.push(entry);
  if (typeof steps.onStep === 'function') {
    steps.onStep(entry);
  }
  return entry;
}

export function formatExtractionLog(result) {
  if (Array.isArray(result.logLines) && result.logLines.length > 0) {
    return result.logLines.join('\n');
  }

  const lines = (result.steps ?? []).map((entry) => entry.message);
  if (result.goozUrl) {
    lines.push(`Inner gooz URL is: ${result.goozUrl}`);
  }
  return lines.join('\n');
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

async function extractGoozFromLoadedPage(page, pageUrl, networkUrls) {
  const html = await settle(() => page.content(), '');
  const htmlMatches = findGoozInText(html, pageUrl);
  const domMatches = await settle(() => collectDomGoozUrls(page), []);

  const frameUrlMatches = [];
  const frameMatches = [];
  for (const frame of page.frames()) {
    const frameUrl = normalizeUrl(frame.url(), pageUrl);
    if (frameUrl && isGoozUrl(frameUrl)) {
      frameUrlMatches.push(frameUrl);
    }
    try {
      const frameDomMatches = await collectDomGoozUrls(frame);
      frameMatches.push(...frameDomMatches);
      const frameHtml = await frame.content();
      frameMatches.push(...findGoozInText(frameHtml, frameUrl ?? pageUrl));
    } catch {}
  }

  // Frames the game page actually loaded come first, so they win a score tie.
  const ordered = [
    ...frameUrlMatches,
    ...frameMatches,
    ...domMatches,
    ...htmlMatches,
    ...currentUrls(networkUrls),
  ];
  const bestUrl = pickBestGoozUrl(ordered);
  const goozUrl = bestUrl ? httpsProviderUrl(bestUrl) : undefined;

  const candidates = [...new Set(ordered)]
    .filter(isValidGoozPlayerUrl)
    .sort((first, second) => scoreGoozUrl(second) - scoreGoozUrl(first));

  return {
    candidates,
    found: Boolean(goozUrl),
    goozUrl,
    streamEntry: goozUrl ? buildStreamEntry(goozUrl, undefined) : undefined,
  };
}

function featuredGameFromOptions(options = {}) {
  const game = options.game;
  if (!game || typeof game !== 'object') {
    return undefined;
  }
  if (typeof game.officialDate !== 'string' || !game.officialDate.trim()) {
    return undefined;
  }
  return game;
}

function rememberFeaturedGame(steps, remember, game) {
  if (!game) {
    return;
  }
  const message = `Using game date ${game.officialDate} game ${game.gameNumber} vs ${game.opponentName}.`;
  pushStep(steps, 'featured_game', message, { game, success: true });
  remember(message);
}

// No default team: an empty result is reported as config_missing, never widened to another team.
function hrefNeedlesFromOptions(options = {}) {
  const values = Array.isArray(options.hrefNeedles)
    ? options.hrefNeedles
    : [options.hrefNeedle];
  return values
    .filter((needle) => typeof needle === 'string' && needle.trim())
    .map((needle) => needle.trim().toLowerCase());
}

export function slugifyName(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[&'\u2019.]/g, '')
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

async function launchExtractBrowser(options = {}) {
  const { chromium } = await import('playwright');
  const headless =
    options.headless ??
    (options.forceHeaded ? false : !extractRunsHeaded());
  return chromium.launch({
    args: ['--disable-blink-features=AutomationControlled'],
    headless,
  });
}

async function newExtractContext(browser) {
  return browser.newContext({
    locale: 'en-US',
    timezoneId: 'America/New_York',
    userAgent: EXTRACT_USER_AGENT,
    viewport: { width: 1280, height: 720 },
  });
}

// Polls until the listing yields a usable link or a definite ambiguity. A listing still loading
// rows, or mid-navigation through a challenge, keeps polling until the deadline.
async function waitForListingLink(page, options, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let selection = selectListingLink(await findInnerLinkByHref(page, options), options);
  while (
    !selection.link &&
    selection.failure !== 'ambiguous_link' &&
    Date.now() < deadline
  ) {
    await settle(() => page.waitForTimeout(1_000), undefined);
    selection = selectListingLink(await findInnerLinkByHref(page, options), options);
  }
  return selection;
}

export function isCloudflareChallengeTitle(title) {
  return (
    typeof title === 'string' &&
    title.toLowerCase().includes('just a moment')
  );
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

function networkHasGooz(networkUrls) {
  return currentUrls(networkUrls).some((url) => isValidGoozPlayerUrl(url));
}

function pageHasGoozFrame(page) {
  return page.frames().some((frame) => {
    const frameUrl = frame.url();
    return frameUrl && isGoozUrl(frameUrl);
  });
}

export async function waitForPlayerEmbeds(page, networkUrls, timeoutMs = PLAYER_EMBED_WAIT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (networkHasGooz(networkUrls) || pageHasGoozFrame(page)) {
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
  capture?.armForNavigation();

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

async function findInnerLinkByHref(page, options) {
  const hrefNeedles = hrefNeedlesFromOptions(options);
  if (hrefNeedles.length === 0) {
    return [];
  }

  return settle(() => page.evaluate(({ hrefNeedles }) => {
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
      if (!hrefNeedles.every((needle) => hrefLower.includes(needle))) {
        continue;
      }

      const text = anchor.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      let score = 10;
      if (
        hrefLower.includes('/mlb/') ||
        hrefLower.includes('/nfl/') ||
        hrefLower.includes('/stream/')
      ) {
        score += 3;
      }

      matches.push({
        href: absoluteHref,
        hrefNeedleMatched: true,
        score,
        text,
      });
    }

    matches.sort((first, second) => second.score - first.score);
    return matches;
  }, { hrefNeedles }), []);
}

async function activateVideoPlayer(page, networkUrls = [], options = {}) {
  if (!options.skipEmbedWait) {
    await waitForPlayerEmbeds(
      page,
      networkUrls,
      options.embedWaitMs ?? PLAYER_EMBED_WAIT_MS,
    );
  }
  await primePlayerPage(page);

  const playSelectors = [
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
    for (const selector of playSelectors) {
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

  const candidates = [];
  for (const frame of page.frames()) {
    const url = frame.url();
    if (isIgnoredPlayerFrame(url)) {
      continue;
    }
    const isMain = frame === page.mainFrame();
    candidates.push({
      label: isMain ? undefined : url,
      rank: !isMain && isGoozUrl(url) ? 0 : isMain ? 1 : 2,
      target: isMain ? page : frame,
    });
  }
  candidates.sort((first, second) => first.rank - second.rank);

  let method;
  for (const { label, target } of candidates) {
    const frameMethod = await clickPlayInTarget(target);
    if (!frameMethod) {
      continue;
    }
    method = label ? `${label}: ${frameMethod}` : frameMethod;
  }

  try {
    await page.waitForSelector('iframe[src*="gooz.aapmains.net"]', {
      timeout: GOOZ_IFRAME_WAIT_MS,
    });
  } catch {}

  await page.waitForTimeout(POST_PLAY_WAIT_MS);
  return method;
}

async function extractGoozWithRetries(page, pageUrl, networkUrls) {
  const firstPass = await extractGoozFromLoadedPage(page, pageUrl, networkUrls);
  if (firstPass.found) {
    return firstPass;
  }

  await settle(() => page.waitForTimeout(3_000), undefined);
  return extractGoozFromLoadedPage(page, pageUrl, networkUrls);
}

// Collects provider URLs seen on the network. Every URL is tagged with the main-frame document it
// belongs to; armForNavigation() makes the next main-frame commit start a new document, and
// urls() returns only the current document's URLs. So a listing page's requests, including
// responses that finish after the game page commits, never count as the game page's player.
export function createGoozCapture(page, pageUrl) {
  let armed = false;
  let documentIndex = 0;
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
    if (normalized && isGoozUrl(normalized)) {
      entries.push({ index, url: normalized });
    }
  };

  page.on('request', (request) => {
    remember(request.url(), documentForRequest(request), pageUrl);
  });
  page.on('response', async (response) => {
    const index = documentForRequest(response.request());
    remember(response.url(), index, pageUrl);
    try {
      const body = await response.text();
      for (const match of findGoozInText(body, response.url())) {
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
    urls() {
      return entries
        .filter((entry) => entry.index === documentIndex)
        .map((entry) => entry.url);
    },
  };
}

async function openPageWithGoozCapture(context, pageUrl, options) {
  const timeoutMs = (options.timeoutSeconds ?? 90) * 1000;
  const page = await context.newPage();
  const capture = createGoozCapture(page, pageUrl);

  await page.goto(pageUrl, {
    waitUntil: 'domcontentloaded',
    timeout: timeoutMs,
  });
  await settle(() => page.waitForTimeout(POST_PLAY_WAIT_MS), undefined);

  return { capture, page };
}

export async function openGoozPlayerPreview(goozUrl, options = {}) {
  if (!isValidGoozPlayerUrl(goozUrl)) {
    throw new Error('Invalid gooz player URL.');
  }

  const browser = await launchExtractBrowser({ forceHeaded: true });
  try {
    const page = await browser.newPage({
      locale: 'en-US',
      timezoneId: 'America/New_York',
      userAgent: EXTRACT_USER_AGENT,
      viewport: { width: 1280, height: 720 },
    });

    await page.goto(goozUrl, {
      waitUntil: 'domcontentloaded',
      timeout: (options.timeoutSeconds ?? 90) * 1000,
    });
    const playMethod = await activateVideoPlayer(page, []);

    return {
      browser,
      goozUrl,
      page,
      playMethod,
    };
  } catch (error) {
    await browser.close().catch(() => {});
    throw error;
  }
}

export async function extractGoozFromPage(pageUrl, options = {}) {
  const browser = await launchExtractBrowser();

  try {
    const context = await newExtractContext(browser);
    const { capture, page } = await openPageWithGoozCapture(
      context,
      pageUrl,
      options,
    );
    await activateVideoPlayer(page, capture.urls);
    const extraction = await extractGoozWithRetries(
      page,
      pageUrl,
      capture.urls,
    );

    return {
      inputUrl: pageUrl,
      ...extraction,
    };
  } finally {
    await browser.close().catch(() => {});
  }
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

export async function extractGoozFromBasePage(baseUrl, options = {}) {
  const hrefNeedles = hrefNeedlesFromOptions(options);
  const hrefNeedle = hrefNeedles.join(' + ');
  const steps = [];
  steps.onStep = options.onStep;
  const logLines = [];
  const game = featuredGameFromOptions(options);
  const opponentName =
    typeof options.opponentName === 'string' && options.opponentName.trim()
      ? options.opponentName.trim()
      : undefined;
  const selectionOptions = {
    hrefNeedles,
    opponentName,
    requireOpponent: options.requireOpponent === true,
  };
  const privateHosts = new Set();
  rememberPrivateHost(privateHosts, baseUrl);
  const forLog = (url) => describeUrlForLog(url, privateHosts);

  const remember = (message) => {
    logLines.push(message);
  };

  const failureResult = (failure, message, extra = {}) => ({
    baseUrl,
    blankStreamEntry: buildBlankStreamEntry(game),
    failure,
    found: false,
    game,
    hrefNeedle,
    innerPageUrl: undefined,
    linkCandidates: [],
    logLines,
    message,
    steps,
    userMessage: message,
    ...extra,
  });

  if (hrefNeedles.length === 0) {
    const message = 'No listing href needles are configured.';
    pushStep(steps, 'config_missing', message, { success: false });
    remember(message);
    return failureResult('config_missing', message);
  }

  let browser;
  try {
    browser = await launchExtractBrowser();
    const context = await newExtractContext(browser);

    if (extractRunsHeaded()) {
      remember('Running headed browser for Cloudflare-protected pages.');
    }
    const listingPath = urlPathForLog(baseUrl);
    pushStep(steps, 'connect_base', `Opening listing path ${listingPath}`);
    remember(`Opening listing path ${listingPath}`);

    const { capture, page: basePage } = await openPageWithGoozCapture(
      context,
      baseUrl,
      options,
    );
    rememberPrivateHost(privateHosts, basePage.url());
    pushStep(steps, 'base_loaded', 'Base page loaded.');
    remember('Base page loaded.');

    const searchMessage = opponentName
      ?`Searching page elements for href containing "${hrefNeedle}" and opponent ${opponentName}...`
      : `Searching page elements for href containing "${hrefNeedle}"...`;
    pushStep(steps, 'search_links', searchMessage, { hrefNeedle });
    remember(searchMessage);

    const selection = await waitForListingLink(basePage, selectionOptions);
    const innerLink = selection.link;

    if (!innerLink) {
      const listing = await listingPageSummary(basePage);
      const message = 'No video found.';
      pushStep(steps, selection.failure ?? 'link_not_found', message, { success: false });
      remember(message);
      for (const line of linkFailureLines(selection, selectionOptions, forLog)) {
        remember(line);
      }
      remember(
        `Listing page at ${forLog(listing.url)} has ${listing.anchorCount} links.`,
      );
      if (isCloudflareChallengeTitle(listing.title)) {
        remember(`Cloudflare challenge page title: "${listing.title}".`);
      }
      if (listing.challengeFrames.length > 0) {
        remember(
          `Challenge frame present: ${forLog(listing.challengeFrames[0])}`,
        );
      }
      rememberFeaturedGame(steps, remember, game);
      return failureResult(selection.failure ?? 'link_not_found', message, {
        linkCandidates: selection.matches.slice(0, 5),
      });
    }

    rememberPrivateHost(privateHosts, innerLink.href);
    pushStep(steps, 'link_found', 'Found link element.', {
      href: innerLink.href,
      hrefNeedleMatched: innerLink.hrefNeedleMatched,
      success: true,
      text: innerLink.text,
    });
    remember(`Found link element: "${innerLink.text}"`);
    remember(`Link path is: ${forLog(innerLink.href)}`);

    pushStep(
      steps,
      'open_video_page',
      `Opening video page: ${forLog(innerLink.href)}`,
      { innerPageUrl: innerLink.href },
    );
    remember(`Opening video page: ${forLog(innerLink.href)}`);

    await openInnerPageFromLink(basePage, innerLink, options, capture);
    const innerPage = basePage;
    rememberPrivateHost(privateHosts, innerPage.url());
    pushStep(steps, 'video_page_loaded', 'Video page loaded.');
    remember('Video page loaded.');

    const embedsReady = await waitForPlayerEmbeds(innerPage, capture.urls);
    if (embedsReady) {
      pushStep(steps, 'embeds_ready', 'Player embeds are present on the video page.', {
        success: true,
      });
      remember('Player embeds are present on the video page.');
    } else {
      const playerBeforePlay = await playerPageSummary(innerPage);
      pushStep(steps, 'embeds_missing', 'Player embeds did not appear on the video page.', {
        success: false,
      });
      remember('Player embeds did not appear on the video page.');
      if (playerBeforePlay.cloudflareChallenge) {
        remember(
          `Cloudflare challenge page is still showing: "${playerBeforePlay.title}".`,
        );
      }
    }

    pushStep(steps, 'press_play', 'Pressing play on the video player...');
    remember('Pressing play on the video player...');
    const rawPlayMethod = await activateVideoPlayer(innerPage, capture.urls, {
      skipEmbedWait: true,
    });
    const playMethod = rawPlayMethod ? redactHosts(rawPlayMethod, privateHosts) : undefined;
    if (playMethod) {
      pushStep(steps, 'play_pressed', `Play activated using: ${playMethod}`, {
        playMethod,
        success: true,
      });
      remember(`Play activated using: ${playMethod}`);
    } else {
      pushStep(steps, 'play_not_found', 'No play control was found; scanning anyway.', {
        success: false,
      });
      remember('No play control was found; scanning anyway.');
    }

    pushStep(steps, 'scan_gooz', 'Scanning video page for gooz player URL...');
    remember('Scanning video page for gooz player URL...');

    const extraction = await extractGoozWithRetries(
      innerPage,
      innerLink.href,
      capture.urls,
    );

    rememberFeaturedGame(steps, remember, game);

    if (extraction.goozUrl) {
      extraction.streamEntry = buildStreamEntry(extraction.goozUrl, game);
    }

    if (extraction.goozUrl) {
      pushStep(steps, 'gooz_found', `Inner gooz URL is: ${extraction.goozUrl}`, {
        goozUrl: extraction.goozUrl,
        success: true,
      });
      remember(`Inner gooz URL is: ${extraction.goozUrl}`);
      pushStep(steps, 'stream_entry_ready', 'Stream entry ready.', {
        streamEntry: extraction.streamEntry,
        success: true,
      });
      remember('Stream entry ready.');
    } else {
      const message = 'No video found.';
      const player = await playerPageSummary(innerPage);
      pushStep(steps, 'gooz_not_found', message, { success: false });
      remember(message);
      remember(
        `Player page frames: ${player.frameUrls.map(forLog).join(' ') || 'none'}.`,
      );
      remember(
        `Player page iframes: ${player.iframes.map(forLog).join(' ') || 'none'}.`,
      );
      if (player.cloudflareChallenge) {
        remember(`Cloudflare challenge page title: "${player.title}".`);
      }
      extraction.streamEntry = undefined;
    }

    return {
      baseUrl,
      blankStreamEntry: buildBlankStreamEntry(game),
      game,
      hrefNeedle,
      innerPageUrl: innerLink.href,
      innerLinkText: innerLink.text,
      innerLinkHrefMatched: innerLink.hrefNeedleMatched,
      linkCandidates: selection.matches.slice(0, 5),
      logLines,
      steps,
      userMessage: extraction.found ? undefined : 'No video found.',
      ...extraction,
      ...(extraction.found ? {} : { failure: 'gooz_not_found' }),
      message: extraction.found
        ? 'Stream page and gooz player URL found.'
        : 'No video found.',
    };
  } catch (error) {
    // Playwright errors quote the URL being loaded.
    throw new Error(
      redactHosts(error instanceof Error ? error.message : String(error), privateHosts),
    );
  } finally {
    await browser?.close().catch(() => {});
  }
}
