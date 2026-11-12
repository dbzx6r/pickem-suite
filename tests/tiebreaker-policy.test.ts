import test from 'node:test';
import assert from 'node:assert/strict';
import { lastTiebreakerGame } from '../src/lib/tiebreaker-policy';
const now = new Date('2026-10-02T19:00:00Z');
const g = (id: string, date: string) => ({ id, startTime: new Date(date), isFinal: false, statusState: 'pre' });
const early = g('early', '2026-10-09T00:15Z');
const late = g('late', '2026-10-13T00:15Z');
test('last kickoff wins regardless of array order and earlier existing choice', () => {
  assert.equal(lastTiebreakerGame([late,early], 'early', false, now)?.id, 'late');
  assert.equal(lastTiebreakerGame([early,late], null, false, now)?.id, 'late');
});
test('finished weeks and started tiebreakers are never reassigned', () => {
  assert.equal(lastTiebreakerGame([early,late], 'early', true, now)?.id, 'early');
  for (const current of [{ ...early, isFinal: true }, { ...early, statusState: 'in' }, { ...early, startTime: now }]) {
    assert.equal(lastTiebreakerGame([current,late], 'early', false, now)?.id, 'early');
  }
});
test('equal kickoffs are stable and prefer existing selection', () => {
  const other = { ...late, id: 'a' };
  assert.equal(lastTiebreakerGame([other,late], 'late', false, now)?.id, 'late');
  assert.equal(lastTiebreakerGame([late,other], null, false, now)?.id, 'a');
});
test('canceled and postponed games cannot become new tiebreakers', () => {
  for (const statusState of ['canceled', 'postponed', 'suspended']) {
    assert.equal(lastTiebreakerGame([early, { ...late, statusState }], null, false, now)?.id, 'early');
  }
});
test('future schedule changes are followed, empty and past slates are safe', () => {
  assert.equal(lastTiebreakerGame([early,{ ...late,startTime: new Date('2026-10-08T00:15Z') }], 'late', false, now)?.id, 'early');
  assert.equal(lastTiebreakerGame([], null, false, now), null);
  assert.equal(lastTiebreakerGame([g('past','2026-10-01T00:15Z')], null, false, now), null);
});
