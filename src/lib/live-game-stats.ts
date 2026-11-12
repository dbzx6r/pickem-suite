export interface LiveTeamStat {
  name: string;
  label: string;
  away: string | null;
  home: string | null;
}

export interface LivePlayerStatLine {
  athlete: string;
  stats: string[];
}

export interface LivePlayerCategory {
  name: string;
  label: string;
  labels: string[];
  away: LivePlayerStatLine[];
  home: LivePlayerStatLine[];
}

export interface LiveGameStats {
  teamStats: LiveTeamStat[];
  boxScore: LivePlayerCategory[];
}

type EspnBoxScore = {
  teams?: Array<{
    homeAway?: 'home' | 'away';
    team?: { abbreviation?: string };
    statistics?: Array<{ name?: string; label?: string; displayValue?: string }>;
  }>;
  players?: Array<{
    team?: { abbreviation?: string };
    statistics?: Array<{
      name?: string;
      text?: string;
      labels?: string[];
      athletes?: Array<{
        athlete?: { displayName?: string };
        stats?: string[];
      }>;
    }>;
  }>;
};

const TEAM_STAT_ORDER = [
  'firstDowns',
  'thirdDownEff',
  'fourthDownEff',
  'totalOffensivePlays',
  'totalYards',
  'yardsPerPlay',
  'netPassingYards',
  'rushingYards',
  'rushingAttempts',
  'redZoneAttempts',
  'totalPenaltiesYards',
  'turnovers',
  'possessionTime',
];

const CATEGORY_LABELS: Record<string, string> = {
  passing: 'Passing',
  rushing: 'Rushing',
  receiving: 'Receiving',
  fumbles: 'Fumbles',
  defensive: 'Defense',
  interceptions: 'Interceptions',
  kickReturns: 'Kick Returns',
  puntReturns: 'Punt Returns',
  kicking: 'Kicking',
  punting: 'Punting',
};

function text(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maximum) : null;
}

function statLines(value: unknown, labels: string[]): LivePlayerStatLine[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const input = item as Record<string, unknown>;
    const athlete = text(input.athlete, 80);
    if (!athlete || !Array.isArray(input.stats)) return [];
    const stats = input.stats.slice(0, labels.length).map((entry) => text(entry, 30) ?? '—');
    return [{ athlete, stats }];
  });
}

export function parseLiveGameStats(value: unknown): LiveGameStats {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const teamStats = Array.isArray(input.teamStats)
    ? input.teamStats.slice(0, 24).flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const stat = item as Record<string, unknown>;
        const name = text(stat.name, 50);
        const label = text(stat.label, 80);
        if (!name || !label) return [];
        return [{
          name,
          label,
          away: text(stat.away, 40),
          home: text(stat.home, 40),
        }];
      })
    : [];
  const boxScore = Array.isArray(input.boxScore)
    ? input.boxScore.slice(0, 16).flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const category = item as Record<string, unknown>;
        const name = text(category.name, 50);
        const label = text(category.label, 80);
        if (!name || !label || !Array.isArray(category.labels)) return [];
        const labels = category.labels.slice(0, 12).map((entry) => text(entry, 30)).filter((entry): entry is string => Boolean(entry));
        if (labels.length === 0) return [];
        return [{
          name,
          label,
          labels,
          away: statLines(category.away, labels),
          home: statLines(category.home, labels),
        }];
      })
    : [];
  return { teamStats, boxScore };
}

export function parseEspnLiveGameStats(
  boxscore: EspnBoxScore | null | undefined,
  awayTeam: string,
  homeTeam: string,
): LiveGameStats {
  const teamGroups = boxscore?.teams ?? [];
  const awayStats = teamGroups.find((team) => team.homeAway === 'away' || team.team?.abbreviation === awayTeam)?.statistics ?? [];
  const homeStats = teamGroups.find((team) => team.homeAway === 'home' || team.team?.abbreviation === homeTeam)?.statistics ?? [];
  const awayByName = new Map(awayStats.flatMap((stat) => stat.name ? [[stat.name, stat]] : []));
  const homeByName = new Map(homeStats.flatMap((stat) => stat.name ? [[stat.name, stat]] : []));
  const teamStats = TEAM_STAT_ORDER.flatMap((name) => {
    const away = awayByName.get(name);
    const home = homeByName.get(name);
    if (!away && !home) return [];
    return [{
      name,
      label: away?.label ?? home?.label ?? name,
      away: away?.displayValue ?? null,
      home: home?.displayValue ?? null,
    }];
  });

  const playerGroups = boxscore?.players ?? [];
  const awayCategories = playerGroups.find((group) => group.team?.abbreviation === awayTeam)?.statistics ?? [];
  const homeCategories = playerGroups.find((group) => group.team?.abbreviation === homeTeam)?.statistics ?? [];
  const awayCategoryByName = new Map(awayCategories.flatMap((category) => category.name ? [[category.name, category]] : []));
  const homeCategoryByName = new Map(homeCategories.flatMap((category) => category.name ? [[category.name, category]] : []));
  const categoryNames = Array.from(new Set([...awayCategoryByName.keys(), ...homeCategoryByName.keys()]));
  const boxScore = categoryNames.flatMap((name) => {
    const away = awayCategoryByName.get(name);
    const home = homeCategoryByName.get(name);
    const labels = (away?.labels ?? home?.labels ?? []).slice(0, 12);
    if (labels.length === 0) return [];
    const lines = (athletes: typeof awayCategories[number]['athletes']): LivePlayerStatLine[] =>
      (athletes ?? []).flatMap((entry) => {
        const athlete = entry.athlete?.displayName?.trim();
        if (!athlete || !entry.stats) return [];
        return [{ athlete, stats: entry.stats.slice(0, labels.length) }];
      });
    const awayLines = lines(away?.athletes);
    const homeLines = lines(home?.athletes);
    if (awayLines.length === 0 && homeLines.length === 0) return [];
    return [{
      name,
      label: CATEGORY_LABELS[name] ?? name,
      labels,
      away: awayLines,
      home: homeLines,
    }];
  });
  return parseLiveGameStats({ teamStats, boxScore });
}

export function sandboxLiveGameStats(awayTeam: string, homeTeam: string): LiveGameStats {
  return {
    teamStats: [
      { name: 'firstDowns', label: '1st Downs', away: '16', home: '19' },
      { name: 'thirdDownEff', label: '3rd down efficiency', away: '5-11', home: '6-12' },
      { name: 'fourthDownEff', label: '4th down efficiency', away: '1-1', home: '0-1' },
      { name: 'totalOffensivePlays', label: 'Total Plays', away: '55', home: '61' },
      { name: 'totalYards', label: 'Total Yards', away: '318', home: '347' },
      { name: 'yardsPerPlay', label: 'Yards Per Play', away: '5.8', home: '5.7' },
      { name: 'netPassingYards', label: 'Passing Yards', away: '214', home: '229' },
      { name: 'rushingYards', label: 'Rushing Yards', away: '104', home: '118' },
      { name: 'redZoneAttempts', label: 'Red Zone', away: '2-3', home: '3-4' },
      { name: 'totalPenaltiesYards', label: 'Penalties', away: '6-48', home: '5-41' },
      { name: 'turnovers', label: 'Turnovers', away: '1', home: '0' },
      { name: 'possessionTime', label: 'Possession', away: '28:34', home: '31:26' },
    ],
    boxScore: [
      {
        name: 'passing', label: 'Passing', labels: ['C/ATT', 'YDS', 'TD', 'INT', 'RTG'],
        away: [{ athlete: `${awayTeam} Quarterback`, stats: ['18/27', '214', '2', '1', '96.4'] }],
        home: [{ athlete: `${homeTeam} Quarterback`, stats: ['21/30', '229', '2', '0', '108.9'] }],
      },
      {
        name: 'rushing', label: 'Rushing', labels: ['CAR', 'YDS', 'AVG', 'TD', 'LONG'],
        away: [{ athlete: `${awayTeam} Running Back`, stats: ['17', '82', '4.8', '1', '18'] }],
        home: [{ athlete: `${homeTeam} Running Back`, stats: ['19', '96', '5.1', '1', '24'] }],
      },
      {
        name: 'receiving', label: 'Receiving', labels: ['REC', 'YDS', 'AVG', 'TD', 'TGTS'],
        away: [{ athlete: `${awayTeam} Receiver`, stats: ['6', '88', '14.7', '1', '8'] }],
        home: [{ athlete: `${homeTeam} Receiver`, stats: ['7', '101', '14.4', '1', '9'] }],
      },
      {
        name: 'defensive', label: 'Defense', labels: ['TOT', 'SOLO', 'SACKS', 'TFL', 'PD'],
        away: [{ athlete: `${awayTeam} Linebacker`, stats: ['8', '6', '1', '2', '1'] }],
        home: [{ athlete: `${homeTeam} Safety`, stats: ['9', '7', '0', '1', '2'] }],
      },
      {
        name: 'kicking', label: 'Kicking', labels: ['FG', 'LONG', 'XP', 'PTS'],
        away: [{ athlete: `${awayTeam} Kicker`, stats: ['1/1', '42', '2/2', '5'] }],
        home: [{ athlete: `${homeTeam} Kicker`, stats: ['2/2', '51', '2/2', '8'] }],
      },
    ],
  };
}
