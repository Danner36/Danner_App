import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { publishSummary, resultDocument, runPublish } from './lib/publishRun.mjs';

const directory = path.join(process.env.RUNNER_TEMP?.trim() || os.tmpdir(), 'stream-pipeline');

async function main() {
  const result = await runPublish({
    candidatePath: path.join(directory, 'candidate.json'),
    dryRun: process.env.DRY_RUN === '1',
    force: process.env.FORCE === '1',
    repository: process.env.GITHUB_REPOSITORY,
    runId: process.env.GITHUB_RUN_ID,
    statusKey: process.env.RUN_STATUS_KEY,
    token: process.env.GITHUB_TOKEN,
    workerUrl: process.env.WORKER_URL,
  });

  process.stdout.write(`${result.code}: ${result.message}\n`);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'pipeline-result.json'), `${JSON.stringify(resultDocument(result), null, 2)}\n`);

  const summaryPath = process.env.GITHUB_STEP_SUMMARY?.trim();
  if (summaryPath && result.team) {
    await appendFile(summaryPath, publishSummary(result));
  }
  if (!result.success) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
