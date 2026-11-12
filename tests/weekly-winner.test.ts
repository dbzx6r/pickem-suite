import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectLatestWeeklyWinner } from '../src/lib/weekly-winner';

function week(weekNumber: number, isFinal = true) {
  return {
    id: `week-${weekNumber}`, weekNumber, isFinal,
    games: [{ isFinal: true }, { isFinal: true }],
    weeklyScores: [{
      userId: `winner-${weekNumber}`, finalRank: 1, points: 12,
      adminOverridePoints: null as number | null,
      user: { profile: { displayName: `Player ${weekNumber}` } },
    }],
  };
}

test('no champion before any week is fully finalized', () => {
  assert.equal(selectLatestWeeklyWinner([]), null);
  assert.equal(selectLatestWeeklyWinner([week(1, false)]), null);
});
test('retain previous winner while next week is in progress, regardless of provisional rank', () => {
  const upcoming = week(3, false);
  upcoming.games[1].isFinal = false;
  assert.equal(selectLatestWeeklyWinner([upcoming, week(1), week(2)])?.userId, 'winner-2');
});
test('transfer crown only after next week finishes and scoring marks it final', () => {
  assert.equal(selectLatestWeeklyWinner([week(2, false), week(1)])?.weekNumber, 1);
  assert.equal(selectLatestWeeklyWinner([week(1), week(2)])?.weekNumber, 2);
});
test('empty schedules and incorrectly finalized weeks cannot earn a crown', () => {
  const empty = week(3);
  empty.games = [];
  const unfinished = week(2);
  unfinished.games[0].isFinal = false;
  assert.equal(selectLatestWeeklyWinner([empty, unfinished, week(1)])?.weekNumber, 1);
});
test('respect persisted tiebreaker rank and effective override points', () => {
  const complete = week(1);
  complete.weeklyScores[0].adminOverridePoints = 0;
  complete.weeklyScores.unshift({ ...complete.weeklyScores[0], userId: 'runner-up', finalRank: 2 });
  const winner = selectLatestWeeklyWinner([complete]);
  assert.equal(winner?.userId, 'winner-1');
  assert.equal(winner?.points, 0);
  assert.deepEqual(Object.keys(winner!).sort(), ['displayName', 'points', 'userId', 'weekId', 'weekNumber']);
});
test('do not label an older winner as latest if latest completed week has no final ranking', () => {
  const complete = week(2);
  complete.weeklyScores = [];
  assert.equal(selectLatestWeeklyWinner([week(1), complete]), null);
});
