import {
  extractGoozFromBasePage,
  extractGoozFromPage,
  formatExtractionLog,
} from './lib/extractGooz.mjs';

function printHelp() {
  process.stdout.write(`Extract gooz.aapmains.net player URL from an approved page

Usage:
  node extract-gooz.mjs <base-url>
  node extract-gooz.mjs --base <base-url>
  node extract-gooz.mjs --page <inner-page-url>

Default mode (--base):
  1. Open the base URL
  2. Find <a href="...cleveland-guardians...">
  3. Open that stream page
  4. Extract the gooz player URL

Direct mode (--page):
  Extract gooz directly from one page URL

Options:
  --help              Show this help
  --href <fragment>   href match for base mode (default: cleveland-guardians)
  --timeout <sec>     Page load timeout (default 90)
`);
}

function parseArgs(argv) {
  const options = {
    baseUrl: undefined,
    directPage: false,
    help: false,
    hrefNeedle: 'cleveland-guardians',
    pageUrl: undefined,
    timeoutSeconds: 90,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--base') {
      options.baseUrl = argv[index + 1];
      index += 1;
    } else if (arg === '--page') {
      options.directPage = true;
      options.pageUrl = argv[index + 1];
      index += 1;
    } else if (arg === '--href') {
      options.hrefNeedle = argv[index + 1];
      index += 1;
    } else if (arg === '--timeout') {
      options.timeoutSeconds = Number.parseInt(argv[index + 1], 10);
      index += 1;
    } else if (!arg.startsWith('-')) {
      if (options.directPage && !options.pageUrl) {
        options.pageUrl = arg;
      } else if (!options.baseUrl && !options.pageUrl) {
        options.baseUrl = arg;
      }
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || (!options.baseUrl && !options.pageUrl)) {
    printHelp();
    process.exitCode = options.baseUrl || options.pageUrl ? 0 : 1;
    return;
  }

  const result = options.directPage
    ? await extractGoozFromPage(options.pageUrl, {
        timeoutSeconds: options.timeoutSeconds,
      })
    : await extractGoozFromBasePage(options.baseUrl, {
        hrefNeedle: options.hrefNeedle,
        timeoutSeconds: options.timeoutSeconds,
      });

  process.stdout.write(`${formatExtractionLog(result)}\n\n`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.found) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
