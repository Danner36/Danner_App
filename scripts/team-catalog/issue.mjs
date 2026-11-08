// Opens one GitHub issue when a catalog run needs attention: a probe or build job that did not
// succeed, a report showing failing adapters (the last good `pickable` values stay), or a report
// that could not be read. Needs GH_TOKEN and `issues: write`.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ISSUE_TITLE = 'Team catalog: probe or build failure';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// A job counts as failed for any result other than success or skipped. GitHub can report a
// timed-out job as cancelled.
export function jobFailed(result) {
  return Boolean(result) && result !== 'success' && result !== 'skipped';
}

// The issue body, or null when nothing needs attention. `report` is null when it could not be read.
export function issueBody({ buildResult = 'success', probeResult = 'success', report, runUrl = '' }) {
  const failing = Object.entries(report?.adapters ?? {}).filter(([, entry]) => !entry.passed);
  const probeFailed = jobFailed(probeResult);
  const buildFailed = jobFailed(buildResult);
  if (failing.length === 0 && !probeFailed && !buildFailed && report) {
    return null;
  }
  const lines = ['The Team catalog run needs attention.', ''];
  if (runUrl) {
    lines.push(`Run: ${runUrl}`, '');
  }
  if (probeFailed) {
    lines.push(`The probe job ended with result ${probeResult}. The catalog was not refreshed.`, '');
  }
  if (buildFailed) {
    lines.push(
      `The build job ended with result ${buildResult}: a guard, the validator, the report download or the commit push. The step log names which.`,
      '',
    );
  }
  if (!report) {
    lines.push('The probe report could not be read.', '');
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

// The parsed report, or null when the file is absent or unreadable.
export function readReport(file) {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  } catch {
    return null;
  }
}

function main() {
  const body = issueBody({
    buildResult: process.env.BUILD_RESULT,
    probeResult: process.env.PROBE_RESULT,
    report: readReport(process.env.REPORT_FILE || path.join(REPO_ROOT, 'catalog', 'probe-report.json')),
    runUrl: process.env.RUN_URL,
  });
  return openIssue({ body });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
