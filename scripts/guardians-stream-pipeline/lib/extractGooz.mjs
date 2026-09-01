import { getFeaturedGuardiansGame } from './mlbSchedule.mjs';

const GOOZ_HOST = 'gooz.aapmains.net';
const GOOZ_EMBED_PATH = /\/new-stream-embed\/([^/?#]+)/;
const GOOZ_URL_PATTERN =
  /https?:\/\/(?:[a-z0-9-]+\.)*gooz\.aapmains\.net[^\s"'<>)]*/gi;

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

async function findInnerLinkByHref(page, options) {
  const hrefNeedle = (options.hrefNeedle ?? 'cleveland-guardians').toLowerCase();

  return page.evaluate(({ hrefNeedle }) => {
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
      if (!hrefLower.includes(hrefNeedle)) {
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
  }, { hrefNeedle });
}

async function activateVideoPlayer(page) {
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
      await target.evaluate(() => {
        for (const video of document.querySelectorAll('video')) {
          video.muted = true;
          void video.play();
        }
      });
      return 'video.play()';
    } catch {}

    return undefined;
  }

  let method = await clickPlayInTarget(page);
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) {
      continue;
    }
    const frameMethod = await clickPlayInTarget(frame);
    if (frameMethod) {
      method = `${frame.url()}: ${frameMethod}`;
    }
  }

  try {
    await page.waitForSelector('iframe[src*="gooz.aapmains.net"]', {
      timeout: 8_000,
    });
  } catch {}

  await page.waitForTimeout(5_000);
  return method;
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
  await page.waitForTimeout(5_000);

  return { networkUrls, page };
}

export async function openGoozPlayerPreview(goozUrl, options = {}) {
  if (!isValidGoozPlayerUrl(goozUrl)) {
    throw new Error('Invalid gooz player URL.');
  }

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({
    userAgent: 'DannerGuardiansStreamExtractor/1.0',
  });

  await page.goto(goozUrl, {
    waitUntil: 'domcontentloaded',
    timeout: (options.timeoutSeconds ?? 90) * 1000,
  });
  const playMethod = await activateVideoPlayer(page);

  return {
    browser,
    goozUrl,
    page,
    playMethod,
  };
}

export async function extractGoozFromPage(pageUrl, options = {}) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'DannerGuardiansStreamExtractor/1.0',
  });

  try {
    const { networkUrls, page } = await openPageWithGoozCapture(
      context,
      pageUrl,
      options,
    );
    await activateVideoPlayer(page);
    const extraction = await extractGoozFromLoadedPage(
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
  const { chromium } = await import('playwright');
  const hrefNeedle = (options.hrefNeedle ?? 'cleveland-guardians').trim();
  const steps = [];
  steps.onStep = options.onStep;
  const logLines = [];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'DannerGuardiansStreamExtractor/1.0',
  });

  const remember = (message) => {
    logLines.push(message);
  };

  try {
    pushStep(steps, 'connect_base', `Connected to base URL: ${baseUrl}`);
    remember(`Connected to base URL: ${baseUrl}`);

    const { page: basePage } = await openPageWithGoozCapture(
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

    const linkMatches = await findInnerLinkByHref(basePage, {
      hrefNeedle,
    });
    const innerLink = linkMatches[0];

    if (!innerLink) {
      const game = await getFeaturedGuardiansGame(options.teamId ?? 114);
      const message = 'No video found.';
      pushStep(steps, 'link_not_found', message, { success: false });
      remember(message);
      if (game) {
        remember(
          `Using game date ${game.officialDate} game ${game.gameNumber} vs ${game.opponentName}.`,
        );
      }
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

    await basePage.close();

    pushStep(
      steps,
      'open_video_page',
      `Opening video page: ${innerLink.href}`,
      { innerPageUrl: innerLink.href },
    );
    remember(`Opening video page: ${innerLink.href}`);

    const { networkUrls, page: innerPage } = await openPageWithGoozCapture(
      context,
      innerLink.href,
      options,
    );
    pushStep(steps, 'video_page_loaded', 'Video page loaded.');
    remember('Video page loaded.');

    pushStep(steps, 'press_play', 'Pressing play on the video player...');
    remember('Pressing play on the video player...');
    const playMethod = await activateVideoPlayer(innerPage);
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

    const extraction = await extractGoozFromLoadedPage(
      innerPage,
      innerLink.href,
      networkUrls,
    );

    const game = await getFeaturedGuardiansGame(options.teamId ?? 114);
    if (game) {
      pushStep(
        steps,
        'mlb_game',
        `Using game date ${game.officialDate} game ${game.gameNumber} vs ${game.opponentName}.`,
        { game, success: true },
      );
      remember(
        `Using game date ${game.officialDate} game ${game.gameNumber} vs ${game.opponentName}.`,
      );
    } else {
      pushStep(steps, 'mlb_game', 'No featured Guardians game found in MLB schedule.', {
        success: false,
      });
      remember('No featured Guardians game found in MLB schedule.');
    }

    if (extraction.goozUrl) {
      extraction.streamEntry = buildStreamEntry(extraction.goozUrl, game);
    }

    if (extraction.goozUrl) {
      pushStep(steps, 'gooz_found', `Inner gooz URL is: ${extraction.goozUrl}`, {
        goozUrl: extraction.goozUrl,
        success: true,
      });
      remember(`Inner gooz URL is: ${extraction.goozUrl}`);
      pushStep(steps, 'stream_entry_ready', 'Stream entry ready for guardians_streams.json.', {
        streamEntry: extraction.streamEntry,
        success: true,
      });
      remember('Stream entry ready for guardians_streams.json.');
    } else {
      const message = 'No video found.';
      pushStep(steps, 'gooz_not_found', message, { success: false });
      remember(message);
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
        ? 'Guardians stream page and gooz player URL found.'
        : 'No video found.',
    };
  } finally {
    await browser.close();
  }
}
