import assert from 'node:assert/strict';
import {
  getOpenWeekIds,
  isGameOpenForPicks,
  isWeekOpenForPicks,
} from '../src/lib/pick-window';

const now = new Date('2026-08-07T15:00:00Z');
const weeks = [
  { id: 'week-1', lockTime: new Date('2026-08-07T00:00:00Z'), isFinal: true, games: [{ startTime: new Date('2026-08-07T00:00:00Z') }] },
  {
    id: 'week-2',
    lockTime: new Date('2026-08-13T23:00:00Z'),
    isFinal: false,
    games: [
      { startTime: new Date('2026-08-13T23:00:00Z') },
      { startTime: new Date('2026-08-18T00:00:00Z') },
    ],
  },
  { id: 'week-3', lockTime: new Date('2026-08-21T00:00:00Z'), isFinal: false, games: [{ startTime: new Date('2026-08-25T00:00:00Z') }] },
  { id: 'week-4', lockTime: new Date('2026-08-27T23:00:00Z'), isFinal: false, games: [{ startTime: new Date('2026-09-01T00:00:00Z') }] },
];

assert.deepEqual([...getOpenWeekIds(weeks, now)], ['week-2', 'week-3']);
assert.equal(isWeekOpenForPicks('week-4', weeks, now), false);

const afterWeek2Kickoff = new Date('2026-08-13T23:00:01Z');
assert.deepEqual([...getOpenWeekIds(weeks, afterWeek2Kickoff)], ['week-2', 'week-3']);
assert.equal(isWeekOpenForPicks('week-2', weeks, afterWeek2Kickoff), true);

const afterWeek2LastKickoff = new Date('2026-08-18T00:00:01Z');
assert.deepEqual([...getOpenWeekIds(weeks, afterWeek2LastKickoff)], ['week-3', 'week-4']);
assert.equal(isWeekOpenForPicks('week-2', weeks, afterWeek2LastKickoff), false);

const unordered = [weeks[3], weeks[1], weeks[2]];
assert.deepEqual([...getOpenWeekIds(unordered, now)], ['week-2', 'week-3']);

const prematurelyFinal = [
  { ...weeks[1], isFinal: true },
  ...weeks.slice(2),
];
assert.deepEqual([...getOpenWeekIds(prematurelyFinal, now)], ['week-3', 'week-4']);

const afterFridayKickoff = new Date('2026-09-11T01:00:00Z');
assert.equal(isGameOpenForPicks(new Date('2026-09-11T00:20:00Z'), afterFridayKickoff), false);
assert.equal(isGameOpenForPicks(new Date('2026-09-13T17:00:00Z'), afterFridayKickoff), true);
assert.equal(isGameOpenForPicks(afterFridayKickoff, afterFridayKickoff), false);

console.log('pick-window tests passed');
