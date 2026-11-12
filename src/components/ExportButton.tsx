'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

interface Week {
  id: string;
  weekNumber: number;
  isFinal: boolean;
}

export default function ExportButton({ isCommissioner = false }: { isCommissioner?: boolean }) {
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [scope, setScope] = useState('all');
  const [mode, setMode] = useState<'mine' | 'league'>('mine');

  useEffect(() => {
    fetch('/api/weeks/list')
      .then((r) => r.json())
      .then((d) => setWeeks(d.weeks ?? []))
      .catch(() => {});
  }, []);

  const handleExport = () => {
    const today = new Date().toISOString().split('T')[0];
    const link = document.createElement('a');
    link.href = `/api/export?scope=${scope}&mode=${mode}&filename=nfl-picks-${today}.csv`;
    link.download = `nfl-picks-${today}.csv`;
    link.click();
  };

  return (
    <div className="flex max-w-full flex-wrap items-center gap-2">
      <select
        value={mode}
        onChange={(e) => setMode(e.target.value as 'mine' | 'league')}
        className="h-9 max-w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
        aria-label="Export visibility"
      >
        <option value="mine">My picks</option>
        <option value="league">{isCommissioner ? 'League picks (commissioner)' : 'League picks (closed weeks)'}</option>
      </select>
      <select
        value={scope}
        onChange={(e) => setScope(e.target.value)}
        className="h-9 max-w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="all">All Season</option>
        {weeks.map((w) => (
          <option key={w.id} value={w.id}>
            Week {w.weekNumber}{w.isFinal ? '' : ' (open)'}
          </option>
        ))}
      </select>
      <Button
        variant="outline"
        size="sm"
        onClick={handleExport}
        className="flex items-center gap-1.5"
      >
        <Download className="h-4 w-4" />
        Export CSV
      </Button>
    </div>
  );
}
