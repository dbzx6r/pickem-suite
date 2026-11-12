import test from 'node:test';
import assert from 'node:assert/strict';
import { rankWeeklyEntries } from '../src/lib/ranking';
import { tiebreakerValidationError } from '../src/lib/pick-validation';
import { currentReminderWeek, dueReminderLead, gameLockReminderCopy, missingEntryItemsForGame, parseReminderMinutes } from '../src/lib/reminders';
import { isTiebreakerOpenForSubmission } from '../src/lib/pick-window';
import { POSTSEASON, PRESEASON, REGULAR_SEASON, espnSeasonType, seasonTypeFromEspn } from '../src/lib/season';
import { ballOnText, firstDownFieldPosition, shortDownDistance } from '../src/lib/gamecast';
import { parseSandboxSituation, sandboxDisplayStatus, sandboxPreset } from '../src/lib/sandbox-gamecast';
import { parseEspnLiveGameStats } from '../src/lib/live-game-stats';
import { normalizeEspnClock } from '../src/lib/espn-clock';

test('ESPN numeric clocks are stored as display-safe strings', () => {
  assert.equal(normalizeEspnClock(599, '9:59'), '9:59');
  assert.equal(normalizeEspnClock(49), '0:49');
  assert.equal(normalizeEspnClock(' 8:12 '), '8:12');
  assert.equal(normalizeEspnClock(null), null);
});

test('multiway ties receive unique deterministic ranks', () => {
  const input = ['a', 'b', 'c', 'd'].map((userId) => ({ userId, effectivePoints: 10, tbDiff: 3 }));
  const first = rankWeeklyEntries('week-1', input);
  const second = rankWeeklyEntries('week-1', [...input].reverse());
  assert.deepEqual(first.map((entry) => [entry.userId, entry.finalRank]), second.map((entry) => [entry.userId, entry.finalRank]));
  assert.deepEqual(new Set(first.map((entry) => entry.finalRank)), new Set([1, 2, 3, 4]));
  assert.ok(first.every((entry) => entry.tiebreakerUsed && entry.randomTiebroken));
});

test('missing tiebreakers sort behind submitted tiebreakers', () => {
  const ranked = rankWeeklyEntries('week-2', [
    { userId: 'missing', effectivePoints: 8, tbDiff: null },
    { userId: 'far', effectivePoints: 8, tbDiff: 12 },
    { userId: 'close', effectivePoints: 8, tbDiff: 2 },
  ]);
  assert.deepEqual(ranked.map((entry) => entry.userId), ['close', 'far', 'missing']);
});

test('tiebreaker values are bounded whole numbers', () => {
  assert.equal(tiebreakerValidationError(0), null);
  assert.equal(tiebreakerValidationError(200), null);
  assert.ok(tiebreakerValidationError(-1));
  assert.ok(tiebreakerValidationError(201));
  assert.ok(tiebreakerValidationError(47.5));
  assert.ok(tiebreakerValidationError('47'));
});

test('reminder lead parsing is bounded, unique, and cadence-aware', () => {
  assert.deepEqual(parseReminderMinutes('15,60,15,0,10081', 24), [60, 15]);
  assert.deepEqual(parseReminderMinutes('1440,15', 24), [1440, 60, 15]);
  const kickoff = new Date('2026-09-10T18:00:00Z');
  assert.equal(dueReminderLead(kickoff, new Date('2026-09-10T17:45:00Z'), [60, 15]), 15);
  assert.equal(dueReminderLead(kickoff, new Date('2026-09-10T17:01:00Z'), [60, 15]), 60);
  assert.equal(dueReminderLead(kickoff, new Date('2026-09-10T17:39:00Z'), [60, 15]), null);
});

test('reminders target only the earliest non-final week', () => {
  const weeks = [
    { id: 'future', weekNumber: 4, isFinal: false },
    { id: 'finished', weekNumber: 2, isFinal: true },
    { id: 'current', weekNumber: 3, isFinal: false },
  ];
  assert.equal(currentReminderWeek(weeks)?.id, 'current');
  assert.equal(currentReminderWeek(weeks.filter((week) => week.isFinal)), null);
});

test('a missing tiebreaker is reminded only for its assigned game', () => {
  assert.deepEqual(missingEntryItemsForGame({ gameId: 'tb', tiebreakerGameId: 'tb', hasPick: true, hasTiebreaker: false }), {
    missingPick: false,
    missingTiebreaker: true,
  });
  assert.deepEqual(missingEntryItemsForGame({ gameId: 'other', tiebreakerGameId: 'tb', hasPick: true, hasTiebreaker: false }), {
    missingPick: false,
    missingTiebreaker: false,
  });
  assert.match(gameLockReminderCopy({ awayTeam: 'ATL', homeTeam: 'IND', weekNumber: 3, lead: 60, missingPick: false, missingTiebreaker: true }).message, /locks when ATL at IND begins in about 1 hour/);
});

test('the tiebreaker locks exactly when its assigned game begins', () => {
  const kickoff = new Date('2026-09-10T18:00:00Z');
  assert.equal(isTiebreakerOpenForSubmission(kickoff, new Date('2026-09-10T17:59:59.999Z')), true);
  assert.equal(isTiebreakerOpenForSubmission(kickoff, kickoff), false);
  assert.equal(isTiebreakerOpenForSubmission(kickoff, new Date('2026-09-10T18:00:00.001Z')), false);
});

test('all NFL phases map to and from ESPN season types', () => {
  assert.equal(seasonTypeFromEspn(1), PRESEASON);
  assert.equal(seasonTypeFromEspn(2), REGULAR_SEASON);
  assert.equal(seasonTypeFromEspn(3), POSTSEASON);
  assert.equal(espnSeasonType(POSTSEASON), 3);
});

test('gamecast labels field position without inventing missing data', () => {
  assert.equal(ballOnText('LV 16', 84, 'KC', 'LV'), 'LV 16');
  assert.equal(ballOnText(null, 25, 'KC', 'LV'), 'KC 25');
  assert.equal(ballOnText(null, 75, 'KC', 'LV'), 'LV 25');
  assert.equal(ballOnText(null, null, 'KC', 'LV'), '—');
  assert.equal(shortDownDistance(null, '3rd & 21 at LV 16'), '3rd & 21');
});

test('gamecast first-down marker follows the possessing team toward the opposite end zone', () => {
  assert.equal(firstDownFieldPosition(25, 10, 'KC', 'KC', 'LV'), 35);
  assert.equal(firstDownFieldPosition(75, 10, 'LV', 'KC', 'LV'), 65);
  assert.equal(firstDownFieldPosition(95, 10, 'KC', 'KC', 'LV'), null);
  assert.equal(firstDownFieldPosition(25, 10, null, 'KC', 'LV'), null);
});

test('sandbox games automatically go live at kickoff while explicit controls still win', () => {
  const now = new Date('2026-09-10T18:00:00Z');
  assert.equal(sandboxDisplayStatus(null, new Date('2026-09-10T18:01:00Z'), false, now), 'pre');
  assert.equal(sandboxDisplayStatus(null, new Date('2026-09-10T17:59:00Z'), false, now), 'in');
  assert.equal(sandboxDisplayStatus('in', new Date('2026-09-10T18:01:00Z'), false, now), 'in');
  assert.equal(sandboxDisplayStatus(null, new Date('2026-09-10T17:59:00Z'), true, now), 'post');
});

test('sandbox Gamecast presets and saved situations provide stable field data', () => {
  const redZone = sandboxPreset('red-zone', 'KC', 'LV');
  assert.equal(redZone.yardLine, 84);
  assert.equal(redZone.possessionText, 'LV 16');
  assert.ok(redZone.teamStats.length >= 10);
  assert.ok(redZone.boxScore.some((category) => category.name === 'passing'));

  const parsed = parseSandboxSituation({
    yardLine: 140,
    distance: -3,
    clock: ' 8:12 ',
    driveSummary: '  6 plays, 54 yds  ',
  });
  assert.equal(parsed.yardLine, 100);
  assert.equal(parsed.distance, 0);
  assert.equal(parsed.driveSummary, '6 plays, 54 yds');
});

test('ESPN box scores normalize into aligned team and player comparisons', () => {
  const parsed = parseEspnLiveGameStats({
    teams: [
      { homeAway: 'away', team: { abbreviation: 'KC' }, statistics: [{ name: 'totalYards', label: 'Total Yards', displayValue: '318' }] },
      { homeAway: 'home', team: { abbreviation: 'LV' }, statistics: [{ name: 'totalYards', label: 'Total Yards', displayValue: '347' }] },
    ],
    players: [
      { team: { abbreviation: 'KC' }, statistics: [{ name: 'passing', labels: ['C/ATT', 'YDS'], athletes: [{ athlete: { displayName: 'Away QB' }, stats: ['18/27', '214'] }] }] },
      { team: { abbreviation: 'LV' }, statistics: [{ name: 'passing', labels: ['C/ATT', 'YDS'], athletes: [{ athlete: { displayName: 'Home QB' }, stats: ['21/30', '229'] }] }] },
    ],
  }, 'KC', 'LV');
  assert.deepEqual(parsed.teamStats.find((stat) => stat.name === 'totalYards'), {
    name: 'totalYards', label: 'Total Yards', away: '318', home: '347',
  });
  assert.equal(parsed.boxScore[0]?.label, 'Passing');
  assert.equal(parsed.boxScore[0]?.away[0]?.athlete, 'Away QB');
  assert.equal(parsed.boxScore[0]?.home[0]?.stats[1], '229');
});
