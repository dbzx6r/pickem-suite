import {
  LivePlayerCategory,
  LiveTeamStat,
  parseLiveGameStats,
  sandboxLiveGameStats,
} from './live-game-stats';

export interface SandboxGamecastSituation {
  shortDownDistance: string | null;
  possessionText: string | null;
  yardLine: number | null;
  distance: number | null;
  isRedZone: boolean;
  driveSummary: string | null;
  lastPlayText: string | null;
  teamStats: LiveTeamStat[];
  boxScore: LivePlayerCategory[];
}

export type SandboxGamecastPreset = 'normal' | 'red-zone' | 'goal-to-go' | 'halftime' | 'feed-unavailable';

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function boundedNumber(value: unknown, minimum: number, maximum: number): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

export function parseSandboxSituation(value: unknown): SandboxGamecastSituation {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const stats = parseLiveGameStats(input);
  return {
    shortDownDistance: boundedText(input.shortDownDistance, 80),
    possessionText: boundedText(input.possessionText, 40),
    yardLine: input.yardLine === null ? null : boundedNumber(input.yardLine, 0, 100),
    distance: input.distance === null ? null : boundedNumber(input.distance, 0, 99),
    isRedZone: input.isRedZone === true,
    driveSummary: boundedText(input.driveSummary, 160),
    lastPlayText: boundedText(input.lastPlayText, 600),
    teamStats: stats.teamStats,
    boxScore: stats.boxScore,
  };
}

export function sandboxPreset(
  preset: SandboxGamecastPreset,
  awayTeam: string,
  homeTeam: string,
): SandboxGamecastSituation {
  const stats = sandboxLiveGameStats(awayTeam, homeTeam);
  const withStats = (
    situation: Omit<SandboxGamecastSituation, 'teamStats' | 'boxScore'>,
  ): SandboxGamecastSituation => ({ ...situation, ...stats });
  if (preset === 'red-zone') {
    return withStats({
      shortDownDistance: '3rd & 7',
      possessionText: `${homeTeam} 16`,
      yardLine: 84,
      distance: 7,
      isRedZone: true,
      driveSummary: '6 plays, 59 yards, 3:18',
      lastPlayText: `Pass complete to the ${homeTeam} 16 for 12 yards.`,
    });
  }
  if (preset === 'goal-to-go') {
    return withStats({
      shortDownDistance: '2nd & Goal',
      possessionText: `${awayTeam} 8`,
      yardLine: 8,
      distance: 8,
      isRedZone: true,
      driveSummary: '9 plays, 67 yards, 4:42',
      lastPlayText: `Run up the middle to the ${awayTeam} 8 for 4 yards.`,
    });
  }
  if (preset === 'halftime') {
    return withStats({
      shortDownDistance: null,
      possessionText: null,
      yardLine: null,
      distance: null,
      isRedZone: false,
      driveSummary: 'Halftime',
      lastPlayText: 'End of the second quarter.',
    });
  }
  if (preset === 'feed-unavailable') {
    return withStats({
      shortDownDistance: '1st & 10',
      possessionText: null,
      yardLine: null,
      distance: 10,
      isRedZone: false,
      driveSummary: 'Updating',
      lastPlayText: null,
    });
  }
  return withStats({
    shortDownDistance: '1st & 10',
    possessionText: `${awayTeam} 25`,
    yardLine: 25,
    distance: 10,
    isRedZone: false,
    driveSummary: '3 plays, 18 yards, 1:34',
    lastPlayText: `Run to the ${awayTeam} 25 for 5 yards.`,
  });
}

export function sandboxDisplayStatus(
  statusState: string | null,
  startTime: Date,
  isFinal: boolean,
  now: Date = new Date(),
): 'pre' | 'in' | 'post' {
  if (isFinal || statusState === 'post') return 'post';
  if (statusState === 'in' || startTime.getTime() <= now.getTime()) return 'in';
  return 'pre';
}
