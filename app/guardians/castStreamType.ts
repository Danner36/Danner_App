export function castStreamTypeForUrl(
  _playbackUrl: string,
): 'buffered' | 'live' {
  // The default receiver on this family's TVs starts buffered VOD and sits on its
  // splash screen for `live` on those same files.
  return 'buffered';
}

export function castStreamTypeForContentType(
  _contentType: string,
): 'buffered' | 'live' {
  // The relay is a live sliding window whose segment URLs expire. Buffered
  // playback reads that window once and then the TV pauses. Direct files stay
  // buffered in castStreamTypeForUrl; live on those files sits on the splash.
  return 'live';
}
