import {
  runGoozPipeline,
  defaultConfigPath,
  loadConfig,
} from './lib/pipeline.mjs';

function printHelp() {
  process.stdout.write(`Guardians stream pipeline

Usage:
  node run.mjs [--dry-run] [--force] [--config <path>] [--help]

Environment:
  GUARDIANS_STREAM_CONFIG  Path to config JSON
  GITHUB_TOKEN             Required to publish guardians_streams.json to GitHub
  DRY_RUN=1                Same as --dry-run
  FORCE=1                  Same as --force

Steps:
  1. Read today's Guardians game from MLB statsapi.
  2. Skip unless the game is inside the 15-minute Get video window.
  3. Open the configured extract.baseUrl and find the cleveland-guardians href.
  4. Extract a valid gooz /new-stream-embed URL with a numeric stream id.
  5. Upsert the matching entry in guardians_streams.json and publish to GitHub main.
`);
}

function parseArgs(argv) {
  const options = {
    configPath:
      process.env.GUARDIANS_STREAM_CONFIG?.trim() || defaultConfigPath,
    dryRun: process.env.DRY_RUN === '1',
    force: process.env.FORCE === '1',
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
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
  process.stdout.write(`${message}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  await loadConfig(options.configPath);
  const dispatchSport = process.env.DISPATCH_SPORT?.trim() || undefined;
  const result = await runGoozPipeline({
    configPath: options.configPath,
    dispatchSport,
    dryRun: options.dryRun,
    force: options.force,
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

  if (!result.success) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
