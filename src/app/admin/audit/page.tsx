import { prisma } from '@/lib/prisma';
import { Card, CardContent } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const logs = await prisma.auditLog.findMany({ take: 200, orderBy: { createdAt: 'desc' }, include: { actor: { select: { email: true, profile: { select: { displayName: true } } } } } });
  return <div className="space-y-4"><div><h1 className="text-2xl font-black">Commissioner Audit Log</h1><p className="text-muted-foreground">Administrative changes and data exports. Entries are append-only in the UI.</p></div><Card className="glass-card border-border"><CardContent className="divide-y divide-white/10 p-0">{logs.map((log) => <div key={log.id} className="grid gap-1 p-3 text-sm sm:grid-cols-[180px_180px_1fr]"><span className="text-muted-foreground">{log.createdAt.toLocaleString()}</span><span>{log.actor?.profile?.displayName ?? log.actor?.email ?? 'System'}</span><span><b>{log.action}</b> · {log.targetType}{log.targetId ? ` (${log.targetId})` : ''}</span></div>)}{logs.length === 0 && <p className="p-8 text-center text-muted-foreground">No audit entries yet.</p>}</CardContent></Card></div>;
}
