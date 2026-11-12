/* eslint-disable react-hooks/purity -- this dynamic server diagnostics page intentionally measures request-time health */
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

function formatDate(value: Date | string | null | undefined) {
  if (!value) return 'Not reported';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 'Invalid timestamp' : date.toLocaleString();
}

export default async function HealthPage() {
  const started = Date.now();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [season, lastSync, lastScore, lastReminderRun, deliveryFailures, lastDelivery, users, rollover] = await Promise.all([
    prisma.season.findFirst({ where: { isActive: true, isSandbox: false }, include: { weeks: { include: { games: true } } } }),
    prisma.auditLog.findFirst({ where: { action: { in: ['NFL_SYNC', 'NFL_SYNC_CRON'] } }, orderBy: { createdAt: 'desc' } }),
    prisma.auditLog.findFirst({ where: { action: 'SCORING_RUN' }, orderBy: { createdAt: 'desc' } }),
    prisma.auditLog.findFirst({ where: { action: 'PICK_REMINDER_CRON' }, orderBy: { createdAt: 'desc' } }),
    prisma.notificationDelivery.count({ where: { status: 'FAILED', createdAt: { gte: since } } }),
    prisma.notificationDelivery.findFirst({ orderBy: { createdAt: 'desc' } }),
    prisma.user.count({ where: { role: 'USER' } }),
    prisma.seasonRollover.findFirst({ orderBy: { createdAt: 'desc' } }),
  ]);
  const latency = Date.now() - started;
  const weeks = season?.weeks ?? [];
  const games = weeks.flatMap((week) => week.games);
  const missingEspn = games.filter((game) => !game.espnGameId).length;
  const espnIds = games.map((game) => game.espnGameId).filter((id): id is string => Boolean(id));
  const duplicateEspn = espnIds.length - new Set(espnIds).size;
  const lockMismatches = weeks.filter((week) => {
    const first = [...week.games].sort((a, b) => a.startTime.getTime() - b.startTime.getTime())[0];
    return first && Math.abs(first.startTime.getTime() - week.lockTime.getTime()) > 1000;
  }).length;
  const scheduleIssues = missingEspn + duplicateEspn + lockMismatches;
  const syncMinutes = Math.max(1, Number(process.env.SYNC_INTERVAL_MINUTES) || 5);
  const nextSync = lastSync ? new Date(lastSync.createdAt.getTime() + syncMinutes * 60_000) : null;
  const vapidReady = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
  const backupAt = process.env.LAST_BACKUP_AT;
  const backupAgeHours = backupAt ? (Date.now() - new Date(backupAt).getTime()) / 3_600_000 : Infinity;

  return <div className="space-y-5"><div><h1 className="text-2xl font-black">Application Health</h1><p className="text-muted-foreground">Operational checks for sync, reminders, schedules, backups, and the deployed release.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Health label="Database" value={`Healthy · ${latency} ms`} ok /><Health label="Active season" value={season ? `${season.year} ${season.seasonType}` : 'Missing'} ok={Boolean(season)} /><Health label="Schedule integrity" value={scheduleIssues ? `${scheduleIssues} issue${scheduleIssues === 1 ? '' : 's'}` : `${games.length} games clean`} ok={scheduleIssues === 0} /><Health label="Push delivery (24h)" value={`${deliveryFailures} failure${deliveryFailures === 1 ? '' : 's'}`} ok={deliveryFailures === 0 && vapidReady} /><Health label="Backups" value={backupAt ? formatDate(backupAt) : 'Not reported by deploy'} ok={backupAgeHours <= 48} /><Health label="Participants" value={String(users)} ok /><Health label="App version" value={process.env.APP_VERSION || process.env.APP_GIT_SHA || 'development'} ok={Boolean(process.env.APP_VERSION || process.env.APP_GIT_SHA)} /><Health label="Reminder worker" value={lastReminderRun ? formatDate(lastReminderRun.createdAt) : 'No audited run'} ok={Boolean(lastReminderRun && vapidReady)} /></div><Card className="glass-card border-border"><CardHeader><CardTitle>Jobs and release details</CardTitle></CardHeader><CardContent className="grid gap-2 text-sm sm:grid-cols-2"><p><b>Last sync:</b> {formatDate(lastSync?.createdAt)}</p><p><b>Expected next sync:</b> {formatDate(nextSync)}</p><p><b>Last scoring run:</b> {formatDate(lastScore?.createdAt)}</p><p><b>Last reminder delivery:</b> {formatDate(lastDelivery?.createdAt)}{lastDelivery ? ` · ${lastDelivery.status}` : ''}</p><p><b>Last season rollover:</b> {formatDate(rollover?.createdAt)}</p><p><b>Deployed at:</b> {formatDate(process.env.DEPLOYED_AT)}</p><p><b>Release SHA/tag:</b> {process.env.APP_GIT_SHA || process.env.APP_VERSION || 'Not set'}</p><p><b>Push configuration:</b> {vapidReady ? 'Ready' : 'Incomplete'}</p></CardContent></Card><Card className="glass-card border-border"><CardHeader><CardTitle>Schedule diagnostics</CardTitle></CardHeader><CardContent className="space-y-1 text-sm"><p>Missing ESPN IDs: <b>{missingEspn}</b></p><p>Duplicate ESPN IDs: <b>{duplicateEspn}</b></p><p>Week lock-time mismatches: <b>{lockMismatches}</b></p><p className="text-xs text-muted-foreground">Infrastructure container, tunnel, disk, and PBS status are still verified from the host during each deployment; the latest backup timestamp is injected into this release.</p></CardContent></Card></div>;
}

function Health({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return <Card className={`glass-card ${ok ? 'border-emerald-500/25' : 'border-red-500/40'}`}><CardContent className="p-4"><p className="text-sm text-muted-foreground">{label}</p><p className={ok ? 'font-bold text-emerald-400' : 'font-bold text-red-400'}>{value}</p></CardContent></Card>;
}
