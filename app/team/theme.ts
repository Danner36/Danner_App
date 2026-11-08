import type { TeamRef } from '../leagues/types.ts';
import { presetAccent } from '../selection/presets.ts';

const ACCENT_FALLBACK = '#1F6F55';
const MIN_CONTRAST_WITH_WHITE = 3;

function channelLuminance(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function contrastWithWhite(hex: string | undefined): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!match) {
    return 0;
  }
  const value = Number.parseInt(match[1], 16);
  const luminance =
    0.2126 * channelLuminance((value >> 16) & 255) +
    0.7152 * channelLuminance((value >> 8) & 255) +
    0.0722 * channelLuminance(value & 255);
  return 1.05 / (luminance + 0.05);
}

// The preset color, else the catalog color when it holds 3:1 against white, else the alternate
// color when it does, else the Danner green.
export function teamAccent(key: string, team: TeamRef): string {
  const preset = presetAccent(key);
  if (preset) {
    return preset;
  }
  if (contrastWithWhite(team.color) >= MIN_CONTRAST_WITH_WHITE) {
    return team.color as string;
  }
  if (contrastWithWhite(team.alternateColor) >= MIN_CONTRAST_WITH_WHITE) {
    return team.alternateColor as string;
  }
  return ACCENT_FALLBACK;
}

// White or black, whichever has the higher contrast on the color.
export function textColorOn(hex: string): '#000000' | '#FFFFFF' {
  const withWhite = contrastWithWhite(hex);
  return withWhite * withWhite >= 21 ? '#FFFFFF' : '#000000';
}

export function teamBoardLabel(team: TeamRef): string {
  return team.nickname.length <= 10
    ? team.nickname.toUpperCase()
    : team.abbreviation;
}
