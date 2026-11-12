import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apnsConfiguration, liveActivitiesEnabled } from '../src/lib/live-activity-config';
const env = { APNS_BUNDLE_ID: 'org.example.pickem', LIVE_ACTIVITIES_ENABLED: 'true', APNS_TEAM_ID: 'TEAM', APNS_PRODUCTION_KEY_PATH: '/private/production.p8', APNS_PRODUCTION_KEY_ID: 'PROD', APNS_SANDBOX_KEY_PATH: '/private/sandbox.p8', APNS_SANDBOX_KEY_ID: 'SANDBOX' };
test('push credentials never cross environment boundaries', () => {
  assert.equal(apnsConfiguration('sandbox', env)?.keyId, 'SANDBOX');
  assert.equal(apnsConfiguration('production', env)?.keyId, 'PROD');
  assert.equal(apnsConfiguration('production', env)?.keyPath, '/private/production.p8');
  assert.equal(apnsConfiguration('other', env), null);
});
test('advertise background activities only after both environments are configured', () => {
  assert.equal(liveActivitiesEnabled(env), true);
  assert.equal(liveActivitiesEnabled({ ...env, APNS_SANDBOX_KEY_ID: '' }), false);
  assert.equal(liveActivitiesEnabled({ ...env, APNS_PRODUCTION_KEY_PATH: '' }), false);
  assert.equal(liveActivitiesEnabled({ ...env, LIVE_ACTIVITIES_ENABLED: 'false' }), false);
});

test('missing or invalid app identifier disables APNs', () => {
  assert.equal(liveActivitiesEnabled({ ...env, APNS_BUNDLE_ID: '' }), false);
  assert.equal(liveActivitiesEnabled({ ...env, APNS_BUNDLE_ID: 'invalid/header' }), false);
});
