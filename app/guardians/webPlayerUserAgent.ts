import { Platform } from 'react-native';

/**
 * Approved player pages branch on the user agent and hand iPhone a different player build
 * than Android. Reporting an Android browser from iOS keeps those pages on the build that
 * is verified working. Player-side feature detection is unaffected, so a page that has no
 * Media Source Extensions still falls back to native HLS on the phone.
 */
const ANDROID_PLAYER_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

export function webPlayerUserAgent(): string | undefined {
  return Platform.OS === 'ios' ? ANDROID_PLAYER_USER_AGENT : undefined;
}
