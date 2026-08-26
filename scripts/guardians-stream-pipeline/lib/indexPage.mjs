import { opponentSearchTerms } from './mlbSchedule.mjs';

function decodeHtml(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(value) {
  return decodeHtml(value.replace(/<[^>]+>/g, ' '));
}

function absoluteUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function anchorCandidates(html, baseUrl) {
  const candidates = [];
  const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match = pattern.exec(html);
  while (match) {
    const href = absoluteUrl(match[1], baseUrl);
    if (href) {
      candidates.push({
        href,
        text: stripTags(match[2]),
        raw: match[0],
      });
    }
    match = pattern.exec(html);
  }
  return candidates;
}

function rowContext(html, rawAnchor) {
  const index = html.indexOf(rawAnchor);
  if (index < 0) {
    return rawAnchor;
  }
  const start = Math.max(0, index - 400);
  const end = Math.min(html.length, index + rawAnchor.length + 400);
  return stripTags(html.slice(start, end));
}

function scoreCandidate(candidate, game, resolver, html) {
  const context = rowContext(html, candidate.raw);
  const haystack = `${candidate.text} ${context}`.toLowerCase();
  let score = 0;

  for (const token of resolver.requiredText ?? []) {
    if (haystack.includes(token.toLowerCase())) {
      score += 4;
    } else {
      return -1;
    }
  }

  if (resolver.useOpponentAliases !== false) {
    const opponentTerms = opponentSearchTerms(game.opponentName);
    if (!opponentTerms.some((term) => haystack.includes(term.toLowerCase()))) {
      return -1;
    }
    score += 3;
  }

  for (const fragment of resolver.pathContains ?? []) {
    if (candidate.href.toLowerCase().includes(fragment.toLowerCase())) {
      score += 2;
    }
  }

  for (const liveToken of resolver.liveText ?? []) {
    if (haystack.includes(liveToken.toLowerCase())) {
      score += 5;
    }
  }

  if (haystack.includes('guardians') || haystack.includes('cleveland')) {
    score += 2;
  }

  return score;
}

export async function resolveFromIndexListing(game, resolver) {
  const response = await fetch(resolver.indexUrl, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'DannerGuardiansStreamPipeline/1.0',
    },
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new Error(
      `Index page request failed with ${response.status} for ${resolver.indexUrl}.`,
    );
  }

  const html = await response.text();
  const ranked = anchorCandidates(html, resolver.indexUrl)
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(candidate, game, resolver, html),
    }))
    .filter((entry) => entry.score >= 0)
    .sort((first, second) => second.score - first.score);

  if (ranked.length === 0) {
    return undefined;
  }

  return ranked[0].candidate.href;
}

export async function resolvePlayerPageUrl(game, resolver) {
  if (resolver.type === 'fixed') {
    return resolver.url;
  }

  if (resolver.type === 'gamePkTemplate') {
    const template = resolver.urlTemplate;
    if (typeof template !== 'string' || !template.includes('{gamePk}')) {
      throw new Error('gamePkTemplate resolver requires urlTemplate with {gamePk}.');
    }
    return template.replaceAll('{gamePk}', String(game.gamePk));
  }

  if (resolver.type === 'indexListing') {
    if (typeof resolver.indexUrl !== 'string') {
      throw new Error('indexListing resolver requires indexUrl.');
    }
    return resolveFromIndexListing(game, resolver);
  }

  throw new Error(`Unknown resolver type: ${resolver.type ?? 'undefined'}.`);
}
