// The final codes a run can report. publish.mjs accepts only these from candidate.json, because
// the job that writes that file opens untrusted pages.

export const EXTRACT_FAILED = 'extract_failed';

// Runs that ended correctly with nothing to do. Every other non-published code exits 1.
export const SUCCESS_CODES = new Set([
  'blocked',
  'dry_run',
  'found',
  'game_over',
  'no_game',
  'published',
  'too_early',
  'unchanged',
  'video_ready',
]);

export const FAILURE_CODES = new Set([
  'ambiguous_link',
  'bad_event',
  'bad_sport',
  'bad_team',
  'browser_failed',
  'config_invalid',
  'deadline',
  EXTRACT_FAILED,
  'invalid_entry',
  'no_video',
  'publish_failed',
  'schedule_failed',
  'sources_unreachable',
]);

export function isKnownCode(code) {
  return SUCCESS_CODES.has(code) || FAILURE_CODES.has(code);
}
