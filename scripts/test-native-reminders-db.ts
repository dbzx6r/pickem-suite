import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
test('native reminders against disposable database', async () => {
  assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/nflpicks_reminder_test');
  process.env.AUTH_SECRET = 'disposable-reminder-test-only';
  process.env.PICK_REMINDERS_ENABLED = 'true';
  process.env.APNS_TEAM_ID = 'TEST'; process.env.APNS_BUNDLE_ID = 'org.example.pickem'; process.env.APNS_PRODUCTION_KEY_ID = 'TEST'; process.env.APNS_SANDBOX_KEY_ID = 'TEST';
  process.env.APNS_PRODUCTION_KEY_PATH = '/not-used'; process.env.APNS_SANDBOX_KEY_PATH = '/not-used';
  const prisma = new PrismaClient();
  const Module = require('node:module'); const original = Module._load;
  Module._load = function(name: string, ...args: unknown[]) {
    if (name === '@/lib/prisma') return { prisma };
    if (name.startsWith('@/')) return original.call(this, require('node:path').resolve(__dirname, '../src', name.slice(2)), ...args);
    return original.call(this, name, ...args);
  };
  const { handleMobile } = require('../src/lib/mobile-api');
  const { issueMobileSession } = require('../src/lib/mobile-auth');
  const { deliverNativeReminder } = require('../src/lib/native-reminders');
  Module._load = original;
  const user = await prisma.user.create({ data: { email: 'reminder-test@example.invalid', password: 'unused', profile: { create: { displayName: 'Synthetic reminder player' } } } });
  const other = await prisma.user.create({ data: { email: 'other-reminder@example.invalid', password: 'unused' } });
  const season = await prisma.season.create({ data: { year: 2098, isActive: true } });
  const week = await prisma.week.create({ data: { seasonId: season.id, weekNumber: 1, lockTime: new Date(Date.now() + 3600000) } });
  const game = await prisma.game.create({ data: { weekId: week.id, homeTeam: 'SEA', awayTeam: 'BUF', startTime: new Date(Date.now() + 3600000), statusState: 'pre' } });
  let token = await issueMobileSession(user);
  const otherToken = await issueMobileSession(other);
  const device = { token: 'ab'.repeat(32), environment: 'sandbox' };
  async function api(method: string, body?: unknown, bearer = token, path = 'pick-reminders') {
    return handleMobile(new Request(`http://localhost/api/v1/${path}`, { method, headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), path.split('/')) as Promise<Response>;
  }
  let sent = 0;
  const send = async (_token: string, _env: string, payload: any, options: any) => { sent++; assert.equal(new URL(payload.url).searchParams.get('week'), '1'); assert.equal(options.expires, Math.floor(game.startTime.getTime() / 1000)); return { status: 200 }; };
  try {
    assert.equal((await api('POST', device, '')).status, 401);
    assert.equal((await api('POST', { ...device, token: '../x' })).status, 400);
    assert.equal((await api('POST', device)).status, 200);
    assert.equal((await (await api('GET')).json()).enabled, true);
    assert.equal((await api('POST', device, otherToken)).status, 409);
    await api('DELETE', undefined, otherToken); assert.equal(await prisma.nativeDevice.count(), 1);
    await Promise.all([deliverNativeReminder(user.id, game.id, 60, send), deliverNativeReminder(user.id, game.id, 60, send)]);
    assert.equal(sent, 1, 'overlapping scheduler runs dedupe');
    await prisma.pick.create({ data: { userId: user.id, weekId: week.id, gameId: game.id, pickedTeam: 'SEA' } });
    await deliverNativeReminder(user.id, game.id, 15, send); assert.equal(sent, 1, 'saved website pick suppresses reminder');
    await prisma.week.update({ where: { id: week.id }, data: { tiebreakerGameId: game.id } });
    await deliverNativeReminder(user.id, game.id, 15, send); assert.equal(sent, 2, 'missing tiebreaker still reminds');
    await prisma.tiebreaker.create({ data: { userId: user.id, weekId: week.id, guessedTotal: 40 } });
    await deliverNativeReminder(user.id, game.id, 10, send); assert.equal(sent, 2);
    await prisma.pick.deleteMany({ where: { userId: user.id } });
    await prisma.profile.update({ where: { id: user.profileId! }, data: { notificationPreferences: { pickReminders: false } } });
    await deliverNativeReminder(user.id, game.id, 10, send); assert.equal(sent, 2, 'global opt-out honored');
    await prisma.profile.update({ where: { id: user.profileId! }, data: { notificationPreferences: {} } });
    await prisma.game.update({ where: { id: game.id }, data: { statusState: 'in' } });
    await deliverNativeReminder(user.id, game.id, 10, send); assert.equal(sent, 2, 'early-started game never reminds');
    await prisma.game.update({ where: { id: game.id }, data: { statusState: 'pre' } });
    let failures = 0;
    await deliverNativeReminder(user.id, game.id, 10, async () => { failures++; return { status: 503 }; });
    await deliverNativeReminder(user.id, game.id, 10, send); assert.equal(failures, 1); assert.equal(sent, 3, 'transient failure retries');
    await deliverNativeReminder(user.id, game.id, 5, async () => ({ status: 410 })); assert.equal(await prisma.nativeDevice.count(), 0);
    await api('POST', device); await api('POST', {}, token, 'auth/logout'); assert.equal(await prisma.nativeDevice.count(), 0);
    token = await issueMobileSession(user); await api('POST', device);
    await prisma.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } });
    await deliverNativeReminder(user.id, game.id, 3, send); assert.equal(sent, 3); assert.equal(await prisma.nativeDevice.count(), 0, 'revoked account cannot receive reminders');
  } finally { await prisma.$disconnect(); }
});
