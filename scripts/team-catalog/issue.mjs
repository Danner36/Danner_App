// Opens one GitHub issue when the catalog run needs attention: a probe failure (the last good
// `pickable` values stay) or a failed build or validate step. Needs GH_TOKEN and `issues: write`.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ISSUE_TITLE = 'Team catalog: probe or build failure';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// The issue body, or null when nothing needs attention.
export function issueBody({ report, buildOutcome = 'success', runUrl = '' }) {
  const failing = Object.entries(report?.adapters ?? {}).filter(([, entry]) => !entry.passed);
  const buildFailed = buildOutcome === 'failure';
  if (failing.length === 0 && !buildFailed) {
    return null;
  }
  const lines = ['The Team catalog run needs attention.', ''];
  if (runUrl) {
    lines.push(`Run: ${runUrl}`, '');
  }
  if (buildFailed) {
    lines.push('The build or validate step failed. The committed catalog was not changed; the step log holds the guard that failed.', '');
  }
  for (const [adapter, entry] of failing) {
    lines.push(`## ${adapter}`, '', 'Network errors:');
    lines.push(...(entry.networkErrors.length ? entry.networkErrors.map((error) => `- ${error}`) : ['- none']));
    lines.push('', 'Shape errors:');
    lines.push(...(entry.shapeErrors.length ? entry.shapeErrors.map((error) => `- ${error}`) : ['- none']));
    lines.push('');
  }
  return lines.join('\n');
}

function runGh(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout ?? '' };
}

// Opens the issue unless one with the same title is already open. Returns 0 unless gh fails.
export function openIssue({ body, gh = runGh, log = console.log }) {
  if (body === null) {
    log('issue: nothing to report');
    return 0;
  }
  const listed = gh(['issue', 'list', '--state', 'open', '--search', `in:title "${ISSUE_TITLE}"`, '--json', 'number', '--jq', 'length']);
  if (listed.status !== 0) {
    log('issue: could not list open issues');
    return 1;
  }
  if (listed.stdout.trim() !== '0') {
    log('issue: an open issue already reports this');
    return 0;
  }
  const created = gh(['issue', 'create', '--title', ISSUE_TITLE, '--body', body]);
  log(created.status === 0 ? 'issue: opened' : 'issue: create failed');
  return created.status === 0 ? 0 : 1;
}

function main() {
  const reportFile = path.join(REPO_ROOT, 'catalog', 'probe-report.json');
  const report = existsSync(reportFile) ? JSON.parse(readFileSync(reportFile, 'utf8')) : null;
  const body = issueBody({
    buildOutcome: process.env.BUILD_OUTCOME,
    report,
    runUrl: process.env.RUN_URL,
  });
  return openIssue({ body });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
