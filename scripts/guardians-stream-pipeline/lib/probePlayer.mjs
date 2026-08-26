const MEDIA_URL_PATTERN =
  /https?:\/\/[^\s"'<>]+?\.(?:m3u8|mpd|mp4)(?:\?[^\s"'<>]*)?/gi;

function normalizeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }
  try {
    return new URL(value).toString();
  } catch {
    return undefined;
  }
}

function collectDomMediaUrls(page) {
  return page.evaluate(() => {
    const urls = [];
    for (const video of document.querySelectorAll('video')) {
      if (video.currentSrc) {
        urls.push(video.currentSrc);
      }
      if (video.src) {
        urls.push(video.src);
      }
      for (const source of video.querySelectorAll('source')) {
        if (source.src) {
          urls.push(source.src);
        }
      }
    }
    for (const iframe of document.querySelectorAll('iframe')) {
      if (iframe.src) {
        urls.push(iframe.src);
      }
    }
    return urls;
  });
}

function pickDirectMedia(urls, preferSecure) {
  const unique = [...new Set(urls.map(normalizeUrl).filter(Boolean))];
  const direct = unique.filter((url) =>
    /\.(m3u8|mpd|mp4)(?:\?|$)/i.test(url),
  );
  if (direct.length === 0) {
    return undefined;
  }

  if (preferSecure) {
    const secure = direct.find((url) => url.startsWith('https://'));
    if (secure) {
      return secure;
    }
  }

  return direct[0];
}

function pageLooksActive(domUrls, networkUrls, hasPlayerChrome) {
  const combined = [...domUrls, ...networkUrls];
  if (combined.some((url) => /\.(m3u8|mpd|mp4)(?:\?|$)/i.test(url))) {
    return true;
  }
  if (hasPlayerChrome) {
    return true;
  }
  return combined.some((url) =>
    /embed|player|stream|video|watch/i.test(url),
  );
}

export async function probePlayerPage(pageUrl, options) {
  const { chromium } = await import('playwright');
  const timeoutMs = (options.timeoutSeconds ?? 90) * 1000;
  const networkUrls = [];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'DannerGuardiansStreamPipeline/1.0',
  });
  const page = await context.newPage();

  page.on('request', (request) => {
    const url = request.url();
    if (/\.(m3u8|mpd|mp4)(?:\?|$)/i.test(url)) {
      networkUrls.push(url);
    }
  });

  page.on('response', async (response) => {
    const url = response.url();
    if (/\.(m3u8|mpd|mp4)(?:\?|$)/i.test(url)) {
      networkUrls.push(url);
      return;
    }

    const contentType = response.headers()['content-type'] ?? '';
    if (!contentType.includes('mpegurl') && !contentType.includes('dash+xml')) {
      return;
    }

    try {
      const body = await response.text();
      for (const match of body.matchAll(MEDIA_URL_PATTERN)) {
        networkUrls.push(match[0]);
      }
    } catch {}
  });

  try {
    await page.goto(pageUrl, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });
    await page.waitForTimeout(5_000);

    const iframe = page.locator('iframe[src]').first();
    if (await iframe.count()) {
      const frameUrl = normalizeUrl(await iframe.getAttribute('src'));
      if (frameUrl) {
        try {
          await page.goto(frameUrl, {
            waitUntil: 'domcontentloaded',
            timeout: timeoutMs,
          });
          await page.waitForTimeout(4_000);
        } catch {}
      }
    }

    const domUrls = await collectDomMediaUrls(page);
    const hasPlayerChrome = await page.evaluate(() =>
      Boolean(
        document.querySelector(
          'iframe[src], video, audio, [class*="player" i], [id*="player" i], [class*="stream" i]',
        ),
      ),
    );
    const active = pageLooksActive(domUrls, networkUrls, hasPlayerChrome);
    const directUrl = pickDirectMedia(
      [...networkUrls, ...domUrls],
      !options.allowInsecureHttp,
    );

    if (options.preferDirectMedia && directUrl) {
      const parsed = new URL(directUrl);
      return {
        active,
        allowInsecureHttp: parsed.protocol === 'http:',
        kind: 'direct',
        pageUrl,
        trustedHosts: [],
        url: directUrl,
      };
    }

    const parsedPage = new URL(pageUrl);
    return {
      active,
      allowInsecureHttp:
        options.allowInsecureHttp === true && parsedPage.protocol === 'http:',
      kind: options.defaultKind ?? 'web',
      pageUrl,
      trustedHosts: options.trustedHosts ?? [],
      url: pageUrl,
    };
  } finally {
    await browser.close();
  }
}
