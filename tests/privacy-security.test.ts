import test from 'node:test';
import assert from 'node:assert/strict';
import { canViewPick, isGamePickRevealed, isWeekClosed } from '../src/lib/pick-privacy';
import { getOpenWeekIds, isGameOpenForPicks } from '../src/lib/pick-window';
import { passwordValidationError } from '../src/lib/security';
import { getLiveScoringDecision } from '../src/lib/live-scoring';

const now = new Date('2026-09-10T17:00:00Z');

test('owners can see their unrevealed picks but opponents cannot', () => {
  const kickoff = new Date('2026-09-10T18:00:00Z');
  assert.equal(canViewPick({ ownerId: 'a', viewerId: 'a', startTime: kickoff, now }), true);
  assert.equal(canViewPick({ ownerId: 'a', viewerId: 'b', startTime: kickoff, now }), false);
});

test('a pick is revealed at its individual kickoff', () => {
  assert.equal(isGamePickRevealed(new Date('2026-09-10T17:00:00Z'), now), true);
  assert.equal(isGamePickRevealed(new Date('2026-09-10T17:00:01Z'), now), false);
  assert.equal(isGameOpenForPicks(new Date('2026-09-10T17:00:00Z'), now), false);
});

test('league export week closes only after every game starts', () => {
  assert.equal(isWeekClosed([{ startTime: new Date('2026-09-10T16:00:00Z') }, { startTime: new Date('2026-09-10T18:00:00Z') }], now), false);
  assert.equal(isWeekClosed([{ startTime: new Date('2026-09-10T16:00:00Z') }, { startTime: new Date('2026-09-10T17:00:00Z') }], now), true);
});

test('commissioner-configured pick window limit is honored', () => {
  const weeks = [1, 2, 3].map((week) => ({ id: String(week), lockTime: new Date(`2026-09-${10 + week}T17:00:00Z`), isFinal: false, games: [{ startTime: new Date(`2026-09-${10 + week}T18:00:00Z`) }] }));
  assert.deepEqual([...getOpenWeekIds(weeks, now, 2)], ['1', '2']);
  assert.deepEqual([...getOpenWeekIds(weeks, now, 1)], ['1']);
});

test('strong passwords require length and character variety', () => {
  assert.ok(passwordValidationError('short'));
  assert.ok(passwordValidationError('alllowercase123'));
  assert.equal(passwordValidationError('LongSecurePhrase42'), null);
});

test('live scoring runs after any game finishes and finalizes only after all games finish', () => {
  assert.deepEqual(getLiveScoringDecision([{ isFinal: false }, { isFinal: false }]), {
    finalGameCount: 0,
    shouldCalculate: false,
    shouldFinalize: false,
  });
  assert.deepEqual(getLiveScoringDecision([{ isFinal: true }, { isFinal: false }]), {
    finalGameCount: 1,
    shouldCalculate: true,
    shouldFinalize: false,
  });
  assert.deepEqual(getLiveScoringDecision([{ isFinal: true }, { isFinal: true }]), {
    finalGameCount: 2,
    shouldCalculate: true,
    shouldFinalize: true,
  });
});
