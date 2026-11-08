import { appendFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  configProblem,
  runGoozPipeline,
  defaultConfigPath,
  loadConfig,
  loadListingSources,
  moduleForConfig,
} from './lib/pipeline.mjs';
import { createRedactor, githubMaskEmitter } from './lib/redact.mjs';
import { formatRunSummary, rawSourceUrls } from './lib/sources.mjs';

const redactor = createRedactor({ emit: githubMaskEmitter() });

function printHelp() {
  process.stdout.write(`Guardians, Patriots, and Cyclones stream pipeline

Usage:
  node run.mjs [--dry-run] [--force] [--config <path>] [--check-config]
               [--write-sources-config] [--help]

Environment:
  GUARDIANS_STREAM_CONFIG      Path to config JSON
  GITHUB_TOKEN                 Required to publish the module's streams file to GitHub
  PIPELINE_MODULE              guardians, patriots, or cyclones; the config must match it
  DISPATCH_SPORT               Cyclones sport to feature
  DRY_RUN=1                    Same as --dry-run
  FORCE=1                      Same as --force
  STREAM_PIPELINE_CONFIG       Listing sources JSON, read only by --write-sources-config
  STREAM_PIPELINE_CONFIG_PATH  Written listing sources; unset means extract.baseUrl only
  SOURCE_ONLY                  1-based listing source to try alone; blank tries all

Steps:
  1. Read the module's featured game (MLB statsapi or ESPN).
  2. Skip unless the game is inside the 15-minute Get video window.
  3. Open the configured listing and find the one link with the team href needles and opponent.
  4. Extract a valid gooz /new-stream-embed URL with a numeric stream id.
  5. Apply the entry to the current streams file on GitHub and publish it.

--check-config validates the config for PIPELINE_MODULE and exits without fetching anything.
--write-sources-config masks every host in STREAM_PIPELINE_CONFIG, writes it under RUNNER_TEMP,
and sets STREAM_PIPELINE_CONFIG_PATH for later steps. An empty secret writes nothing.
`);
}

function parseArgs(argv) {
  const options = {
    checkConfig: false,
    configPath:
      process.env.GUARDIANS_STREAM_CONFIG?.trim() || defaultConfigPath,
    dryRun: process.env.DRY_RUN === '1',
    force: process.env.FORCE === '1',
    help: false,
    writeSourcesConfig: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--check-config') {
      options.checkConfig = true;
    } else if (arg === '--write-sources-config') {
      options.writeSourcesConfig = true;
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

// Runs before any other step can print. The secret stays in this one step's environment; later
// steps read the file, which is created private to the runner account. A secret that cannot be
// parsed ends the job here, so nothing that could print a host runs after it.
async function writeSourcesConfig() {
  const secret = process.env.STREAM_PIPELINE_CONFIG ?? '';
  if (!secret.trim()) {
    log('STREAM_PIPELINE_CONFIG is empty; extract.baseUrl is the only listing source.');
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(secret);
  } catch {
    log('STREAM_PIPELINE_CONFIG is not valid JSON.');
    process.exitCode = 1;
    return;
  }
  for (const url of rawSourceUrls(parsed)) {
    redactor.add(url);
  }

  const runnerTemp = process.env.RUNNER_TEMP?.trim();
  const githubEnv = process.env.GITHUB_ENV?.trim();
  if (!runnerTemp || !githubEnv) {
    log('RUNNER_TEMP and GITHUB_ENV are required to write the listing sources.');
    process.exitCode = 1;
    return;
  }
  const filePath = path.join(runnerTemp, 'stream-pipeline-config.json');
  await writeFile(filePath, secret, { mode: 0o600 });
  await appendFile(githubEnv, `STREAM_PIPELINE_CONFIG_PATH=${filePath}\n`);
  log('Listing sources written and masked.');
}

async function writeRunSummary(config, result) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY?.trim();
  if (!summaryPath || !process.env.STREAM_PIPELINE_CONFIG_PATH?.trim()) {
    return;
  }
  await appendFile(
    summaryPath,
    formatRunSummary({ moduleName: moduleForConfig(config), redact: redactor.text, result }),
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (options.writeSourcesConfig) {
    await writeSourcesConfig();
    return;
  }

  const config = await loadConfig(options.configPath);
  redactor.add(config?.extract?.baseUrl);
  const dispatchSport = process.env.DISPATCH_SPORT?.trim() || undefined;

  if (options.checkConfig) {
    const listing = await loadListingSources({ redactor });
    const problem =
      configProblem(config, {
        dispatchSport,
        expectedModule: process.env.PIPELINE_MODULE?.trim() || undefined,
      }) ?? listing.problem;
    if (problem) {
      log(problem);
      process.exitCode = 1;
      return;
    }
    log(`Pipeline config is valid for ${moduleForConfig(config)}.`);
    if (listing.allSources) {
      log(`Listing sources are valid: ${listing.allSources.length} configured.`);
    }
    return;
  }

  const result = await runGoozPipeline({
    configPath: options.configPath,
    dispatchSport,
    dryRun: options.dryRun,
    force: options.force,
    redactor,
  });

  for (const step of result.steps ?? []) {
    if (step.message) {
      log(step.message);
    }
  }

  log(result.message);

  if (result.outcome === 'dry_run' && result.nextEntry) {
    log(JSON.stringify(result.nextEntry, null, 2));
  }

  await writeRunSummary(config, result);

  if (!result.success) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${redactor.text(error instanceof Error ? error.message : String(error))}\n`);
  process.exitCode = 1;
});
