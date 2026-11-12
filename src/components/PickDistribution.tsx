'use client';

import useSWR from 'swr';

type Distribution = {
  total: number;
  majorityTeam: string | null;
  minorityTeam: string | null;
  pointsAtStake: number;
  spreadLine: string | null;
  source: string | null;
  teams: Array<{ team: string; count: number; percentage: number; participants: Array<{ id: string; displayName: string }>; isFavorite: boolean; isOnlyPicker: boolean; isConsensus: boolean; includesCurrentUser: boolean }>;
};
const fetcher = async (url: string) => { const response = await fetch(url); if (!response.ok) throw new Error('Unavailable'); return response.json(); };

export default function PickDistribution({ gameId }: { gameId: string }) {
  const { data } = useSWR<Distribution>(`/api/games/${gameId}/pick-distribution`, fetcher, { revalidateOnFocus: false });
  if (!data || data.total === 0) return null;
  return (
    <div className="mt-2 rounded-lg border border-border bg-black/10 p-2 text-xs">
      <div className="mb-1 flex items-center justify-between gap-2"><p className="font-semibold text-muted-foreground">League picks ({data.total})</p><span className="text-[10px] text-muted-foreground">{data.pointsAtStake} pt{data.pointsAtStake === 1 ? '' : 's'} at stake</span></div>
      {data.teams.map((team) => (
        <div key={team.team} className={`mb-2 rounded p-1 last:mb-0 ${team.includesCurrentUser ? 'bg-primary/10 ring-1 ring-primary/30' : ''}`}>
          <div className="flex justify-between gap-2"><span>{team.team} {team.isFavorite ? '★' : ''} {team.isConsensus ? 'consensus' : ''} {team.isOnlyPicker ? 'only picker' : ''}</span><span>{team.percentage}% · {team.count}</span></div>
          <div className="h-1.5 overflow-hidden rounded bg-accent"><div className="h-full bg-primary" style={{ width: `${team.percentage}%` }} /></div>
          <p className="mt-0.5 break-words text-[10px] text-muted-foreground">{team.participants.map((participant) => participant.displayName).join(', ') || 'No picks'}</p>
        </div>
      ))}
      {data.spreadLine && <p className="mt-1 text-[9px] text-muted-foreground">Line: {data.spreadLine} · {data.source}</p>}
    </div>
  );
}
