import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bonusSpread, oddsArePregame, recordedPregameOdds, retainAvailableOdds } from '../src/lib/pregame-odds';
const start = new Date('2026-10-02T00:15Z');
test('use last snapshot strictly before kickoff, never live/postgame odds', () => {
  const snapshot = (capturedAt: string, spreadLine: string) => ({ capturedAt, spreadLine, overUnder: 44.5, provider: 'ESPN' });
  const odds = recordedPregameOdds(start, [snapshot('2026-10-02T01:00Z', 'BUF -20'), snapshot('2026-10-01T23:55Z', 'BUF -2'), snapshot('2026-09-30T10:00Z', 'BUF -3'), snapshot(start.toISOString(), 'BUF -10')]);
  assert.equal(odds.spreadLine, 'BUF -2');
  assert.equal(odds.oddsCapturedAt, '2026-10-01T23:55Z');
});
test('missing historical evidence stays unavailable rather than invented', () => {
  assert.equal(recordedPregameOdds(start, []).spreadLine, null);
  assert.equal(recordedPregameOdds(start, [{ capturedAt: start, spreadLine: 'BUF -1', overUnder: null, provider: null }]).spreadLine, null);
});
test('missing pregame feed fields do not erase saved odds, including zero total', () => {
  assert.deepEqual(retainAvailableOdds({ spreadLine: null, overUnder: 0, oddsProvider: null }, { spreadLine: 'PK', overUnder: 44, oddsProvider: 'Book' }), { spreadLine: 'PK', overUnder: 0, oddsProvider: 'Book' });
});
test('freeze at kickoff or live/final status even with a future scheduled time', () => {
  const game = { startTime: start, statusState: 'pre', isFinal: false };
  assert.equal(oddsArePregame(game, new Date(start.getTime() - 1)), true);
  assert.equal(oddsArePregame(game, start), false);
  assert.equal(oddsArePregame({ ...game, statusState: 'in' }, new Date(start.getTime() - 1)), false);
  assert.equal(oddsArePregame({ ...game, isFinal: true }, new Date(start.getTime() - 1)), false);
});
test('Tuesday selection spread belongs only to its selected game', () => {
  assert.equal(bonusSpread({ gameId: 'a', spreadLine: 'BUF -1' }, 'a'), 'BUF -1');
  assert.equal(bonusSpread({ gameId: 'a', spreadLine: 'BUF -1' }, 'b'), null);
  assert.equal(bonusSpread(null, 'a'), null);
});
