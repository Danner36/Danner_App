const GOOZ_HOST = 'gooz.aapmains.net';
const GOOZ_EMBED_PATH = /\/new-stream-embed\/([^/?#]+)/;
const GOOZ_URL_PATTERN =
  /https?:\/\/(?:[a-z0-9-]+\.)*gooz\.aapmains\.net[^\s"'<>)]*/gi;
export const EXTRACT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
export const PLAYER_EMBED_WAIT_MS = 20_000;
export const GOOZ_IFRAME_WAIT_MS = 8_000;
export const POST_PLAY_WAIT_MS = 5_000;

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

async function extractGoozFromLoadedPage(page, pageUrl, networkUrls) {
  const html = await page.content();
  const htmlMatches = findGoozInText(html, pageUrl);
  const domMatches = await collectDomGoozUrls(page);

  const frameMatches = [];
  for (const frame of page.frames()) {
    const frameUrl = normalizeUrl(frame.url(), pageUrl);
    if (frameUrl && isGoozUrl(frameUrl)) {
      frameMatches.push(frameUrl);
    }
    try {
      const frameDomMatches = await collectDomGoozUrls(frame);
      frameMatches.push(...frameDomMatches);
      const frameHtml = await frame.content();
      frameMatches.push(...findGoozInText(frameHtml, frameUrl ?? pageUrl));
    } catch {}
  }

  const goozUrl = pickBestGoozUrl([
    ...networkUrls,
    ...htmlMatches,
    ...domMatches,
    ...frameMatches,
  ]);

  const candidates = [
    ...new Set([...networkUrls, ...htmlMatches, ...domMatches, ...frameMatches]),
  ]
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

function hrefNeedlesFromOptions(options = {}) {
  if (Array.isArray(options.hrefNeedles) && options.hrefNeedles.length > 0) {
    return options.hrefNeedles
      .filter((needle) => typeof needle === 'string' && needle.trim())
      .map((needle) => needle.trim().toLowerCase());
  }
  const single =
    typeof options.hrefNeedle === 'string' && options.hrefNeedle.trim()
      ? options.hrefNeedle.trim()
      : 'cleveland-guardians';
  return [single.toLowerCase()];
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

async function waitForInnerLinkByHref(page, options, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let matches = await findInnerLinkByHref(page, options);
  while (!matches[0] && Date.now() < deadline) {
    await page.waitForTimeout(1_000);
    matches = await findInnerLinkByHref(page, options);
  }
  return matches;
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
  const details = await page.evaluate(() => ({
    iframes: [...document.querySelectorAll('iframe[src], iframe[data-src]')]
      .map((node) => node.getAttribute('src') || node.getAttribute('data-src'))
      .filter(Boolean)
      .slice(0, 12),
    title: document.title,
    url: window.location.href,
  }));
  return {
    cloudflareChallenge: isCloudflareChallengeTitle(details.title),
    frameUrls: frameUrls.slice(0, 12),
    iframes: details.iframes,
    title: details.title,
    url: details.url,
  };
}

function networkHasGooz(networkUrls) {
  return networkUrls.some((url) => isValidGoozPlayerUrl(url));
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

async function openInnerPageFromLink(page, innerLink, options) {
  const timeoutMs = (options.timeoutSeconds ?? 90) * 1000;
  const clicked = await page.evaluate(({ href }) => {
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
      if (absoluteHref !== href) {
        continue;
      }
      anchor.click();
      return true;
    }
    return false;
  }, { href: innerLink.href });

  if (clicked) {
    await page.waitForLoadState('domcontentloaded', { timeout: timeoutMs });
  } else {
    await page.goto(innerLink.href, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });
  }

  await page.waitForTimeout(3_000);
}

async function listingPageSummary(page) {
  const challengeFrames = page
    .frames()
    .map((frame) => frame.url())
    .filter((url) => isIgnoredPlayerFrame(url));
  const details = await page.evaluate(() => ({
    anchorCount: document.querySelectorAll('a[href]').length,
    title: document.title,
    url: window.location.href,
  }));
  return { ...details, challengeFrames };
}

async function findInnerLinkByHref(page, options) {
  const hrefNeedles = hrefNeedlesFromOptions(options);

  return page.evaluate(({ hrefNeedles }) => {
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
  }, { hrefNeedles });
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
      if ((await locator.count()) === 0) {
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

  await page.waitForTimeout(3_000);
  return extractGoozFromLoadedPage(page, pageUrl, networkUrls);
}

async function openPageWithGoozCapture(context, pageUrl, options) {
  const timeoutMs = (options.timeoutSeconds ?? 90) * 1000;
  const page = await context.newPage();
  const networkUrls = [];

  const rememberNetworkUrl = (url) => {
    const normalized = normalizeUrl(url, pageUrl);
    if (normalized && isGoozUrl(normalized)) {
      networkUrls.push(normalized);
    }
  };

  page.on('request', (request) => rememberNetworkUrl(request.url()));
  page.on('response', async (response) => {
    rememberNetworkUrl(response.url());
    try {
      const body = await response.text();
      for (const match of findGoozInText(body, response.url())) {
        networkUrls.push(match);
      }
    } catch {}
  });

  await page.goto(pageUrl, {
    waitUntil: 'domcontentloaded',
    timeout: timeoutMs,
  });
  await page.waitForTimeout(POST_PLAY_WAIT_MS);

  return { networkUrls, page };
}

export async function openGoozPlayerPreview(goozUrl, options = {}) {
  if (!isValidGoozPlayerUrl(goozUrl)) {
    throw new Error('Invalid gooz player URL.');
  }

  const browser = await launchExtractBrowser({ forceHeaded: true });
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
}

export async function extractGoozFromPage(pageUrl, options = {}) {
  const browser = await launchExtractBrowser();
  const context = await newExtractContext(browser);

  try {
    const { networkUrls, page } = await openPageWithGoozCapture(
      context,
      pageUrl,
      options,
    );
    await activateVideoPlayer(page, networkUrls);
    const extraction = await extractGoozWithRetries(
      page,
      pageUrl,
      networkUrls,
    );

    return {
      inputUrl: pageUrl,
      ...extraction,
    };
  } finally {
    await browser.close();
  }
}

export async function extractGoozFromBasePage(baseUrl, options = {}) {
  const hrefNeedles = hrefNeedlesFromOptions(options);
  const hrefNeedle = hrefNeedles.join(' + ');
  const steps = [];
  steps.onStep = options.onStep;
  const logLines = [];
  const browser = await launchExtractBrowser();
  const context = await newExtractContext(browser);

  const remember = (message) => {
    logLines.push(message);
  };

  try {
    if (extractRunsHeaded()) {
      remember('Running headed browser for Cloudflare-protected pages.');
    }
    pushStep(steps, 'connect_base', `Connected to base URL: ${baseUrl}`);
    remember(`Connected to base URL: ${baseUrl}`);

    const { networkUrls, page: basePage } = await openPageWithGoozCapture(
      context,
      baseUrl,
      options,
    );
    pushStep(steps, 'base_loaded', 'Base page loaded.');
    remember('Base page loaded.');

    pushStep(
      steps,
      'search_links',
      `Searching page elements for href containing "${hrefNeedle}"...`,
      { hrefNeedle },
    );
    remember(`Searching page elements for href containing "${hrefNeedle}"...`);

    const linkMatches = await waitForInnerLinkByHref(basePage, {
      hrefNeedles,
    });
    const innerLink = linkMatches[0];

    if (!innerLink) {
      const game = featuredGameFromOptions(options);
      const listing = await listingPageSummary(basePage);
      const message = 'No video found.';
      pushStep(steps, 'link_not_found', message, { success: false });
      remember(message);
      remember(
        `Listing page title is "${listing.title}" at ${listing.url} with ${listing.anchorCount} links.`,
      );
      if (listing.challengeFrames.length > 0) {
        remember(
          `Challenge frame present: ${listing.challengeFrames[0]}`,
        );
      }
      rememberFeaturedGame(steps, remember, game);
      return {
        baseUrl,
        blankStreamEntry: buildBlankStreamEntry(game),
        found: false,
        game,
        hrefNeedle,
        innerPageUrl: undefined,
        linkCandidates: [],
        logLines,
        message,
        steps,
        userMessage: message,
      };
    }

    pushStep(steps, 'link_found', 'Found link element.', {
      href: innerLink.href,
      hrefNeedleMatched: innerLink.hrefNeedleMatched,
      success: true,
      text: innerLink.text,
    });
    remember(`Found link element: "${innerLink.text}"`);
    remember(`Link href is: ${innerLink.href}`);

    pushStep(
      steps,
      'open_video_page',
      `Opening video page: ${innerLink.href}`,
      { innerPageUrl: innerLink.href },
    );
    remember(`Opening video page: ${innerLink.href}`);

    await openInnerPageFromLink(basePage, innerLink, options);
    const innerPage = basePage;
    pushStep(steps, 'video_page_loaded', 'Video page loaded.');
    remember('Video page loaded.');

    const embedsReady = await waitForPlayerEmbeds(innerPage, networkUrls);
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
    const playMethod = await activateVideoPlayer(innerPage, networkUrls, {
      skipEmbedWait: true,
    });
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
      networkUrls,
    );

    const game = featuredGameFromOptions(options);
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
        `Player page frames: ${player.frameUrls.join(' ') || 'none'}.`,
      );
      remember(
        `Player page iframes: ${player.iframes.join(' ') || 'none'}.`,
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
      linkCandidates: linkMatches.slice(0, 5),
      logLines,
      steps,
      userMessage: extraction.found ? undefined : 'No video found.',
      ...extraction,
      message: extraction.found
        ? 'Stream page and gooz player URL found.'
        : 'No video found.',
    };
  } finally {
    await browser.close();
  }
}
