/**
 * Which master-playlist variant the phone forwards to a Cast receiver.
 * Android and iOS proxies use the same rules.
 *
 * AirPlay leaves the phone out of the media path. Cast does not: the receiver
 * pulls every segment from the phone, and the phone pulls it from the provider.
 * The highest variant is more than that double hop can sustain, so playback
 * pauses. Prefer the highest video variant at or under the cap. When every
 * video variant is above the cap, take the lowest one. Skip audio-only
 * renditions so a 128 kbps audio track does not win.
 */
export const RELAY_MAX_BANDWIDTH = 3_500_000;

export type RelayVariant = {
  audioOnly: boolean;
  bandwidth: number;
  url: string;
};

export function selectRelayVariant(
  variants: RelayVariant[],
): RelayVariant | undefined {
  if (variants.length === 0) {
    return undefined;
  }
  const video = variants.filter((variant) => !variant.audioOnly);
  const pool = video.length > 0 ? video : variants;
  const known = pool.filter((variant) => variant.bandwidth > 0);
  const under = known.filter(
    (variant) => variant.bandwidth <= RELAY_MAX_BANDWIDTH,
  );
  if (under.length > 0) {
    return under.reduce((best, variant) =>
      variant.bandwidth > best.bandwidth ? variant : best,
    );
  }
  if (known.length > 0) {
    return known.reduce((best, variant) =>
      variant.bandwidth < best.bandwidth ? variant : best,
    );
  }
  return pool[0];
}

export function streamInfBandwidth(line: string): number {
  const match = /(?:^|:|,)BANDWIDTH=(\d+)/.exec(line);
  if (!match?.[1]) {
    return -1;
  }
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : -1;
}

export function streamInfAudioOnly(line: string): boolean {
  const match = /(?:^|,)CODECS="([^"]*)"/.exec(line);
  const codecs = match?.[1]?.toLowerCase();
  if (!codecs) {
    return false;
  }
  const video =
    codecs.includes('avc1') ||
    codecs.includes('avc3') ||
    codecs.includes('hvc1') ||
    codecs.includes('hev1') ||
    codecs.includes('dvh1') ||
    codecs.includes('dvhe') ||
    codecs.includes('av01') ||
    codecs.includes('vp09') ||
    codecs.includes('vp9');
  if (video) {
    return false;
  }
  return (
    codecs.includes('mp4a') ||
    codecs.includes('ac-3') ||
    codecs.includes('ec-3') ||
    codecs.includes('opus') ||
    codecs.includes('flac') ||
    codecs.includes('alac')
  );
}
