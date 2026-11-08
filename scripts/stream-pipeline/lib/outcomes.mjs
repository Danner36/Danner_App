// The final codes a run can report, and which of them candidate.json may claim. The job that
// writes that file opens untrusted pages, so publish.mjs produces every code that says a video
// exists or was written.

export const EXTRACT_FAILED = 'extract_failed';

// A request to confirm an entry the extract job saw on the branch. publish.mjs reads the file
// itself and answers video_ready or extract_failed.
export const ENTRY_EXISTS = 'entry_exists';

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

// Why nothing was tried: only the schedule check knows these, and none of them claims a video.
const CANDIDATE_STOP_CODES = new Set(['blocked', 'game_over', 'no_game', 'too_early']);

export function isCandidateCode(code) {
  return code === 'found' || code === ENTRY_EXISTS || CANDIDATE_STOP_CODES.has(code) || FAILURE_CODES.has(code);
}
