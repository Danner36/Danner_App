export function castStreamTypeForUrl(
  _playbackUrl: string,
): 'buffered' | 'live' {
  // The default receiver on this family's TVs starts buffered VOD and sits on its
  // splash screen for `live` on those same files.
  return 'buffered';
}

export function castStreamTypeForRelay(live: boolean): 'buffered' | 'live' {
  // A live relay is a sliding window whose segment URLs expire. Buffered playback
  // reads that window once and then the TV pauses. A relayed file or ended playlist
  // stays buffered, as direct files do in castStreamTypeForUrl; live on those sits
  // on the splash.
  return live ? 'live' : 'buffered';
}
