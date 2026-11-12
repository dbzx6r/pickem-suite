import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validReminderDevice, reminderDeviceID, reminderPayload } from '../src/lib/native-reminder-policy';
test('native reminders reject invalid APNs destinations', () => {
  const good = { token: 'ab'.repeat(32), environment: 'sandbox' };
  assert.ok(validReminderDevice(good));
  for (const body of [{ ...good, token: '../inject' }, { ...good, token: 'a'.repeat(65) }, { ...good, environment: 'evil.invalid' }, {}]) assert.equal(validReminderDevice(body), false);
  assert.notEqual(reminderDeviceID(good.token, 'sandbox'), reminderDeviceID(good.token, 'production'));
});
test('reminder taps identify the league and week without exposing picks or credentials', () => {
  const payload = reminderPayload('Make your pick', 'Kickoff soon', 'league & one', 8);
  const url = new URL(payload.url);
  assert.equal(url.host, 'picks'); assert.equal(url.searchParams.get('league'), 'league & one'); assert.equal(url.searchParams.get('week'), '8');
  assert.equal(payload.aps.sound, 'default'); assert.ok(JSON.stringify(payload).length < 4096);
});
