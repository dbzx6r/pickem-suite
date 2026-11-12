import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isSandboxModeFromCookieHeader } from '@/lib/sandboxContext';
import { checkAndAwardAchievements } from '@/lib/achievements';
import { isWeekOpenForPicks } from '@/lib/pick-window';
import { tiebreakerValidationError } from '@/lib/pick-validation';
import { gamePickOpen, lockAndCheckGame, saveTiebreakerSafely } from '@/lib/game-lock';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const isSandbox = isSandboxModeFromCookieHeader(request.headers.get('cookie'));
    if (session.user.role === 'ADMIN' && !isSandbox) {
      return NextResponse.json({ error: 'Commissioners do not make picks' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const weekId = searchParams.get('weekId');

    if (weekId) {
      const requestedWeek = await prisma.week.findUnique({ where: { id: weekId }, include: { season: true } });
      if (!requestedWeek || requestedWeek.season.isSandbox !== isSandbox) {
        return NextResponse.json({ error: 'Week is not available in this mode' }, { status: 403 });
      }
    }

    const query = weekId
      ? { userId: session.user.id as string, weekId }
      : {
          userId: session.user.id as string,
          ...(isSandbox && { week: { season: { isSandbox: true } } }),
        };

    const picks = await prisma.pick.findMany({
      where: query,
      include: { game: true, week: true },
    });

    const tiebreaker = weekId
      ? await prisma.tiebreaker.findUnique({
          where: { userId_weekId: { userId: session.user.id as string, weekId } },
        })
      : null;

    const receipt = weekId
      ? {
          weekId,
          savedPicks: picks.length,
          lastSavedAt: [
            ...picks.map((pick) => pick.updatedAt),
            ...(tiebreaker?.updatedAt ? [tiebreaker.updatedAt] : []),
          ].sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
          revisionCount: await prisma.pickRevision.count({
            where: { userId: session.user.id as string, weekId },
          }),
        }
      : null;

    return NextResponse.json({ picks, tiebreaker, receipt });
  } catch (error) {
    console.error('Picks GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch picks' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const isSandbox = isSandboxModeFromCookieHeader(request.headers.get('cookie'));
    if (session.user.role === 'ADMIN' && !isSandbox) {
      return NextResponse.json({ error: 'Commissioners do not make picks' }, { status: 403 });
    }

    const { gameId, pickedTeam, weekId, tiebreakerTotal } = await request.json();

    // Validate the requested week and its phase before accepting any pick data.
    const week = await prisma.week.findUnique({
      where: { id: weekId },
      include: { season: true },
    });
    if (!week) return NextResponse.json({ error: 'Week not found' }, { status: 404 });

    // If sandbox mode, ensure the week belongs to a sandbox season
    if (isSandbox) {
      if (!week.season.isSandbox) {
        return NextResponse.json({ error: 'Cannot submit picks to live season in sandbox mode' }, { status: 403 });
      }
    } else {
      if (week.season.isSandbox) {
        return NextResponse.json({ error: 'Cannot submit picks to sandbox season in live mode' }, { status: 403 });
      }
      if (!week.season.isActive) {
        return NextResponse.json({ error: 'This season phase is not active' }, { status: 403 });
      }
    }

    const now = new Date();
    if (!isSandbox) {
      const seasonWeeks = await prisma.week.findMany({
        where: { seasonId: week.seasonId },
        select: {
          id: true,
          lockTime: true,
          isFinal: true,
          games: { select: { startTime: true } },
        },
      });
      const settings = await prisma.leagueSettings.findUnique({ where: { id: 'default' }, select: { pickWindowWeeks: true } });
      if (!isWeekOpenForPicks(week.id, seasonWeeks, now, settings?.pickWindowWeeks ?? 2)) {
        return NextResponse.json(
          { error: 'This week is not in the two-week pick window yet' },
          { status: 403 },
        );
      }
    }

    const userId = session.user.id as string;

    // Handle tiebreaker
    if (tiebreakerTotal !== undefined) {
      const validationError = tiebreakerValidationError(tiebreakerTotal);
      if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
      if (!week.tiebreakerGameId) {
        return NextResponse.json({ error: 'Tiebreaker game not found' }, { status: 404 });
      }
      const tiebreakerGame = await prisma.game.findUnique({
        where: { id: week.tiebreakerGameId },
        select: { id: true, startTime: true, statusState: true, isFinal: true },
      });
      if (!tiebreakerGame) {
        return NextResponse.json({ error: 'Tiebreaker game not found' }, { status: 404 });
      }
      if (!(await gamePickOpen(tiebreakerGame, now))) {
        return NextResponse.json({ error: 'The tiebreaker is locked' }, { status: 403 });
      }
      if (!(await saveTiebreakerSafely(userId,weekId,week.tiebreakerGameId,tiebreakerTotal))) return NextResponse.json({error:'Tiebreaker locked or matchup changed. Refresh before trying again.'},{status:409});
      return NextResponse.json({ success: true, type: 'tiebreaker', savedAt: new Date().toISOString() });
    }

    // Handle game pick
    if (!gameId || !pickedTeam) {
      return NextResponse.json({ error: 'gameId and pickedTeam required' }, { status: 400 });
    }

    const game = await prisma.game.findUnique({ where: { id: gameId } });
    if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    if (game.weekId !== weekId) {
      return NextResponse.json({ error: 'Game does not belong to this week' }, { status: 400 });
    }
    if (!(await gamePickOpen(game, now))) {
      return NextResponse.json({ error: 'This game is locked' }, { status: 403 });
    }

    if (game.homeTeam !== pickedTeam && game.awayTeam !== pickedTeam) {
      return NextResponse.json({ error: 'Invalid team' }, { status: 400 });
    }

    const pick = await prisma.$transaction(async (tx) => {
      if (!(await lockAndCheckGame(tx,gameId))) return null;
      const existing = await tx.pick.findUnique({
        where: { userId_gameId: { userId, gameId } },
      });
      if (existing && existing.pickedTeam === pickedTeam && !existing.isAutoPick) return existing;

      const saved = existing
        ? await tx.pick.update({
            where: { id: existing.id },
            data: { pickedTeam, isAutoPick: false, editCount: { increment: 1 } },
          })
        : await tx.pick.create({
            data: { userId, weekId, gameId, pickedTeam, isAutoPick: false, editCount: 0 },
          });

      await tx.pickRevision.create({
        data: {
          pickId: saved.id,
          userId,
          weekId,
          gameId,
          previousTeam: existing?.pickedTeam ?? null,
          pickedTeam,
          source: 'web',
        },
      });
      return saved;
    });

    if (!pick) return NextResponse.json({error:'This game is now locked. Your previous pick was kept.'},{status:403});
    // Fire and forget — don't await to avoid slowing down the pick save
    if (!isSandbox) checkAndAwardAchievements(userId, prisma, weekId).catch(console.error);

    return NextResponse.json({ pick, savedAt: pick.updatedAt.toISOString() });
  } catch (error) {
    console.error('Picks POST error:', error);
    return NextResponse.json({ error: 'Failed to save pick' }, { status: 500 });
  }
}
