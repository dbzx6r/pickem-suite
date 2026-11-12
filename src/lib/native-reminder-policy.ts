import { createHash } from 'node:crypto';
export function validReminderDevice(body: Record<string, unknown>) {
  return typeof body.token === 'string' && /^[a-f0-9]{64,200}$/.test(body.token) && body.token.length % 2 === 0 && ['sandbox', 'production'].includes(String(body.environment));
}
export function reminderDeviceID(token: string, environment: string) { return createHash('sha256').update(`${environment}:${token}`).digest('hex'); }
export function reminderPayload(title: string, message: string, league: string, week: number) {
  return { aps: { alert: { title, body: message }, sound: 'default', 'thread-id': 'pick-reminders' }, url: `pickem://picks?league=${encodeURIComponent(league)}&week=${week}` };
}
