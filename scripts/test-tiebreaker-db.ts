import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

test('selection is atomic, preserves guesses, announces once, and freezes at kickoff', async t => {
  assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/nflpicks_tiebreaker_policy_test');
  const prisma = new PrismaClient();
  try {
    assert.equal(await prisma.user.count(), 0);
    const Module = require('node:module');
    const original = Module._load;
    Module._load = function(name: string, ...args: unknown[]) {
      if (name === '@/lib/prisma') return { prisma };
      return original.call(this, name, ...args);
    };
    const { selectWeeklyTiebreaker } = require('../src/lib/tiebreaker-selection');
    Module._load = original;
    await prisma.user.create({ data: { id: 'tb-user', email: 'test@example.invalid', password: 'not-a-login' } });
    const season = await prisma.season.create({ data: { year: 2099, seasonType: 'REGULAR', isActive: true } });
    const week = await prisma.week.create({ data: { seasonId: season.id, weekNumber: 5, lockTime: new Date('2099-10-09T00:15Z') } });
    await prisma.game.createMany({ data: [
      { id: 'tb-early', weekId: week.id, homeTeam: 'BUF', awayTeam: 'NYJ', startTime: new Date('2099-10-09T00:15Z'), statusState: 'pre' },
      { id: 'tb-late', weekId: week.id, homeTeam: 'KC', awayTeam: 'DEN', startTime: new Date('2099-10-13T00:15Z'), statusState: 'pre' },
    ] });
    await prisma.week.update({ where: { id: week.id }, data: { tiebreakerGameId: 'tb-early' } });
    await prisma.tiebreaker.create({ data: { userId: 'tb-user', weekId: week.id, guessedTotal: 47 } });
    await Promise.all([selectWeeklyTiebreaker(week.id), selectWeeklyTiebreaker(week.id)]);
    assert.equal((await prisma.week.findUniqueOrThrow({ where: { id: week.id } })).tiebreakerGameId, 'tb-late');
    assert.equal(await prisma.auditLog.count({ where: { action: 'TIEBREAKER_LAST_GAME_SELECTED' } }), 1);
    assert.equal(await prisma.notification.count(), 1);
    assert.equal((await prisma.tiebreaker.findFirstOrThrow()).guessedTotal, 47);
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2099-10-13T00:15Z') });
    await prisma.game.update({ where: { id: 'tb-early' }, data: { startTime: new Date('2099-10-14T00:15Z') } });
    await selectWeeklyTiebreaker(week.id);
    assert.equal((await prisma.week.findUniqueOrThrow({ where: { id: week.id } })).tiebreakerGameId, 'tb-late');
    assert.equal(await prisma.notification.count(), 1);
  } finally { await prisma.$disconnect(); }
});
