export const PRESEASON = 'PRESEASON';
export const REGULAR_SEASON = 'REGULAR';
export const POSTSEASON = 'POSTSEASON';

export type SeasonType = typeof PRESEASON | typeof REGULAR_SEASON | typeof POSTSEASON;

export function seasonTypeFromEspn(espnSeasonType: number): SeasonType | null {
  if (espnSeasonType === 1) return PRESEASON;
  if (espnSeasonType === 2) return REGULAR_SEASON;
  if (espnSeasonType === 3) return POSTSEASON;
  return null;
}

export function espnSeasonType(seasonType: string): number {
  if (seasonType === PRESEASON) return 1;
  if (seasonType === POSTSEASON) return 3;
  return 2;
}

export function seasonTitle(year: number, seasonType: string): string {
  if (seasonType === PRESEASON) return `${year} Preseason`;
  if (seasonType === POSTSEASON) return `${year} Postseason`;
  return `${year} Regular Season`;
}
