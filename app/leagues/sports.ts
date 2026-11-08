import type { SportKey } from './types.ts';

export const SPORT_ORDER: readonly SportKey[] = [
  'football',
  'mens-basketball',
  'womens-basketball',
];

export function isSportKey(value: unknown): value is SportKey {
  return (
    value === 'football' ||
    value === 'mens-basketball' ||
    value === 'womens-basketball'
  );
}

export function sportLabel(sport: SportKey): string {
  if (sport === 'football') {
    return 'Football';
  }
  if (sport === 'mens-basketball') {
    return "Men's basketball";
  }
  return "Women's basketball";
}
