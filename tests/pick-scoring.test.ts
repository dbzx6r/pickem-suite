import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeFinalPick, projectedPickPoints } from '../src/lib/pick-scoring';
const tie = { id: 'tie', homeTeam: 'WSH', awayTeam: 'NYG', homeScore: 27, awayScore: 27, isFinal: true, winnerTeam: null };
test('both submitted teams receive exactly one point on a final tie, including bonus games', () => {
  for (const team of ['WSH', 'NYG']) for (const bonus of [null, 'tie']) {
    assert.deepEqual(gradeFinalPick(tie, team, bonus), { isCorrect: true, pointsEarned: 1 });
    assert.equal(projectedPickPoints(tie, team, bonus), 1);
  }
});
test('no point for no pick or another team; live ties and missing scores are not final ties', () => {
  for (const team of ['', 'SEA']) assert.deepEqual(gradeFinalPick(tie, team, null), { isCorrect: false, pointsEarned: 0 });
  assert.equal(gradeFinalPick({ ...tie, isFinal: false }, 'WSH', null), null);
  assert.equal(projectedPickPoints({ ...tie, isFinal: false }, 'WSH', null), 0);
  assert.equal(gradeFinalPick({ ...tie, homeScore: null, awayScore: null }, 'WSH', null), null);
  assert.equal(gradeFinalPick({ ...tie, homeScore: 0, awayScore: 0 }, 'WSH', null)?.pointsEarned, 1);
});
test('decisive wins keep normal and double points; regrading is idempotent', () => {
  const win = { ...tie, homeScore: 30, winnerTeam: 'WSH' };
  assert.equal(gradeFinalPick(win, 'WSH', null)?.pointsEarned, 1);
  assert.equal(gradeFinalPick(win, 'WSH', 'tie')?.pointsEarned, 2);
  assert.equal(gradeFinalPick(win, 'NYG', 'tie')?.pointsEarned, 0);
  assert.deepEqual(gradeFinalPick(tie, 'NYG', 'tie'), gradeFinalPick(tie, 'NYG', 'tie'));
});
