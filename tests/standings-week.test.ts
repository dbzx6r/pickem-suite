import { test } from 'node:test';
import assert from 'node:assert/strict';
import { standingsWeek } from '../src/lib/standings-week';
const kickoff = new Date('2026-10-09T00:15:00Z');
const weeks = [
  { weekNumber: 4, games: [{ startTime: new Date('2026-10-02'), isFinal: true, statusState: 'post' }] },
  { weekNumber: 5, games: [{ startTime: kickoff, isFinal: false, statusState: 'pre' }] },
  { weekNumber: 6, games: [] },
];
test('standings stay on last week until exactly the first kickoff', () => {
  assert.equal(standingsWeek(weeks, new Date(+kickoff - 1)), 4);
  assert.equal(standingsWeek(weeks, kickoff), 5);
  assert.equal(standingsWeek(weeks, new Date(+kickoff + 1)), 5);
});
test('empty and preseason leagues have no started standings week', () => {
  assert.equal(standingsWeek([], kickoff), null);
  assert.equal(standingsWeek([weeks[1]], new Date(+kickoff - 1)), null);
});
test('live feed can establish kickoff; week order and empty future weeks do not matter', () => {
  const live = { ...weeks[1], games: [{ ...weeks[1].games[0], statusState: 'in' }] };
  assert.equal(standingsWeek([weeks[2], live, weeks[0]], new Date(+kickoff - 1)), 5);
});
