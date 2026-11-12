import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { parseSandboxSituation, sandboxPreset } from '@/lib/sandbox-gamecast';
import { Prisma } from '@prisma/client';

async function requireAdmin() {
  const session = await auth();
  return session?.user && (session.user as { role?: string }).role === 'ADMIN';
}

function score(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? 0), 10);
  return Number.isFinite(parsed) ? Math.min(200, Math.max(0, parsed)) : 0;
}

function optionalScore(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  return score(value);
}

export async function POST(request: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { weekId, homeTeam, awayTeam, startTime, isDoubleGame, isTiebreakerGame } = await request.json();
  const week = await prisma.week.findUnique({ where: { id: weekId }, include: { season: true } });
  if (!week?.season.isSandbox) return NextResponse.json({ error: 'Sandbox week not found' }, { status: 404 });
  if (!homeTeam || !awayTeam || homeTeam === awayTeam) {
    return NextResponse.json({ error: 'Choose two different teams' }, { status: 400 });
  }
  const kickoff = new Date(startTime);
  if (Number.isNaN(kickoff.getTime())) return NextResponse.json({ error: 'Invalid start time' }, { status: 400 });

  const situation = sandboxPreset('normal', awayTeam, homeTeam);
  const game = await prisma.game.create({
    data: {
      weekId,
      homeTeam,
      awayTeam,
      startTime: kickoff,
      statusState: 'pre',
      possession: awayTeam,
      downDistance: `${situation.shortDownDistance} at ${situation.possessionText}`,
      sandboxSituation: situation as unknown as Prisma.InputJsonValue,
    },
  });

  if (isDoubleGame || isTiebreakerGame) {
    await prisma.week.update({
      where: { id: weekId },
      data: {
        ...(isDoubleGame && { doubleGameId: game.id }),
        ...(isTiebreakerGame && { tiebreakerGameId: game.id }),
      },
    });
  }

  return NextResponse.json({ game });
}

export async function PATCH(request: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const game = await prisma.game.findUnique({
    where: { id: body.gameId },
    include: { week: { include: { season: true } } },
  });
  if (!game?.week.season.isSandbox) return NextResponse.json({ error: 'Sandbox game not found' }, { status: 404 });

  if (body.simulation) {
    const simulation = body.simulation as Record<string, unknown>;
    const statusState = ['pre', 'in', 'post'].includes(String(simulation.statusState))
      ? String(simulation.statusState)
      : 'in';
    const homeScore = score(simulation.homeScore);
    const awayScore = score(simulation.awayScore);
    const isFinal = statusState === 'post';
    const winnerTeam = isFinal
      ? homeScore > awayScore
        ? game.homeTeam
        : awayScore > homeScore
          ? game.awayTeam
          : null
      : null;
    const possession = simulation.possession === game.homeTeam || simulation.possession === game.awayTeam
      ? String(simulation.possession)
      : null;
    const periodValue = optionalScore(simulation.period);
    const period = periodValue === null ? null : Math.min(5, Math.max(1, periodValue));
    const clock = typeof simulation.clock === 'string' && /^\d{1,2}:\d{2}$/.test(simulation.clock.trim())
      ? simulation.clock.trim()
      : null;
    const downDistance = typeof simulation.downDistance === 'string'
      ? simulation.downDistance.trim().slice(0, 100) || null
      : null;
    const situation = parseSandboxSituation(simulation.situation);

    const updated = await prisma.game.update({
      where: { id: game.id },
      data: {
        statusState,
        isFinal,
        winnerTeam,
        homeScore,
        awayScore,
        homeScoreQ1: optionalScore(simulation.homeScoreQ1),
        homeScoreQ2: optionalScore(simulation.homeScoreQ2),
        homeScoreQ3: optionalScore(simulation.homeScoreQ3),
        homeScoreQ4: optionalScore(simulation.homeScoreQ4),
        awayScoreQ1: optionalScore(simulation.awayScoreQ1),
        awayScoreQ2: optionalScore(simulation.awayScoreQ2),
        awayScoreQ3: optionalScore(simulation.awayScoreQ3),
        awayScoreQ4: optionalScore(simulation.awayScoreQ4),
        period,
        clock,
        possession,
        downDistance,
        sandboxSituation: situation as unknown as Prisma.InputJsonValue,
      },
    });
    return NextResponse.json({ game: updated });
  }

  const homeScore = score(body.homeScore);
  const awayScore = score(body.awayScore);
  const winnerTeam = body.markFinal
    ? homeScore > awayScore
      ? game.homeTeam
      : awayScore > homeScore
        ? game.awayTeam
        : null
    : null;
  const updated = await prisma.game.update({
    where: { id: game.id },
    data: {
      homeScore,
      awayScore,
      ...(body.markFinal && { isFinal: true, winnerTeam, statusState: 'post' }),
    },
  });
  return NextResponse.json({ game: updated });
}

export async function DELETE(request: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { gameId } = await request.json();
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: { week: { include: { season: true } } },
  });
  if (!game?.week.season.isSandbox) return NextResponse.json({ error: 'Sandbox game not found' }, { status: 404 });

  await prisma.$transaction([
    prisma.pick.deleteMany({ where: { gameId } }),
    prisma.game.delete({ where: { id: gameId } }),
  ]);
  return NextResponse.json({ ok: true });
}
