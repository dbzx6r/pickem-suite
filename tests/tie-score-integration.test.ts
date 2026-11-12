import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankWeeklyEntries } from '../src/lib/ranking';

test('actual weekly scorer credits ties before week closes, preserves overrides and does not double-add', async () => {
  const tie = { id: 'tie', homeTeam: 'WSH', awayTeam: 'NYG', homeScore: 27, awayScore: 27, winnerTeam: null, isFinal: true };
  const future = { ...tie, id: 'future', isFinal: false, homeScore: null, awayScore: null };
  const picks = [
    { id: 'a', userId: 'a', pickedTeam: 'WSH', game: tie, pointsEarned: 0, isCorrect: null as boolean | null },
    { id: 'b', userId: 'b', pickedTeam: 'NYG', game: tie, pointsEarned: 0, isCorrect: null as boolean | null },
    { id: 'c', userId: 'c', pickedTeam: 'WSH', game: future, pointsEarned: 0, isCorrect: null as boolean | null },
  ];
  const scores = new Map<string, any>([['b', { userId: 'b', adminOverridePoints: 9, adminOverrideNote: 'preserve' }]]);
  const week = { id: 'w', isFinal: false, games: [tie, future], picks, tiebreakers: [], doubleGameId: 'tie', tiebreakerGameId: 'future' };
  const prisma = {
    week: { findUnique: async () => week },
    pick: { update: async ({ where, data }: any) => Object.assign(picks.find(p => p.id === where.id)!, data), findMany: async () => picks },
    tiebreaker: { findMany: async () => [] },
    weeklyScore: {
      findMany: async () => [...scores.values()],
      upsert: async ({ where, update, create }: any) => { const id = where.userId_weekId.userId; scores.set(id, { userId: id, ...(scores.has(id) ? update : create) }); },
    },
    tiebreakerAudit: { findFirst: async () => ({ id: 'existing' }) },
  };
  const Module = require('node:module'); const original = Module._load;
  Module._load = function(name: string, ...args: unknown[]) {
    if (name === '@/lib/prisma') return { prisma };
    if (name === '@/lib/achievements') return { checkAndAwardAchievements: async () => {} };
    if (name === '@/lib/ranking') return { rankWeeklyEntries };
    return original.call(this, name, ...args);
  };
  let calculateWeeklyScores: (id: string) => Promise<void>;
  try { ({ calculateWeeklyScores } = require('../src/lib/scoring')); } finally { Module._load = original; }
  for (let i = 0; i < 2; i++) {
    await calculateWeeklyScores('w');
    assert.equal(scores.get('a').points, 1);
    assert.equal(scores.get('b').points, 1);
    assert.equal(scores.get('b').adminOverridePoints, 9);
    assert.equal(scores.get('b').adminOverrideNote, 'preserve');
    assert.equal(scores.get('c').points, 0);
    assert.equal(week.isFinal, false);
    assert.equal(picks[2].isCorrect, null);
    assert.equal(scores.size, 3); // no entry/award invented for a nonparticipant
  }
});
