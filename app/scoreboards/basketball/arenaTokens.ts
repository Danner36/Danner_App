// Colors of the basketball arena board and the contrast check that picks the opponent's stripe.
// Pure, so tests run it under plain Node. Contrast follows WCAG 2.x relative luminance.

// Board panel.
export const BOARD_FRAME = '#07264A';
// 1 dp board border and the rule over the lineup caption.
export const BOARD_EDGE = '#1D4573';
// LED well fill.
export const LED_WELL = '#05070A';
// Score, clock and PTS digits: 13.71:1 on LED_WELL.
export const LED_DIGIT = '#FFCF4A';
// FOULS, PERIOD, T.O.L., LAST FOUL, # and FL digits.
export const STAT_DIGIT = '#F4F7FA';
// The dash and -:-- placeholders of a missing value.
export const MISSING_DIGIT = '#7F8A99';
// A fouled-out player's struck jersey and dimmed PTS and REB digits.
export const DIM_DIGIT = '#8A97A6';
// Team names, phase text and the LAST FOUL arrow.
export const LABEL = '#F4F7FA';
// Column headers, captions, stat labels and the opponent stripe fallback: 9.88:1 on BOARD_FRAME.
export const LABEL_MUTED = '#C7D2DD';
// Foul-trouble FL cell: inverted well.
export const WARN_FILL = '#FFCF4A';
export const WARN_DIGIT = '#05070A';
// Fouled-out FL cell: 7.05:1.
export const OUT_FILL = '#B20D27';
export const OUT_DIGIT = '#FFFFFF';
// BONUS and 2× BONUS pill.
export const BONUS_FILL = '#FFCF4A';
export const BONUS_TEXT = '#05070A';

// An opponent color is drawn as its stripe at this contrast with BOARD_FRAME or above.
export const STRIPE_MIN_CONTRAST = 3;

// '#RRGGBB' in upper case from 'RRGGBB' or '#RRGGBB' (ESPN team colors carry no '#'); undefined
// for anything else.
export function normalizeHexColor(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const match = /^#?([0-9a-fA-F]{6})$/.exec(value.trim());
  return match ? `#${match[1].toUpperCase()}` : undefined;
}

function channelLuminance(channel: number): number {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: string): number | undefined {
  const hex = normalizeHexColor(color);
  if (!hex) {
    return undefined;
  }
  const red = channelLuminance(Number.parseInt(hex.slice(1, 3), 16));
  const green = channelLuminance(Number.parseInt(hex.slice(3, 5), 16));
  const blue = channelLuminance(Number.parseInt(hex.slice(5, 7), 16));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

// Contrast ratio from 1 to 21; undefined when either color is not a six-digit hex color.
export function contrastRatio(first: string, second: string): number | undefined {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  if (a === undefined || b === undefined) {
    return undefined;
  }
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Opponent stripe: the team color when it reaches STRIPE_MIN_CONTRAST on BOARD_FRAME, else the
// alternate color when it does, else LABEL_MUTED.
export function opponentStripeColor(color?: string, alternateColor?: string): string {
  for (const candidate of [color, alternateColor]) {
    const hex = normalizeHexColor(candidate);
    const ratio = hex ? contrastRatio(hex, BOARD_FRAME) : undefined;
    if (hex && ratio !== undefined && ratio >= STRIPE_MIN_CONTRAST) {
      return hex;
    }
  }
  return LABEL_MUTED;
}
