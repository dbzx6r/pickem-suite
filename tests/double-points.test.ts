import { test } from 'node:test';
import assert from 'node:assert/strict';
import { absoluteSpread, closestSpreadGame, doublePointsDeadline } from '../src/lib/double-points-policy';

test('spread distance ignores favorite/sign and recognizes pick-em', () => {
  for (const [line, value] of [['BUF -2.5', 2.5], ['+1.5 NYJ', 1.5], ['-3', 3], ['PK', 0], ["PICK'EM", 0], ['EVEN', 0], ['KC −1', 1]] as const) {
    assert.equal(absoluteSpread(line), value);
  }
  for (const line of [null, '', 'OFF', 'TBD', 'O/U 45.5', 'BUF -110', 'BUF -3 total 40']) assert.equal(absoluteSpread(line), null);
});

test('Tuesday 9 AM Pacific follows DST, not the host timezone', () => {
  assert.equal(doublePointsDeadline(new Date('2026-10-08T00:00Z')).toISOString(), '2026-10-06T16:00:00.000Z');
  assert.equal(doublePointsDeadline(new Date('2026-11-05T00:00Z')).toISOString(), '2026-11-03T17:00:00.000Z');
  assert.equal(doublePointsDeadline(new Date('2026-09-14T23:00Z')).toISOString(), '2026-09-08T16:00:00.000Z');
});

test('Tuesday early kickoff uses preceding Tuesday so selection precedes play', () => {
  assert.equal(doublePointsDeadline(new Date('2026-10-06T15:00Z')).toISOString(), '2026-09-29T16:00:00.000Z');
});

const game = (id: string, spreadLine: string | null, start = '2026-10-08T23:00Z') => ({ id, spreadLine, startTime: new Date(start), isFinal: false, statusState: 'pre' });
test('closest game wins, not largest favorite; ties deterministic', () => {
  const now = new Date('2026-10-06T16:00Z');
  assert.equal(closestSpreadGame([game('big', 'BUF -14'), game('close', 'KC -1')], now)?.id, 'close');
  assert.equal(closestSpreadGame([game('big', 'BUF -1'), game('pick', 'PK')], now)?.id, 'pick');
  assert.equal(closestSpreadGame([game('later', 'BUF -1', '2026-10-11T17:00Z'), game('early', 'KC +1')], now)?.id, 'early');
  assert.equal(closestSpreadGame([game('b', 'BUF -1'), game('a', 'KC -1')], now)?.id, 'a');
});
test('no random fallback; started, final and unknown-status games excluded', () => {
  const now = new Date('2026-10-06T16:00Z');
  assert.equal(closestSpreadGame([game('none', null), { ...game('live', 'PK'), statusState: 'in' }, { ...game('final', 'PK'), isFinal: true }, game('old', 'PK', now.toISOString()), { ...game('unknown', 'PK'), statusState: null }], now), null);
});

// Exercise the production transaction orchestration with a scoped DB adapter.
// No test credentials or real participant writes.
test('selection lifecycle: pending, lock, frozen odds, duplicate sync, missing odds, legacy and sandbox', async t => {
  const Module = require('node:module');
  const original = Module._load;
  let week: any;
  let audit: any = null;
  let notifications: any[] = [];
  const tx: any = {
    $executeRaw: async () => 1,
    week: { findUnique: async () => week, update: async ({ data }: any) => Object.assign(week, data) },
    auditLog: { findUnique: async () => audit, create: async ({ data }: any) => { audit = data; } },
    user: { findMany: async () => [{ id: 'user1' }, { id: 'user2' }] },
    notification: { createMany: async ({ data }: any) => { notifications.push(...data); } },
  };
  Module._load = function (name: string, ...args: any[]) {
    if (name === '@/lib/prisma') return { prisma: { $transaction: async (fn: any) => fn(tx) } };
    return original.call(this, name, ...args);
  };
  const { selectWeeklyDoubleGame } = require('../src/lib/double-points');
  Module._load = original;
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-06T15:59:00Z') });
  const reset = () => {
    audit = null; notifications = [];
    week = { id: 'w5', weekNumber: 5, isFinal: false, doubleGameId: 'old-random', season: { isSandbox: false, isActive: true },
      games: [ { ...game('big', 'BUF -14'), espnGameId: 'e1', homeTeam: 'BUF', awayTeam: 'NYJ', oddsProvider: 'ESPN' },
        { ...game('close', 'KC -1'), espnGameId: 'e2', homeTeam: 'KC', awayTeam: 'DEN', oddsProvider: 'ESPN' } ] };
  };
  reset();
  await selectWeeklyDoubleGame('w5');
  assert.equal(week.doubleGameId, null);
  assert.equal(audit, null);
  t.mock.timers.setTime(new Date('2026-10-06T16:00:00Z').getTime());
  await selectWeeklyDoubleGame('w5'); // Must not use cached DB lines.
  assert.equal(week.doubleGameId, null);
  await selectWeeklyDoubleGame('w5', new Map([['e1', 'BUF -14'], ['e2', 'KC -1']]));
  assert.equal(week.doubleGameId, 'close');
  assert.equal((audit as any).details.absoluteSpread, 1);
  assert.equal(notifications.length, 2);
  await selectWeeklyDoubleGame('w5', new Map([['e1', 'PK'], ['e2', 'KC -10']]));
  assert.equal(week.doubleGameId, 'close');
  assert.equal(notifications.length, 2);
  reset(); week.doubleGameId = null;
  await selectWeeklyDoubleGame('w5', new Map());
  assert.equal(audit, null);
  reset(); week.games[0].statusState = 'in';
  await selectWeeklyDoubleGame('w5', new Map([['e2', 'PK']]));
  assert.equal(audit, null);
  reset(); week.season.isSandbox = true;
  await selectWeeklyDoubleGame('w5', new Map([['e2', 'PK']]));
  assert.equal(week.doubleGameId, 'old-random');
  reset(); week.season.isActive = false;
  await selectWeeklyDoubleGame('w5', new Map([['e2', 'PK']]));
  assert.equal(audit, null);
  reset(); week.games.forEach((g: any) => g.startTime = new Date('2026-10-01T23:00Z'));
  await selectWeeklyDoubleGame('w5', new Map([['e2', 'PK']]));
  assert.equal(week.doubleGameId, 'old-random');
  assert.equal(audit, null);
});
