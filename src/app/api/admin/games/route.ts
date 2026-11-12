import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { recordAudit } from '@/lib/audit';
import { selectWeeklyTiebreaker } from '@/lib/tiebreaker-selection';
import { NFL_TEAMS, fetchEspnScoreboard } from '@/lib/espn';
import { calculateWeeklyScores } from '@/lib/scoring';
import { espnSeasonType } from '@/lib/season';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id as string } });
  if (user?.role !== 'ADMIN') return null;
  return session;
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { action, weekId, gameId, homeScore, awayScore, homeTeam, awayTeam, startTime, venue } = await request.json();
  if (action === 'create_game') {
    const kickoff = typeof startTime === 'string' ? new Date(startTime) : new Date(NaN);
    if (typeof weekId !== 'string' || typeof homeTeam !== 'string' || typeof awayTeam !== 'string' || !Object.hasOwn(NFL_TEAMS, homeTeam) || !Object.hasOwn(NFL_TEAMS, awayTeam) || homeTeam === awayTeam || !Number.isFinite(kickoff.getTime()) || kickoff <= new Date() || (venue != null && (typeof venue !== 'string' || venue.length > 200))) return NextResponse.json({ error: 'Choose two different teams, a week, and a future kickoff.' }, { status: 400 });
    const week = await prisma.week.findUnique({where:{id:weekId},include:{season:true,games:true}});
    if (!week || week.isFinal || !week.season.isActive || week.season.isSandbox) return NextResponse.json({ error: 'Choose an unfinished active-season week.' }, { status: 400 });
    if (week.games.some(g=>g.homeTeam===homeTeam && g.awayTeam===awayTeam)) return NextResponse.json({error:'This matchup already exists in that week.'},{status:409});
    const game = await prisma.$transaction(async tx=>{
      const created=await tx.game.create({data:{weekId,homeTeam,awayTeam,startTime:kickoff,statusState:'pre',venue:venue || null}});
      const first=await tx.game.findFirst({where:{weekId},orderBy:{startTime:'asc'}});
      if(first) await tx.week.update({where:{id:weekId},data:{lockTime:first.startTime}});
      return created;
    });
    await selectWeeklyTiebreaker(weekId);
    await recordAudit({actorId:session.user.id,action:'MANUAL_GAME_CREATE',targetType:'Game',targetId:game.id});
    return NextResponse.json({game},{status:201});
  }

  if (action === 'sync_scores') {
    const week = await prisma.week.findUnique({
      where: { id: weekId },
      include: { games: true, season: true },
    });
    if (!week) return NextResponse.json({ error: 'Week not found' }, { status: 404 });

    const espnGames = await fetchEspnScoreboard(
      week.weekNumber,
      week.season.year,
      espnSeasonType(week.season.seasonType),
    );

    let updatedCount = 0;
    for (const dbGame of week.games) {
      const espnGame = espnGames.find((g) => g.espnGameId === dbGame.espnGameId);
      if (!espnGame) continue;

      await prisma.game.update({
        where: { id: dbGame.id },
        data: {
          homeScore: espnGame.homeScore,
          awayScore: espnGame.awayScore,
          homeScoreQ1: espnGame.homeScoreQ1,
          homeScoreQ2: espnGame.homeScoreQ2,
          homeScoreQ3: espnGame.homeScoreQ3,
          homeScoreQ4: espnGame.homeScoreQ4,
          awayScoreQ1: espnGame.awayScoreQ1,
          awayScoreQ2: espnGame.awayScoreQ2,
          awayScoreQ3: espnGame.awayScoreQ3,
          awayScoreQ4: espnGame.awayScoreQ4,
          winnerTeam: espnGame.winnerTeam,
          isFinal: espnGame.isFinal,
          period: espnGame.period,
          clock: espnGame.clock,
          possession: espnGame.possession,
          downDistance: espnGame.downDistance,
          statusState: espnGame.statusState,
        },
      });
      updatedCount++;
    }

    return NextResponse.json({ updatedCount });
  }

  if (action === 'manual_score') {
    const game = await prisma.game.findUnique({ where: { id: gameId } });
    if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });

    let winnerTeam: string | null = null;
    if (homeScore !== null && awayScore !== null) {
      if (homeScore > awayScore) winnerTeam = game.homeTeam;
      else if (awayScore > homeScore) winnerTeam = game.awayTeam;
    }

    const updatedGame = await prisma.game.update({
      where: { id: gameId },
      data: { homeScore, awayScore, winnerTeam, isFinal: true, statusState: 'post' },
    });

    return NextResponse.json({ game: updatedGame });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function PATCH(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { gameId, winnerTeam } = await request.json();
  if (!gameId) return NextResponse.json({ error: 'gameId required' }, { status: 400 });

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: { week: true },
  });
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });

  const updated = await prisma.game.update({
    where: { id: gameId },
    data: {
      winnerTeam: winnerTeam ?? null,
      isFinal: winnerTeam ? true : false,
      statusState: winnerTeam ? 'post' : game.statusState,
    },
  });

  // Recalculate scores if the parent week is already marked final
  if (game.week.isFinal) {
    await calculateWeeklyScores(game.weekId);
  }

  return NextResponse.json({ game: updated });
}
