import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildBlankStreamEntry,
  extractGoozFromBasePage,
  formatExtractionLog,
  isValidGoozPlayerUrl,
  openGoozPlayerPreview,
} from './lib/extractGooz.mjs';

const pipelineDir = path.dirname(fileURLToPath(import.meta.url));
const port = Number.parseInt(process.env.GUARDIANS_PIPELINE_PORT ?? '8109', 10);

let extractBusy = false;
let previewSession;

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function closePreviewSession() {
  if (!previewSession) {
    return;
  }
  try {
    await previewSession.browser.close();
  } catch {}
  previewSession = undefined;
}

async function startPreviewSession(goozUrl) {
  await closePreviewSession();
  previewSession = await openGoozPlayerPreview(goozUrl);
  return previewSession;
}

function streamEntryForDisplay(streamEntry, game) {
  if (!streamEntry) {
    return undefined;
  }
  if (!game) {
    return {
      gameDates: ['YYYY-MM-DD'],
      gameNumbers: [1],
      ...streamEntry,
    };
  }
  return {
    gameDates: [game.officialDate],
    gameNumbers: [game.gameNumber],
    ...streamEntry,
  };
}

function displayStreamEntryForResult(result) {
  if (result.found && result.streamEntry?.url) {
    return streamEntryForDisplay(result.streamEntry, result.game);
  }
  return result.blankStreamEntry ?? buildBlankStreamEntry(result.game);
}

function controlHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Guardians Extract Harness</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Segoe UI, sans-serif;
      }
      body {
        background: #081f37;
        color: #f4f7fb;
        margin: 0;
        padding: 24px;
      }
      main {
        max-width: 920px;
        margin: 0 auto;
      }
      h1, h2 {
        margin: 0 0 12px;
      }
      .card {
        background: #123052;
        border: 1px solid #2d567d;
        border-radius: 14px;
        margin: 16px 0;
        padding: 18px;
      }
      button {
        background: #0f5132;
        border: 0;
        border-radius: 12px;
        color: white;
        cursor: pointer;
        font-size: 18px;
        margin-top: 12px;
        min-height: 52px;
        padding: 0 18px;
      }
      button:disabled {
        background: #41556b;
        cursor: not-allowed;
      }
      pre {
        background: #061425;
        border-radius: 10px;
        margin: 12px 0 0;
        overflow: auto;
        padding: 14px;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .muted {
        color: #b8c9da;
      }
      input[type="url"],
      input[type="text"] {
        background: #061425;
        border: 1px solid #2d567d;
        border-radius: 10px;
        color: #f4f7fb;
        font-size: 16px;
        margin-top: 8px;
        padding: 12px;
        width: 100%;
      }
      .preview-panel {
        background: #000;
        border-radius: 10px;
        margin-top: 12px;
        min-height: 420px;
        padding: 24px;
      }
      .preview-panel p {
        margin: 0 0 12px;
      }
      button.secondary {
        background: #1f4b73;
        margin-top: 0;
        min-height: 44px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Guardians Extract Harness</h1>
      <p class="muted">Paste an approved base URL. The script connects, finds the Guardians stream link, opens the video page, and extracts the gooz wrapper URL.</p>

      <section class="card">
        <label class="muted" for="base-url">Base URL</label>
        <input id="base-url" type="url" placeholder="https://your-approved-base-url" />
        <label class="muted" for="href-needle">Link href search</label>
        <input id="href-needle" type="text" value="cleveland-guardians" placeholder="cleveland-guardians" />
        <button id="run-extract">Extract video</button>
      </section>

      <section class="card">
        <h2>Script status</h2>
        <pre id="status-log">Waiting for a base URL.</pre>
      </section>

      <section class="card">
        <h2>Video preview</h2>
        <p class="muted" id="preview-note">Gooz blocks localhost iframe embedding. Playback opens in a Chromium player window with play pressed automatically, same as extract.</p>
        <label class="muted" for="test-url">Test gooz URL</label>
        <input id="test-url" type="url" value="https://gooz.aapmains.net/new-stream-embed/54863?ad=111" />
        <button id="test-playback" class="secondary">Test playback</button>
        <div class="preview-panel" id="preview-panel">
          <p id="preview-status">Waiting for a gooz URL.</p>
        </div>
        <h2>Stream object</h2>
        <pre id="stream-object">No stream object yet.</pre>
      </section>
    </main>
    <script>
      const runExtractButton = document.getElementById('run-extract');
      const testPlaybackButton = document.getElementById('test-playback');
      const baseUrlInput = document.getElementById('base-url');
      const hrefNeedleInput = document.getElementById('href-needle');
      const testUrlInput = document.getElementById('test-url');
      const statusLogEl = document.getElementById('status-log');
      const streamObjectEl = document.getElementById('stream-object');
      const previewNoteEl = document.getElementById('preview-note');
      const previewStatusEl = document.getElementById('preview-status');

      async function requestPlayback(goozUrl) {
        previewStatusEl.textContent = 'Opening player...';
        const response = await fetch('/api/preview-gooz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: goozUrl }),
        });
        const payload = await response.json();
        if (payload.error) {
          previewStatusEl.textContent = payload.error;
          return false;
        }
        previewStatusEl.textContent = 'Playing: ' + payload.goozUrl;
        previewNoteEl.textContent = payload.playMethod
          ? 'Play activated using: ' + payload.playMethod
          : 'Player window opened.';
        return true;
      }

      testPlaybackButton.addEventListener('click', async () => {
        const goozUrl = testUrlInput.value.trim();
        if (!goozUrl) {
          previewStatusEl.textContent = 'Enter a gooz URL first.';
          return;
        }
        testPlaybackButton.disabled = true;
        await requestPlayback(goozUrl);
        testPlaybackButton.disabled = false;
      });

      runExtractButton.addEventListener('click', async () => {
        const baseUrl = baseUrlInput.value.trim();
        if (!baseUrl) {
          statusLogEl.textContent = 'Enter a base URL first.';
          return;
        }

        runExtractButton.disabled = true;
        testPlaybackButton.disabled = true;
        statusLogEl.textContent = 'Running...';
        streamObjectEl.textContent = 'Running...';
        previewStatusEl.textContent = 'Extract running...';

        const hrefNeedle = hrefNeedleInput.value.trim() || 'cleveland-guardians';

        const response = await fetch('/api/extract-gooz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ baseUrl, hrefNeedle }),
        });
        const payload = await response.json();

        if (payload.error) {
          statusLogEl.textContent = payload.error;
          streamObjectEl.textContent = 'No stream object yet.';
          previewStatusEl.textContent = 'Extract failed.';
          runExtractButton.disabled = false;
          testPlaybackButton.disabled = false;
          return;
        }

        statusLogEl.textContent =
          payload.formattedLog ||
          (payload.logLines ? payload.logLines.join('\\n') : payload.message);

        if (payload.displayStreamEntry) {
          streamObjectEl.textContent = JSON.stringify(
            payload.displayStreamEntry,
            null,
            2,
          );
        } else {
          streamObjectEl.textContent = 'No stream object yet.';
        }

        if (payload.found && payload.goozUrl) {
          await requestPlayback(payload.goozUrl);
        } else {
          previewStatusEl.textContent = payload.userMessage ?? 'No video found.';
        }

        runExtractButton.disabled = false;
        testPlaybackButton.disabled = false;
      });
    </script>
  </body>
</html>`;
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? '/', `http://localhost:${port}`);

  if (request.method === 'GET' && requestUrl.pathname === '/') {
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8',
    });
    response.end(controlHtml());
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/extract-gooz') {
    if (extractBusy) {
      json(response, 409, { error: 'Extract is already running.' });
      return;
    }

    extractBusy = true;
    try {
      const body = await readBody(request);
      if (typeof body.baseUrl !== 'string' || !body.baseUrl.trim()) {
        json(response, 400, { error: 'baseUrl is required.' });
        return;
      }

      const result = await extractGoozFromBasePage(body.baseUrl.trim(), {
        hrefNeedle:
          typeof body.hrefNeedle === 'string' && body.hrefNeedle.trim()
            ? body.hrefNeedle.trim()
            : 'cleveland-guardians',
        timeoutSeconds: 90,
      });

      json(response, 200, {
        ...result,
        displayStreamEntry: displayStreamEntryForResult(result),
        formattedLog: formatExtractionLog(result),
      });
    } catch (error) {
      json(response, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      extractBusy = false;
    }
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/preview-gooz') {
    try {
      const body = await readBody(request);
      if (typeof body.url !== 'string' || !body.url.trim()) {
        json(response, 400, { error: 'url is required.' });
        return;
      }
      const goozUrl = body.url.trim();
      if (!isValidGoozPlayerUrl(goozUrl)) {
        json(response, 400, {
          error:
            'url must be a valid https gooz new-stream-embed URL with a numeric stream id.',
        });
        return;
      }

      const session = await startPreviewSession(goozUrl);
      json(response, 200, {
        goozUrl: session.goozUrl,
        playMethod: session.playMethod,
      });
    } catch (error) {
      json(response, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/play') {
    const targetUrl = requestUrl.searchParams.get('url');
    if (!targetUrl || !isValidGoozPlayerUrl(targetUrl)) {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('A valid https gooz new-stream-embed URL is required.');
      return;
    }

    response.writeHead(302, {
      Location: targetUrl,
      'Cache-Control': 'no-store',
    });
    response.end();
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/health') {
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('ok');
    return;
  }

  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(
    `Guardians extract harness listening on http://127.0.0.1:${port}\n`,
  );
});

const stop = async () => {
  await closePreviewSession();
  server.close(() => process.exit(0));
};
process.on('SIGINT', () => {
  void stop();
});
process.on('SIGTERM', () => {
  void stop();
});
