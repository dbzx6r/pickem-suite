import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activityPayload, validActivityRegistration, invalidAPNsToken } from '../src/lib/live-activity-payload';
const game = { isFinal: false, statusState: 'in', homeScore: 7, awayScore: 13, period: 2, clock: '2:20', possession: 'LAR', downDistance: '3rd & 15 at BUF 49' };
test('ActivityKit update uses epoch seconds, exact wire keys and stale deadline', () => {
  const { aps } = activityPayload(game, 1800000000000);
  assert.equal(aps.timestamp, 1800000000); assert.equal(aps.event, 'update'); assert.ok('stale-date' in aps); assert.equal(aps['stale-date'], 1800000360);
  assert.deepEqual(aps['content-state'], { homeScore: 7, awayScore: 13, status: 'LIVE', period: 'Q2', clock: '2:20', possession: 'LAR', downDistance: '3rd & 15 at BUF 49', updatedAt: 1800000000 });
  assert.ok(Buffer.byteLength(JSON.stringify({ aps })) < 4096);
});
test('final remains briefly visible; suspended/unavailable games end immediately', () => {
  const final = activityPayload({ ...game, isFinal: true }, 1800000000000).aps;
  assert.equal(final.event, 'end'); assert.ok('dismissal-date' in final); assert.equal(final['dismissal-date'], 1800001800); assert.equal(final['content-state'].status, 'FINAL');
  const delayed = activityPayload({ ...game, statusState: 'postponed' }, 1800000000000).aps;
  assert.equal(delayed.event, 'end'); assert.ok('dismissal-date' in delayed); assert.equal(delayed['dismissal-date'], 1800000000);
});
test('tokens and destinations cannot inject arbitrary APNs paths or environments', () => {
  const good = { activityId: 'A-B-1', gameId: 'game_1', token: 'ab'.repeat(32), environment: 'sandbox' };
  assert.ok(validActivityRegistration(good));
  for (const bad of [{ ...good, token: '../other' }, { ...good, token: 'a'.repeat(65) }, { ...good, environment: 'https://evil.invalid' }, { ...good, gameId: {} }, { ...good, activityId: '' }]) assert.ok(!validActivityRegistration(bad));
});
test('only unusable device tokens are removed; authentication and transient failures retry', () => {
  assert.ok(invalidAPNsToken(410)); assert.ok(invalidAPNsToken(400, 'BadDeviceToken'));
  assert.ok(!invalidAPNsToken(403, 'ExpiredProviderToken')); assert.ok(!invalidAPNsToken(429)); assert.ok(!invalidAPNsToken(500));
});
