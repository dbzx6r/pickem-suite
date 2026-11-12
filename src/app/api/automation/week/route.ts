import { NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/apiKeyAuth';
import { checkRateLimit } from '@/lib/rateLimit';
import { gamePickOpen } from '@/lib/game-lock';
import {
  getNextPersonalAutopickWeek,
  isPersonalAutopickUser,
} from '@/lib/personal-autopick';

// NFL team full names map
const TEAM_NAMES: Record<string, string> = {
  ARI: 'Arizona Cardinals', ATL: 'Atlanta Falcons', BAL: 'Baltimore Ravens',
  BUF: 'Buffalo Bills', CAR: 'Carolina Panthers', CHI: 'Chicago Bears',
  CIN: 'Cincinnati Bengals', CLE: 'Cleveland Browns', DAL: 'Dallas Cowboys',
  DEN: 'Denver Broncos', DET: 'Detroit Lions', GB: 'Green Bay Packers',
  HOU: 'Houston Texans', IND: 'Indianapolis Colts', JAX: 'Jacksonville Jaguars',
  KC: 'Kansas City Chiefs', LAC: 'Los Angeles Chargers', LAR: 'Los Angeles Rams',
  LV: 'Las Vegas Raiders', MIA: 'Miami Dolphins', MIN: 'Minnesota Vikings',
  NE: 'New England Patriots', NO: 'New Orleans Saints', NYG: 'New York Giants',
  NYJ: 'New York Jets', PHI: 'Philadelphia Eagles', PIT: 'Pittsburgh Steelers',
  SEA: 'Seattle Seahawks', SF: 'San Francisco 49ers', TB: 'Tampa Bay Buccaneers',
  TEN: 'Tennessee Titans', WSH: 'Washington Commanders',
};

export async function GET(request: Request) {
  const user = await authenticateApiKey(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isPersonalAutopickUser(user.id)) {
    return NextResponse.json({ error: 'Personal autopicks are not enabled for this account' }, { status: 403 });
  }

  const rl = await checkRateLimit(`automation:${user.apiKey!}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
  }

  const now = new Date();
  const activeWeek = await getNextPersonalAutopickWeek(now);

  if (!activeWeek) return NextResponse.json({ error: 'No week is open for personal autopicks' }, { status: 404 });

  const availability = await Promise.all(activeWeek.games.map(game => gamePickOpen(game, now)));
  const isLocked = !availability.some(Boolean);

  return NextResponse.json({
    weekId: activeWeek.id,
    weekNumber: activeWeek.weekNumber,
    season: activeWeek.season.year,
    lockTime: activeWeek.lockTime.toISOString(),
    isLocked,
    doubleGameId: activeWeek.doubleGameId,
    tiebreakerGameId: activeWeek.tiebreakerGameId,
    games: activeWeek.games.map((g, index) => ({
      id: g.id,
      homeTeam: g.homeTeam,
      awayTeam: g.awayTeam,
      homeTeamFull: TEAM_NAMES[g.homeTeam] ?? g.homeTeam,
      awayTeamFull: TEAM_NAMES[g.awayTeam] ?? g.awayTeam,
      startTime: g.startTime.toISOString(),
      isLocked: !availability[index],
      isDoubleGame: g.id === activeWeek.doubleGameId,
      isTiebreakerGame: g.id === activeWeek.tiebreakerGameId,
    })),
  });
}
