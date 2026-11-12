// Run only against an EMPTY disposable schema copy, never the league database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

test('real PostgreSQL concurrent selection is atomic, frozen and deduplicated', async t => {
  assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/nflpicks_double_policy_test');
  const prisma = new PrismaClient();
  try {
    assert.equal(await prisma.user.count(), 0);
    const Module = require('node:module');
    const original = Module._load;
    Module._load = function(name: string, ...args: any[]) {
      if (name === '@/lib/prisma') return { prisma };
      return original.call(this, name, ...args);
    };
    const { selectWeeklyDoubleGame } = require('../src/lib/double-points');
    Module._load = original;
    await prisma.user.createMany({ data: [
      { id: 'test-u1', email: 'one@example.invalid', password: 'not-a-login' },
      { id: 'test-u2', email: 'two@example.invalid', password: 'not-a-login' },
    ] });
    const season = await prisma.season.create({ data: { year: 2099, seasonType: 'REGULAR', isSandbox: false, isActive: true } });
    const week = await prisma.week.create({ data: { seasonId: season.id, weekNumber: 5, lockTime: new Date('2026-10-09T00:15Z') } });
    await prisma.game.createMany({ data: [
      { id: 'test-g1', weekId: week.id, espnGameId: 'e1', homeTeam: 'BUF', awayTeam: 'NYJ', startTime: new Date('2026-10-09T00:15Z'), statusState: 'pre', spreadLine: 'BUF -14' },
      { id: 'test-g2', weekId: week.id, espnGameId: 'e2', homeTeam: 'KC', awayTeam: 'DEN', startTime: new Date('2026-10-11T17:00Z'), statusState: 'pre', spreadLine: 'KC -1' },
    ] });
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-06T16:00Z') });
    const odds = new Map([['e1', 'BUF -14'], ['e2', 'KC -1']]);
    await Promise.all([selectWeeklyDoubleGame(week.id, odds), selectWeeklyDoubleGame(week.id, odds)]);
    assert.equal((await prisma.week.findUniqueOrThrow({ where: { id: week.id } })).doubleGameId, 'test-g2');
    assert.equal(await prisma.auditLog.count({ where: { action: 'DOUBLE_POINTS_LOCKED' } }), 1);
    assert.equal(await prisma.notification.count(), 2);
    await selectWeeklyDoubleGame(week.id, new Map([['e1', 'PK'], ['e2', 'KC -7']]));
    assert.equal((await prisma.week.findUniqueOrThrow({ where: { id: week.id } })).doubleGameId, 'test-g2');
    assert.equal(await prisma.notification.count(), 2);
  } finally {
    await prisma.$disconnect();
  }
});
