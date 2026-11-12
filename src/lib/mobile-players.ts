import { prisma } from './prisma';
import { getUserStats } from './scoring';
import { ACHIEVEMENTS } from './achievements';
import { MobileError } from './mobile-auth';
import { gameHasStarted } from './game-availability';
import { gamePickOpen, lockAndCheckGame } from './game-lock';

// Native contracts deliberately whitelist fields: never serialize a User record.
export async function mobileProfile(userId: string, viewerId: string, seasonId: string) {
  const stats = await getUserStats(userId, viewerId);
  if (!stats) throw new MobileError(404, 'Player not found.');
  const [earned, awards, opponents] = await Promise.all([
    prisma.userAchievement.findMany({ where: { userId } }),
    prisma.slateAward.findMany({ where: { userId, weekId: { in: stats.weeklyScores.map(s => s.weekId) } } }),
    prisma.weeklyScore.findMany({ where: { week: { seasonId }, userId: { not: userId }, user: { role: 'USER' } }, select: { userId: true, weekId: true, points: true, adminOverridePoints: true, user: { select: { profile: { select: { displayName: true } } } } } }),
  ]);
  const own = new Map(stats.weeklyScores.map(s => [s.weekId, s.adminOverridePoints ?? s.points]));
  const rivals = new Map<string, { id: string; displayName: string; wins: number; losses: number; ties: number }>();
  for (const score of opponents) {
    const points = own.get(score.weekId); if (points === undefined) continue;
    const row = rivals.get(score.userId) ?? { id: score.userId, displayName: score.user.profile?.displayName ?? 'Player', wins: 0, losses: 0, ties: 0 };
    const other = score.adminOverridePoints ?? score.points;
    if (points > other) row.wins++; else if (points < other) row.losses++; else row.ties++;
    rivals.set(row.id, row);
  }
  return { profile: {
    id: stats.id, displayName: stats.displayName, totalPoints: stats.totalPoints, bestWeek: stats.bestWeek,
    pickPercentage: stats.pickPercentage, currentStreak: stats.currentStreak, bestStreak: stats.bestStreak,
    weeksWon: stats.weeklyScores.filter(s => s.finalRank === 1).length,
    correctPicks: stats.picks.filter(p => p.isCorrect === true).length,
    gradedPicks: stats.picks.filter(p => p.isCorrect !== null).length,
    weeks: stats.cumulativeData,
    picks: stats.picks.map(p => ({ id: p.id, week: p.week.weekNumber, home: p.game.homeTeam, away: p.game.awayTeam, team: p.pickedTeam, correct: p.isCorrect, startsAt: p.game.startTime.toISOString() })),
    achievements: ACHIEVEMENTS.map(a => ({ ...a, earnedAt: earned.find(e => e.achievementId === a.id)?.earnedAt.toISOString() ?? null })),
    awards: awards.map(a => ({ id: a.id, name: a.awardType.replaceAll('_', ' ') })),
    rivals: [...rivals.values()],
  } };
}

export async function mobileParticipation(weekId: string) {
  const [games, players] = await Promise.all([
    prisma.game.findMany({ where: { weekId }, select: { id: true, startTime: true, isFinal: true, statusState: true, homeTeam: true, awayTeam: true } }),
    prisma.user.findMany({ where: { role: 'USER' }, select: { id: true, profile: { select: { displayName: true } }, picks: { where: { weekId }, select: { gameId: true, pickedTeam: true } } }, orderBy: { createdAt: 'asc' } }),
  ]);
  const closed = new Set<string>();
  const locks = await prisma.auditLog.findMany({ where: { id: { in: games.map(g => `game-lock:${g.id}`) } }, select: { targetId: true } });
  for (const game of games) if (gameHasStarted(game) || locks.some(l => l.targetId === game.id)) closed.add(game.id);
  return {
    players: players.map(p => ({ id: p.id, displayName: p.profile?.displayName ?? 'Player', saved: p.picks.length, total: games.length })),
    games: games.map(g => ({ id: g.id, home: g.homeTeam, away: g.awayTeam, revealed: closed.has(g.id), picks: closed.has(g.id) ? players.flatMap(p => p.picks.filter(x => x.gameId === g.id).map(x => ({ id: p.id, displayName: p.profile?.displayName ?? 'Player', team: x.pickedTeam }))) : [] })),
  };
}

function challengeDetails(type: string, value: unknown, teams: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const d = value as Record<string, unknown>;
  if (type === 'winner' && Object.keys(d).length === 1 && typeof d.team === 'string' && teams.includes(d.team)) return { team: d.team };
  if (typeof d.value !== 'number' || !Number.isFinite(d.value) || Math.abs(d.value) > 200 || Object.keys(d).length !== 2) return null;
  if (type === 'spread' && typeof d.team === 'string' && teams.includes(d.team)) return { team: d.team, value: d.value };
  if (type === 'total' && ['over', 'under'].includes(String(d.direction)) && d.value >= 0) return { direction: d.direction as string, value: d.value };
  return null;
}

export async function mobileChallenges(request: Request, path: string[], user: { id: string; role: string }, seasonId: string, json: (r: Request, keys: string[]) => Promise<Record<string, unknown>>) {
  const games = await prisma.game.findMany({ where: { week: { seasonId } }, select: { id: true, homeTeam: true, awayTeam: true, startTime: true, isFinal: true, statusState: true } });
  const ids = games.map(g => g.id);
  // Existing free-text stakes are deliberately excluded, even from responses.
  if (path.length === 3 && request.method === 'GET') {
    const bets = await prisma.sideBet.findMany({ where: { sport: 'nfl', gameId: { in: ids }, stake: null, OR: [{ proposerId: user.id }, { acceptorId: user.id }] }, select: { id: true, gameId: true, proposerId: true, acceptorId: true, betType: true, betDetails: true, status: true, winnerId: true, proposer: { select: { profile: { select: { displayName: true } } } }, acceptor: { select: { profile: { select: { displayName: true } } } } }, orderBy: { createdAt: 'desc' }, take: 100 });
    return { challenges: (await Promise.all(bets.map(async b => { const g = games.find(g => g.id === b.gameId)!; return { id: b.id, gameId: g.id, home: g.homeTeam, away: g.awayTeam, proposerId: b.proposerId, acceptorId: b.acceptorId, proposerName: b.proposer.profile?.displayName ?? 'Player', acceptorName: b.acceptor.profile?.displayName ?? 'Player', betType: b.betType, details: challengeDetails(b.betType, b.betDetails, [g.homeTeam,g.awayTeam]), status: b.status === 'pending' && !(await gamePickOpen(g)) ? 'expired' : b.status, winnerId: b.winnerId }; }))).filter(b => b.details !== null) };
  }
  if (user.role !== 'USER') throw new MobileError(403, 'Challenges are for players.');
  if (path.length === 3 && request.method === 'POST') {
    const body = await json(request, ['acceptorId', 'gameId', 'team']);
    if (typeof body.acceptorId !== 'string' || typeof body.gameId !== 'string' || typeof body.team !== 'string' || body.acceptorId === user.id) throw new MobileError(400, 'Choose another player, a game, and your team.');
    const g = games.find(g => g.id === body.gameId);
    if (!g || ![g.homeTeam, g.awayTeam].includes(body.team)) throw new MobileError(400, 'Choose a team in this league’s game.');
    const opponent = await prisma.user.findFirst({ where: { id: body.acceptorId, role: 'USER' }, select: { id: true } });
    if (!opponent) throw new MobileError(400, 'Player not found.');
    const team = body.team;
    await prisma.$transaction(async tx => {
      if (!(await lockAndCheckGame(tx, g.id))) throw new MobileError(409, 'This game has locked.');
      const duplicate = await tx.sideBet.findFirst({ where: { gameId: g.id, stake: null, status: { in: ['pending', 'accepted'] }, OR: [{ proposerId: user.id, acceptorId: opponent.id }, { proposerId: opponent.id, acceptorId: user.id }] } });
      if (duplicate) throw new MobileError(409, 'You already have a challenge with this player for this game.');
      await tx.sideBet.create({ data: { proposerId: user.id, acceptorId: opponent.id, sport: 'nfl', gameId: g.id, betType: 'winner', betDetails: { team }, stake: null } });
    });
    return { ok: true };
  }
  if (path.length === 4 && request.method === 'PATCH') {
    const body = await json(request, ['action']);
    if (!['accept', 'decline', 'cancel'].includes(String(body.action))) throw new MobileError(400, 'Invalid action.');
    await prisma.$transaction(async tx => {
      const bet = await tx.sideBet.findFirst({ where: { id: path[3], sport: 'nfl', gameId: { in: ids }, stake: null } });
      if (!bet || (body.action === 'cancel' ? bet.proposerId : bet.acceptorId) !== user.id) throw new MobileError(404, 'Challenge not found.');
      const game = games.find(g => g.id === bet.gameId)!;
      if (body.action === 'accept' && !challengeDetails(bet.betType, bet.betDetails, [game.homeTeam, game.awayTeam])) throw new MobileError(400, 'This legacy challenge is not supported in the app.');
      if (body.action === 'accept' && !(await lockAndCheckGame(tx, bet.gameId!))) throw new MobileError(409, 'This game has locked.');
      const update = await tx.sideBet.updateMany({ where: { id: bet.id, status: 'pending', stake: null }, data: { status: body.action === 'accept' ? 'accepted' : body.action === 'cancel' ? 'cancelled' : 'declined' } });
      if (!update.count) throw new MobileError(409, 'This challenge has changed. Refresh and try again.');
    });
    return { ok: true };
  }
  throw new MobileError(404, 'Challenge action not found.');
}

export async function mobileRecords() {
  const seasons = await prisma.season.findMany({ where: { isSandbox: false }, orderBy: [{ year: 'desc' }, { seasonType: 'desc' }], include: { weeks: { include: { weeklyScores: { include: { user: { select: { profile: { select: { displayName: true } } } } } }, tiebreakers: { where: { difference: { not: null } }, select: { difference: true, user: { select: { profile: { select: { displayName: true } } } } } } } } } });
  const scores = seasons.flatMap(s => s.weeks.flatMap(w => w.weeklyScores));
  const highest = [...scores].sort((a,b) => b.points-a.points)[0];
  const wins = new Map<string,{name:string;count:number}>();
  for (const score of scores.filter(s => s.finalRank === 1)) { const row=wins.get(score.userId) ?? {name:score.user.profile?.displayName ?? 'Player',count:0};row.count++;wins.set(score.userId,row); }
  const most = [...wins.values()].sort((a,b)=>b.count-a.count)[0];
  const closest = seasons.flatMap(s=>s.weeks.flatMap(w=>w.tiebreakers)).sort((a,b)=>(a.difference ?? Infinity)-(b.difference ?? Infinity))[0];
  return { records: [
    {id:'high',title:'Highest weekly score',value:highest ? `${highest.points} pts · ${highest.user.profile?.displayName ?? 'Player'}`:'—'},
    {id:'wins',title:'Most weekly wins',value:most ? `${most.count} · ${most.name}`:'—'},
    {id:'tiebreaker',title:'Closest tiebreaker',value:closest ? `${closest.difference} away · ${closest.user.profile?.displayName ?? 'Player'}`:'—'},
  ], seasons: seasons.map(s=>{const rows=new Map<string,{id:string;displayName:string;points:number}>();for(const score of s.weeks.flatMap(w=>w.weeklyScores)){const row=rows.get(score.userId) ?? {id:score.userId,displayName:score.user.profile?.displayName ?? 'Player',points:0};row.points+=score.points;rows.set(score.userId,row);}return {id:s.id,year:s.year,type:s.seasonType,active:s.isActive,weeks:s.weeks.length,players:[...rows.values()].sort((a,b)=>b.points-a.points)};}) };
}
