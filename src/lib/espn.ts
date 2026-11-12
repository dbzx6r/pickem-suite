import { LivePlayerCategory, LiveTeamStat, parseEspnLiveGameStats } from '@/lib/live-game-stats';
import { normalizeEspnClock } from '@/lib/espn-clock';

export interface EspnGame {
  id: string;
  competitions: Array<{
    id: string;
    date: string;
    status: {
      period: number;
      clock: string | number;
      displayClock?: string;
      type: {
          state: 'pre' | 'in' | 'post';
          completed: boolean;
          description: string;
          name?: string;
          id?: string;
        };
    };
    situation?: {
      possession?: string;
      downDistanceText?: string;
      shortDownDistanceText?: string;
      possessionText?: string;
      yardLine?: number;
      distance?: number;
      isRedZone?: boolean;
      lastPlay?: {
        text?: string;
      };
    };
    competitors: Array<{
      id: string;
      homeAway: 'home' | 'away';
      team: {
        id: string;
        abbreviation: string;
        displayName: string;
        color?: string;
        alternateColor?: string;
        logo?: string;
      };
      score?: string;
      winner?: boolean;
      linescores?: Array<{ value: number }>;
      records?: Array<{ type?: string; summary?: string }>;
    }>;
    venue?: {
      fullName: string;
      address?: {
        city: string;
        state: string;
      };
    };
    odds?: Array<{
      details?: string;
      overUnder?: number;
      provider?: { name?: string };
    }>;
    broadcasts?: Array<{ names?: string[] }>;
    weather?: { displayValue?: string; temperature?: number; conditionId?: string };
  }>;
}

export interface EspnSummaryResponse {
  boxscore?: {
    teams?: Array<{
      homeAway: 'home' | 'away';
      team?: { abbreviation?: string };
      statistics?: Array<{
        name: string;
        label?: string;
        displayValue: string;
      }>;
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
  drives?: {
    current?: {
      description?: string;
      plays?: Array<{ text?: string }>;
    };
  };
}

export interface NflGame {
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  homeScoreQ1: number | null;
  homeScoreQ2: number | null;
  homeScoreQ3: number | null;
  homeScoreQ4: number | null;
  awayScoreQ1: number | null;
  awayScoreQ2: number | null;
  awayScoreQ3: number | null;
  awayScoreQ4: number | null;
  winnerTeam: string | null;
  startTime: Date;
  isFinal: boolean;
  espnGameId: string;
  period: number | null;
  clock: string | null;
  possession: string | null;
  downDistance: string | null;
  shortDownDistance: string | null;
  possessionText: string | null;
  yardLine: number | null;
  distance: number | null;
  isRedZone: boolean;
  lastPlayText: string | null;
  driveSummary: string | null;
  teamStats: LiveTeamStat[] | null;
  boxScore: LivePlayerCategory[] | null;
  homeTimeOfPossession: string | null;
  awayTimeOfPossession: string | null;
  statusState: string;
  venue: string | null;
  spreadLine: string | null;
  overUnder: number | null;
  homeRecord: string | null;
  awayRecord: string | null;
  weather: string | null;
  broadcast: string | null;
  oddsProvider: string | null;
}

export interface CurrentNFLWeek {
  weekNumber: number;
  year: number;
  seasonType: number;
  games: NflGame[];
}

export async function fetchCurrentNFLWeek(): Promise<CurrentNFLWeek | null> {
  try {
    if (process.env.ENABLE_ESPN_DATA !== 'true') throw new Error('External sports feed is disabled');
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`ESPN API error: ${res.status}`);
    const data = await res.json();

    const weekNumber: number = data.week?.number;
    const year: number = data.season?.year;
    const seasonType = Number(data.season?.type);
    if (!weekNumber || !year || !seasonType) return null;

    const games = await fetchEspnScoreboard(weekNumber, year, seasonType);
    return { weekNumber, year, seasonType, games };
  } catch (error) {
    console.error('ESPN current week fetch error:', error);
    return null;
  }
}

export async function fetchEspnScoreboard(
  week: number,
  year: number = new Date().getFullYear(),
  seasonType: number = 2,
  includeFinalDetails: boolean = false,
): Promise<NflGame[]> {
  try {
    if (process.env.ENABLE_ESPN_DATA !== 'true') throw new Error('External sports feed is disabled');
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=${seasonType}&dates=${year}`;
    const res = await fetch(url, { next: { revalidate: 15 } });
    if (!res.ok) throw new Error(`ESPN API error: ${res.status}`);
    const data = await res.json();

    const games = (data.events || []).map((event: EspnGame) => {
      const comp = event.competitions[0];
      const home = comp.competitors.find((c) => c.homeAway === 'home');
      const away = comp.competitors.find((c) => c.homeAway === 'away');

      if (!home || !away) return null;

      const homeLinescores = home.linescores || [];
      const awayLinescores = away.linescores || [];

      const homeScore = home.score ? parseInt(home.score) : null;
      const awayScore = away.score ? parseInt(away.score) : null;

      // Use ESPN status type name/id for reliable terminal state detection.
      // ESPN type IDs: 1=Scheduled, 2=In Progress, 3=Final, 4=Forfeit,
      //                5=Canceled, 6=Postponed, 7=Delayed, 8=Suspended
      const statusTypeName: string = comp.status.type.name ?? '';
      const statusTypeId: string = String(comp.status.type.id ?? '');

      const isPostponed = statusTypeName === 'STATUS_POSTPONED' || statusTypeId === '6';
      const isCanceled  = statusTypeName === 'STATUS_CANCELED'  || statusTypeId === '5';
      const isSuspended = statusTypeName === 'STATUS_SUSPENDED' || statusTypeId === '8';
      const isForfeit   = statusTypeName === 'STATUS_FORFEIT'   || statusTypeId === '4';

      const isFinalByESPN =
        comp.status.type.completed ||
        statusTypeName === 'STATUS_FINAL' ||
        statusTypeId === '3';

      let statusState: string;
      if (isPostponed || isForfeit) statusState = 'postponed';
      else if (isCanceled)          statusState = 'canceled';
      else if (isSuspended)         statusState = 'suspended';
      else if (isFinalByESPN)       statusState = 'post';
      else                          statusState = comp.status.type.state;

      let winnerTeam: string | null = null;
      if (isFinalByESPN && !isPostponed && !isCanceled && !isSuspended && !isForfeit) {
        if (home.winner) winnerTeam = home.team.abbreviation;
        else if (away.winner) winnerTeam = away.team.abbreviation;
        else if (homeScore !== null && awayScore !== null) {
          if (homeScore > awayScore) winnerTeam = home.team.abbreviation;
          else if (awayScore > homeScore) winnerTeam = away.team.abbreviation;
        }
      }

      const possessionAbbrev =
        comp.situation?.possession
          ? comp.competitors.find(
              (c) => c.team.id === comp.situation?.possession
            )?.team.abbreviation ?? null
          : null;

      const venueAddress = comp.venue?.address;
      const venue = comp.venue
        ? [comp.venue.fullName, venueAddress ? `${venueAddress.city}, ${venueAddress.state}` : null]
            .filter(Boolean).join(' · ')
        : null;
      const spreadLine = comp.odds?.[0]?.details ?? null;
      const overUnder = comp.odds?.[0]?.overUnder ?? null;
      const homeRecord = home.records?.find((record) => record.type === 'total')?.summary ?? home.records?.[0]?.summary ?? null;
      const awayRecord = away.records?.find((record) => record.type === 'total')?.summary ?? away.records?.[0]?.summary ?? null;
      const weather = comp.weather?.displayValue ?? (comp.weather?.temperature ? `${comp.weather.temperature}°F` : null);
      const broadcast = comp.broadcasts?.flatMap((item) => item.names ?? []).join(', ') || null;
      const oddsProvider = comp.odds?.[0]?.provider?.name ?? null;

      return {
        homeTeam: home.team.abbreviation,
        awayTeam: away.team.abbreviation,
        homeScore,
        awayScore,
        homeScoreQ1: homeLinescores[0]?.value ?? null,
        homeScoreQ2: homeLinescores[1]?.value ?? null,
        homeScoreQ3: homeLinescores[2]?.value ?? null,
        homeScoreQ4: homeLinescores[3]?.value ?? null,
        awayScoreQ1: awayLinescores[0]?.value ?? null,
        awayScoreQ2: awayLinescores[1]?.value ?? null,
        awayScoreQ3: awayLinescores[2]?.value ?? null,
        awayScoreQ4: awayLinescores[3]?.value ?? null,
        winnerTeam,
        startTime: new Date(comp.date),
        isFinal: isFinalByESPN || isPostponed || isCanceled || isSuspended || isForfeit,
        espnGameId: comp.id,
        period: comp.status.period || null,
        clock: normalizeEspnClock(comp.status.clock, comp.status.displayClock),
        possession: possessionAbbrev,
        downDistance: comp.situation?.downDistanceText ?? null,
        shortDownDistance: comp.situation?.shortDownDistanceText ?? null,
        possessionText: comp.situation?.possessionText ?? null,
        yardLine: Number.isFinite(comp.situation?.yardLine) ? comp.situation?.yardLine ?? null : null,
        distance: Number.isFinite(comp.situation?.distance) ? comp.situation?.distance ?? null : null,
        isRedZone: comp.situation?.isRedZone ?? false,
        lastPlayText: comp.situation?.lastPlay?.text ?? null,
        driveSummary: null,
        teamStats: null,
        boxScore: null,
        homeTimeOfPossession: null,
        awayTimeOfPossession: null,
        statusState,
        venue,
        spreadLine,
        overUnder,
        homeRecord,
        awayRecord,
        weather,
        broadcast,
        oddsProvider,
      } as NflGame;
    }).filter(Boolean) as NflGame[];

    const detailGames = games.filter(
      (game) => game.statusState === 'in' || (includeFinalDetails && game.statusState === 'post'),
    );
    if (detailGames.length > 0) {
      const driveSummaries = await Promise.all(
        detailGames.map(async (game) => ({
          espnGameId: game.espnGameId,
          summary: await fetchEspnLiveGameSummary(game.espnGameId, game.awayTeam, game.homeTeam),
        })),
      );
      const summaryByGame = new Map(
        driveSummaries.map(({ espnGameId, summary }) => [espnGameId, summary]),
      );
      for (const game of detailGames) {
        const summary = summaryByGame.get(game.espnGameId);
        game.driveSummary = summary?.driveSummary ?? null;
        game.lastPlayText = game.lastPlayText ?? summary?.lastPlayText ?? null;
        game.teamStats = summary?.teamStats.length ? summary.teamStats : null;
        game.boxScore = summary?.boxScore.length ? summary.boxScore : null;
      }
    }

    return games;
  } catch (error) {
    console.error('ESPN scoreboard fetch error:', error);
    return [];
  }
}

async function fetchEspnLiveGameSummary(espnGameId: string, awayTeam: string, homeTeam: string): Promise<{
  driveSummary: string | null;
  lastPlayText: string | null;
  teamStats: LiveTeamStat[];
  boxScore: LivePlayerCategory[];
}> {
  try {
    if (process.env.ENABLE_ESPN_DATA !== 'true') throw new Error('External sports feed is disabled');
    const url = `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${espnGameId}`;
    const response = await fetch(url, { next: { revalidate: 15 } });
    if (!response.ok) return { driveSummary: null, lastPlayText: null, teamStats: [], boxScore: [] };
    const data = await response.json() as EspnSummaryResponse;
    const currentDrive = data.drives?.current;
    const plays = currentDrive?.plays ?? [];
    const stats = parseEspnLiveGameStats(data.boxscore, awayTeam, homeTeam);
    return {
      driveSummary: currentDrive?.description ?? null,
      lastPlayText: plays.at(-1)?.text ?? null,
      ...stats,
    };
  } catch {
    return { driveSummary: null, lastPlayText: null, teamStats: [], boxScore: [] };
  }
}

export async function fetchEspnGameSummary(espnGameId: string): Promise<{
  homeTimeOfPossession: string | null;
  awayTimeOfPossession: string | null;
}> {
  try {
    if (process.env.ENABLE_ESPN_DATA !== 'true') throw new Error('External sports feed is disabled');
    const url = `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${espnGameId}`;
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (!res.ok) return { homeTimeOfPossession: null, awayTimeOfPossession: null };
    const data: EspnSummaryResponse = await res.json();

    let homeTop: string | null = null;
    let awayTop: string | null = null;

    if (data.boxscore?.teams) {
      for (const team of data.boxscore.teams) {
        const topStat = team.statistics?.find((s) => s.name === 'possessionTime');
        if (topStat) {
          if (team.homeAway === 'home') homeTop = topStat.displayValue;
          else awayTop = topStat.displayValue;
        }
      }
    }

    return { homeTimeOfPossession: homeTop, awayTimeOfPossession: awayTop };
  } catch {
    return { homeTimeOfPossession: null, awayTimeOfPossession: null };
  }
}

export type EspnInjurySummary = { team: string; player: string; position: string | null; status: string };

export async function fetchEspnPregameContext(espnGameId: string): Promise<{ injuries: EspnInjurySummary[] }> {
  try {
    if (process.env.ENABLE_ESPN_DATA !== 'true') throw new Error('External sports feed is disabled');
    const url = `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${espnGameId}`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return { injuries: [] };
    const data = await response.json() as {
      injuries?: Array<{
        team?: { abbreviation?: string };
        injuries?: Array<{
          athlete?: { displayName?: string; position?: { abbreviation?: string } };
          status?: string;
          type?: { description?: string };
        }>;
      }>;
    };
    const injuries = (data.injuries ?? []).flatMap((group) =>
      (group.injuries ?? []).map((injury) => ({
        team: group.team?.abbreviation ?? 'NFL',
        player: injury.athlete?.displayName ?? 'Player',
        position: injury.athlete?.position?.abbreviation ?? null,
        status: injury.status ?? injury.type?.description ?? 'Listed',
      })),
    ).slice(0, 12);
    return { injuries };
  } catch {
    return { injuries: [] };
  }
}

export function getTeamLogoUrl(abbreviation: string): string {
  if (process.env.NEXT_PUBLIC_TEAM_LOGOS_ENABLED !== 'true') return '';
  if (!/^[A-Za-z]{2,4}$/.test(abbreviation)) return '';
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${abbreviation.toLowerCase()}.png`;
}

export const NFL_TEAMS: Record<string, { name: string; city: string; color: string; abbreviation: string }> = {
  ARI: { name: 'Cardinals', city: 'Arizona', color: '#97233F', abbreviation: 'ARI' },
  ATL: { name: 'Falcons', city: 'Atlanta', color: '#A71930', abbreviation: 'ATL' },
  BAL: { name: 'Ravens', city: 'Baltimore', color: '#241773', abbreviation: 'BAL' },
  BUF: { name: 'Bills', city: 'Buffalo', color: '#00338D', abbreviation: 'BUF' },
  CAR: { name: 'Panthers', city: 'Carolina', color: '#0085CA', abbreviation: 'CAR' },
  CHI: { name: 'Bears', city: 'Chicago', color: '#0B162A', abbreviation: 'CHI' },
  CIN: { name: 'Bengals', city: 'Cincinnati', color: '#FB4F14', abbreviation: 'CIN' },
  CLE: { name: 'Browns', city: 'Cleveland', color: '#311D00', abbreviation: 'CLE' },
  DAL: { name: 'Cowboys', city: 'Dallas', color: '#003594', abbreviation: 'DAL' },
  DEN: { name: 'Broncos', city: 'Denver', color: '#FB4F14', abbreviation: 'DEN' },
  DET: { name: 'Lions', city: 'Detroit', color: '#0076B6', abbreviation: 'DET' },
  GB: { name: 'Packers', city: 'Green Bay', color: '#203731', abbreviation: 'GB' },
  HOU: { name: 'Texans', city: 'Houston', color: '#03202F', abbreviation: 'HOU' },
  IND: { name: 'Colts', city: 'Indianapolis', color: '#002C5F', abbreviation: 'IND' },
  JAX: { name: 'Jaguars', city: 'Jacksonville', color: '#006778', abbreviation: 'JAX' },
  KC: { name: 'Chiefs', city: 'Kansas City', color: '#E31837', abbreviation: 'KC' },
  LV: { name: 'Raiders', city: 'Las Vegas', color: '#000000', abbreviation: 'LV' },
  LAC: { name: 'Chargers', city: 'Los Angeles', color: '#0080C6', abbreviation: 'LAC' },
  LAR: { name: 'Rams', city: 'Los Angeles', color: '#003594', abbreviation: 'LAR' },
  MIA: { name: 'Dolphins', city: 'Miami', color: '#008E97', abbreviation: 'MIA' },
  MIN: { name: 'Vikings', city: 'Minnesota', color: '#4F2683', abbreviation: 'MIN' },
  NE: { name: 'Patriots', city: 'New England', color: '#002244', abbreviation: 'NE' },
  NO: { name: 'Saints', city: 'New Orleans', color: '#D3BC8D', abbreviation: 'NO' },
  NYG: { name: 'Giants', city: 'New York', color: '#0B2265', abbreviation: 'NYG' },
  NYJ: { name: 'Jets', city: 'New York', color: '#125740', abbreviation: 'NYJ' },
  PHI: { name: 'Eagles', city: 'Philadelphia', color: '#004C54', abbreviation: 'PHI' },
  PIT: { name: 'Steelers', city: 'Pittsburgh', color: '#FFB612', abbreviation: 'PIT' },
  SF: { name: '49ers', city: 'San Francisco', color: '#AA0000', abbreviation: 'SF' },
  SEA: { name: 'Seahawks', city: 'Seattle', color: '#002244', abbreviation: 'SEA' },
  TB: { name: 'Buccaneers', city: 'Tampa Bay', color: '#D50A0A', abbreviation: 'TB' },
  TEN: { name: 'Titans', city: 'Tennessee', color: '#0C2340', abbreviation: 'TEN' },
  WSH: { name: 'Commanders', city: 'Washington', color: '#5A1414', abbreviation: 'WSH' },
};
