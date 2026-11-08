import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { checkRequest, requestFromEnv } from './lib/catalog.mjs';
import { EXTRACT_FAILED, SUCCESS_CODES } from './lib/outcomes.mjs';
import { candidateFromResult, loadRunConfig, runPipeline } from './lib/pipeline.mjs';
import { createRedactor, githubMaskEmitter } from './lib/redact.mjs';
import { formatRunSummary, rawSourceUrls } from './lib/sources.mjs';

const redactor = createRedactor({ emit: githubMaskEmitter() });

function printHelp() {
  process.stdout.write(`Stream pipeline, extract job

Usage:
  node run.mjs [--dry-run] [--force] [--config <path>]
  node run.mjs --check-request
  node run.mjs --write-config
  node run.mjs --check-config [--config <path>]

Environment:
  TEAM_KEY                     Catalog team key, such as ncaa-66
  TEAM_SPORT                   Sport, for schools only
  EVENT_ID                     ESPN event id or MLB gamePk; blank picks today's game
  DRY_RUN=1                    Same as --dry-run
  FORCE=1                      Same as --force
  SOURCE_ONLY                  1-based listing source to try alone; blank tries all
  STREAM_PIPELINE_CONFIG       Config JSON, read only by --write-config
  STREAM_PIPELINE_CONFIG_PATH  Written config; --config overrides it
  GITHUB_TOKEN                 Read-only token for the readiness read
  GITHUB_REPOSITORY            owner/name
  RUN_PROGRESS_KEY, WORKER_URL Progress posts to the Worker

--check-request checks the key, sport and event id against the catalog and exits. No secret is
read and nothing is fetched.
--write-config masks every source host in STREAM_PIPELINE_CONFIG, writes it under RUNNER_TEMP
and sets STREAM_PIPELINE_CONFIG_PATH for later steps.
--check-config validates the config and exits without fetching anything.
Without one of these, the run writes candidate.json for publish.mjs and never writes a streams file.
`);
}

function parseArgs(argv) {
  const options = {
    checkConfig: false,
    checkRequest: false,
    configPath: process.env.STREAM_PIPELINE_CONFIG_PATH?.trim() || undefined,
    dryRun: process.env.DRY_RUN === '1',
    force: process.env.FORCE === '1',
    help: false,
    writeConfig: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--check-request') {
      options.checkRequest = true;
    } else if (arg === '--check-config') {
      options.checkConfig = true;
    } else if (arg === '--write-config') {
      options.writeConfig = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--config') {
      options.configPath = argv[index + 1];
      index += 1;
    }
  }
  return options;
}

function log(message) {
  process.stdout.write(`${redactor.text(message)}\n`);
}

function outputDirectory() {
  return path.join(process.env.RUNNER_TEMP?.trim() || os.tmpdir(), 'stream-pipeline');
}

async function writeCandidate(candidate) {
  const directory = outputDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'candidate.json'), redactor.text(`${JSON.stringify(candidate, null, 2)}\n`));
}

async function stopWithConfigProblem(message) {
  log(`config_invalid: ${message}`);
  await writeCandidate(candidateFromResult({ outcome: 'config_invalid' }, requestFromEnv()));
  process.exitCode = 1;
}

// Runs before any step that can print a host. The secret stays in this one step's environment;
// later steps read the file, which is private to the runner account. A secret that cannot be
// parsed ends the job here, so nothing that could print a host runs after it.
async function writeConfig() {
  const secret = process.env.STREAM_PIPELINE_CONFIG ?? '';
  if (!secret.trim()) {
    await stopWithConfigProblem('STREAM_PIPELINE_CONFIG is empty.');
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(secret);
  } catch {
    await stopWithConfigProblem('STREAM_PIPELINE_CONFIG is not valid JSON.');
    return;
  }
  for (const url of rawSourceUrls(parsed)) {
    redactor.add(url);
  }

  const runnerTemp = process.env.RUNNER_TEMP?.trim();
  const githubEnv = process.env.GITHUB_ENV?.trim();
  if (!runnerTemp || !githubEnv) {
    await stopWithConfigProblem('RUNNER_TEMP and GITHUB_ENV are required to write the config.');
    return;
  }
  const filePath = path.join(runnerTemp, 'stream-pipeline-config.json');
  await writeFile(filePath, secret, { mode: 0o600 });
  await appendFile(githubEnv, `STREAM_PIPELINE_CONFIG_PATH=${filePath}\n`);
  log('Pipeline config written and masked.');
}

async function writeRunSummary(team, result) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY?.trim();
  if (summaryPath) {
    await appendFile(summaryPath, formatRunSummary({ moduleName: team, redact: redactor.text, result }));
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (options.writeConfig) {
    await writeConfig();
    return;
  }

  const request = requestFromEnv();
  if (options.checkRequest) {
    const checked = await checkRequest(request);
    if (checked.code) {
      log(`${checked.code}: ${checked.message}`);
      process.exitCode = 1;
      return;
    }
    log(`Request is valid for ${checked.spec.key}${checked.spec.sport ? ` ${checked.spec.sport}` : ''}.`);
    return;
  }

  if (options.checkConfig) {
    const loaded = await loadRunConfig({
      configPath: options.configPath,
      redactor,
      sourceOnly: process.env.SOURCE_ONLY,
    });
    if (loaded.problem) {
      await stopWithConfigProblem(loaded.problem);
      return;
    }
    log(`Pipeline config is valid: ${loaded.allSources.length} listing sources.`);
    return;
  }

  const result = await runPipeline({
    configPath: options.configPath,
    dryRun: options.dryRun,
    force: options.force,
    githubToken: process.env.GITHUB_TOKEN,
    progressKey: process.env.RUN_PROGRESS_KEY,
    redactor,
    repository: process.env.GITHUB_REPOSITORY,
    request,
    runId: process.env.GITHUB_RUN_ID,
    sourceOnly: process.env.SOURCE_ONLY,
    workerUrl: process.env.WORKER_URL,
  });

  for (const step of result.steps ?? []) {
    log(step.message);
  }
  log(result.message);
  if (result.outcome === 'dry_run') {
    log(JSON.stringify(result.entry, null, 2));
  }

  await writeCandidate(candidateFromResult(result, request));
  // A key the catalog rejected is unchecked input and stays out of the summary.
  if (!result.outcome.startsWith('bad_')) {
    await writeRunSummary(request.team, result);
  }
  if (!SUCCESS_CODES.has(result.outcome)) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  process.stderr.write(`${redactor.text(error instanceof Error ? error.message : String(error))}\n`);
  await writeCandidate(candidateFromResult({ outcome: EXTRACT_FAILED }, requestFromEnv())).catch(() => {});
  process.exitCode = 1;
});
