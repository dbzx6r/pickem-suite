import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/apiKeyAuth';
import { checkRateLimit } from '@/lib/rateLimit';
import { prisma } from '@/lib/prisma';
import { gamePickOpen, lockAndCheckGame, saveTiebreakerSafely } from '@/lib/game-lock';
import {
  getNextPersonalAutopickWeek,
  isPersonalAutopickUser,
} from '@/lib/personal-autopick';

type SubmittedPick = {
  gameId?: string;
  pickedTeam?: string;
};

function forbiddenAccount() {
  return NextResponse.json(
    { error: 'Personal autopicks are not enabled for this account' },
    { status: 403 },
  );
}

export async function GET(request: NextRequest) {
  const user = await authenticateApiKey(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isPersonalAutopickUser(user.id)) return forbiddenAccount();

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

  const isLocked = !(await Promise.all(activeWeek.games.map(game => gamePickOpen(game, now)))).some(Boolean);

  const [picks, tiebreaker] = await Promise.all([
    prisma.pick.findMany({
      where: { userId: user.id, weekId: activeWeek.id },
      select: { gameId: true, pickedTeam: true },
    }),
    prisma.tiebreaker.findUnique({
      where: { userId_weekId: { userId: user.id, weekId: activeWeek.id } },
      select: { guessedTotal: true },
    }),
  ]);

  return NextResponse.json({
    weekId: activeWeek.id,
    weekNumber: activeWeek.weekNumber,
    isLocked,
    picks: picks.map(p => ({
      gameId: p.gameId,
      pickedTeam: p.pickedTeam,
      isDoubleGame: p.gameId === activeWeek.doubleGameId,
    })),
    tiebreaker: tiebreaker ? { guessedTotal: tiebreaker.guessedTotal } : null,
  });
}

export async function POST(request: NextRequest) {
  const user = await authenticateApiKey(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isPersonalAutopickUser(user.id)) return forbiddenAccount();

  const rl = await checkRateLimit(`automation:${user.apiKey!}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const body = await request.json();
  const weekId = typeof body.weekId === 'string' ? body.weekId : '';
  const submittedPicks: SubmittedPick[] = Array.isArray(body.picks) ? body.picks : [];
  if (!weekId || submittedPicks.length === 0 || submittedPicks.length > 32) {
    return NextResponse.json({ error: 'weekId and 1–32 picks are required' }, { status: 400 });
  }

  const now = new Date();
  const activeWeek = await getNextPersonalAutopickWeek(now);
  if (!activeWeek || activeWeek.id !== weekId) {
    return NextResponse.json({ error: 'This week is not open for personal autopicks' }, { status: 403 });
  }

  const gamesById = new Map(activeWeek.games.map((game) => [game.id, game]));
  const skipped: Array<{ gameId: string; reason: string }> = [];
  let picksSubmitted = 0;

  for (const candidate of submittedPicks) {
    const gameId = candidate.gameId ?? '';
    const game = gamesById.get(gameId);
    if (!game) {
      skipped.push({ gameId, reason: 'Game does not belong to the open week' });
      continue;
    }
    if (!(await gamePickOpen(game))) {
      skipped.push({ gameId, reason: 'Game is locked' });
      continue;
    }
    if (candidate.pickedTeam !== game.homeTeam && candidate.pickedTeam !== game.awayTeam) {
      skipped.push({ gameId, reason: 'Invalid team' });
      continue;
    }

    const accepted = await prisma.$transaction(async (tx) => {
      if (!(await lockAndCheckGame(tx,gameId))) return false;
      const existing = await tx.pick.findUnique({ where: { userId_gameId: { userId: user.id, gameId } } });
      if (existing && existing.pickedTeam === candidate.pickedTeam && existing.isAutoPick) return true;
      const saved = await tx.pick.upsert({
        where: { userId_gameId: { userId: user.id, gameId } },
        update: { pickedTeam: candidate.pickedTeam!, isAutoPick: true, editCount: { increment: 1 } },
        create: { userId: user.id, weekId: activeWeek.id, gameId, pickedTeam: candidate.pickedTeam!, isAutoPick: true },
      });
      await tx.pickRevision.create({
        data: {
          pickId: saved.id,
          userId: user.id,
          weekId: activeWeek.id,
          gameId,
          previousTeam: existing?.pickedTeam ?? null,
          pickedTeam: candidate.pickedTeam!,
          source: 'automation',
        },
      });
      return true;
    });
    if (accepted) picksSubmitted += 1;
    else skipped.push({gameId,reason:'Game locked during submission; previous pick kept'});
  }

  let tiebreakerSubmitted = false;
  if (body.tiebreakerScore !== undefined) {
    const score = Number(body.tiebreakerScore);
    const tiebreakerGame = activeWeek.games.find(
      (game) => game.id === activeWeek.tiebreakerGameId,
    );
    if (
      Number.isInteger(score) &&
      score >= 0 &&
      score <= 200 &&
      tiebreakerGame &&
      await gamePickOpen(tiebreakerGame)
    ) {
      tiebreakerSubmitted = await saveTiebreakerSafely(user.id,activeWeek.id,tiebreakerGame.id,score);
    }
  }

  return NextResponse.json({
    success: skipped.length === 0,
    weekId: activeWeek.id,
    picksSubmitted,
    tiebreakerSubmitted,
    skipped,
  });
}
