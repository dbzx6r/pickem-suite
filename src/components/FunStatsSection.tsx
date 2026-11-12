'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronDown, ChevronUp } from 'lucide-react';

type WLRecord = { wins: number; losses: number; pct: number };
type UserRef = { userId: string; displayName: string; agreementPct: number };

export type FunStats = {
  pickTiming: {
    avgMinutesBeforeLock: number;
    earliestMinutesBeforeLock: number;
    latestMinutesBeforeLock: number;
    timeOfDayLabel: string;
    hourDistribution: { [key: string]: number };
  };
  pickLoyalty: {
    mostPickedTeam: { team: string; count: number } | null;
    leastPickedTeam: { team: string; count: number } | null;
    longestSameTeamStreak: number;
  };
  herdMentality: {
    majorityAgreementPct: number;
    pickTwin: UserRef | null;
    nemesis: UserRef | null;
  };
  luckIndex: {
    favoriteRecord: WLRecord;
    underdogRecord: WLRecord;
    manualPickRecord: WLRecord;
  };
  engagement: {
    totalPicks: number;
    slatesPlayed: number;
    totalSlates: number;
    participationRate: number;
    currentConsecutiveStreak: number;
    longestConsecutiveStreak: number;
  };
  personalityBadges: Array<{ id: string; label: string; desc: string }>;
  pickChangeHabit: {
    totalEdits: number;
    avgEditsPerSlate: number;
    mostEditedSlateId: string | null;
    mostEditedSlateEdits: number;
  };
};

function formatMinutes(mins: number): string {
  const m = Math.round(Math.abs(mins));
  if (m < 60) return `${m}m`;
  if (m < 1440) {
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
  }
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

function fmtRecord(rec: WLRecord): string {
  return `${rec.wins}-${rec.losses} (${rec.pct.toFixed(0)}%)`;
}

const BADGE_STYLES: { [key: string]: string } = {
  early_bird: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  procrastinator: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  contrarian: 'bg-slate-400/20 text-slate-300 border border-slate-400/30',
  loyalist: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  gambler: 'bg-green-500/20 text-green-400 border border-green-500/30',
};

function NoData() {
  return <span className="text-muted-foreground text-xs italic">Not enough data yet</span>;
}

export default function FunStatsSection({ funStats }: { funStats: FunStats | null }) {
  const [open, setOpen] = useState(true);

  if (!funStats) return null;

  const { pickTiming, pickLoyalty, herdMentality, luckIndex, engagement, personalityBadges, pickChangeHabit } = funStats;

  const hasTimingData = engagement.totalPicks > 0;
  const hasLoyaltyData = pickLoyalty.mostPickedTeam !== null;
  const hasHerdData = engagement.totalPicks > 0;
  const hasLuckData =
    luckIndex.favoriteRecord.wins + luckIndex.favoriteRecord.losses +
    luckIndex.underdogRecord.wins + luckIndex.underdogRecord.losses > 0;
  const hasEngagementData = engagement.totalPicks > 0;
  const hasEditsData = pickChangeHabit.totalEdits > 0;

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full text-left mb-4 group"
      >
        <h2 className="text-xl font-bold">🎉 Fun Stats</h2>
        {open ? (
          <ChevronUp className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
        ) : (
          <ChevronDown className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
        )}
      </button>

      {open && (
        <Card className="glass-card border-border">
          <CardContent className="pt-5 pb-5 space-y-5">
            {/* Personality Badges */}
            {personalityBadges.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {personalityBadges.map((b) => (
                  <span
                    key={b.id}
                    title={b.desc}
                    className={`text-sm px-3 py-1 rounded-full font-semibold ${BADGE_STYLES[b.id] ?? 'bg-accent text-foreground border border-border'}`}
                  >
                    {b.label}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm italic">No personality badges yet — keep picking!</p>
            )}

            <div className="border-t border-border" />

            {/* Row 1: Pick Timing + Pick Loyalty */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">⏱️ Pick Timing</p>
                {hasTimingData ? (
                  <div className="space-y-1 text-sm">
                    <div>Avg: <span className="font-semibold">{formatMinutes(pickTiming.avgMinutesBeforeLock)} before lock</span></div>
                    <div>Earliest: <span className="font-semibold">{formatMinutes(pickTiming.earliestMinutesBeforeLock)}</span></div>
                    <div>Latest: <span className="font-semibold">{formatMinutes(pickTiming.latestMinutesBeforeLock)} before lock</span></div>
                    <div className="text-muted-foreground text-xs pt-0.5">{pickTiming.timeOfDayLabel}</div>
                  </div>
                ) : <NoData />}
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">🏟️ Pick Loyalty</p>
                {hasLoyaltyData ? (
                  <div className="space-y-1 text-sm">
                    <div>Most: <span className="font-semibold">{pickLoyalty.mostPickedTeam!.team}</span> <span className="text-muted-foreground">({pickLoyalty.mostPickedTeam!.count}×)</span></div>
                    {pickLoyalty.leastPickedTeam && (
                      <div>Least: <span className="font-semibold">{pickLoyalty.leastPickedTeam.team}</span> <span className="text-muted-foreground">({pickLoyalty.leastPickedTeam.count}×)</span></div>
                    )}
                    {pickLoyalty.longestSameTeamStreak > 1 && (
                      <div>Streak: <span className="font-semibold">{pickLoyalty.longestSameTeamStreak} in a row</span></div>
                    )}
                  </div>
                ) : <NoData />}
              </div>
            </div>

            <div className="border-t border-border" />

            {/* Row 2: Herd Mentality + Luck Index */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">🐑 Herd Mentality</p>
                {hasHerdData ? (
                  <div className="space-y-1 text-sm">
                    <div><span className="font-semibold">{herdMentality.majorityAgreementPct.toFixed(0)}%</span> majority agreement</div>
                    {herdMentality.pickTwin ? (
                      <div>
                        Twin: <span className="font-semibold">@{herdMentality.pickTwin.displayName}</span>{' '}
                        <span className="text-muted-foreground">({herdMentality.pickTwin.agreementPct.toFixed(0)}%)</span>
                      </div>
                    ) : (
                      <div className="text-muted-foreground text-xs">No pick twin found yet</div>
                    )}
                    {herdMentality.nemesis ? (
                      <div>
                        Nemesis: <span className="font-semibold">@{herdMentality.nemesis.displayName}</span>{' '}
                        <span className="text-muted-foreground">({herdMentality.nemesis.agreementPct.toFixed(0)}%)</span>
                      </div>
                    ) : (
                      <div className="text-muted-foreground text-xs">No nemesis found yet</div>
                    )}
                  </div>
                ) : <NoData />}
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">🎯 Luck Index</p>
                {hasLuckData ? (
                  <div className="space-y-1 text-sm">
                    <div>Favorites: <span className="font-semibold">{fmtRecord(luckIndex.favoriteRecord)}</span></div>
                    <div>Underdogs: <span className="font-semibold">{fmtRecord(luckIndex.underdogRecord)}</span></div>
                  </div>
                ) : <NoData />}
              </div>
            </div>

            <div className="border-t border-border" />

            {/* Row 3: Engagement + Pick Changes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">📊 Engagement</p>
                {hasEngagementData ? (
                  <div className="space-y-1 text-sm">
                    <div><span className="font-semibold">{engagement.totalPicks}</span> total picks</div>
                    <div>
                      <span className="font-semibold">{engagement.slatesPlayed}/{engagement.totalSlates}</span> slates{' '}
                      <span className="text-muted-foreground">({engagement.participationRate.toFixed(0)}%)</span>
                    </div>
                    <div>Best streak: <span className="font-semibold">{engagement.longestConsecutiveStreak}</span></div>
                  </div>
                ) : <NoData />}
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">✏️ Pick Changes</p>
                {hasEditsData ? (
                  <div className="space-y-1 text-sm">
                    <div><span className="font-semibold">{pickChangeHabit.totalEdits}</span> total edits</div>
                    <div>Avg <span className="font-semibold">{pickChangeHabit.avgEditsPerSlate.toFixed(1)}</span> edits/slate</div>
                    {pickChangeHabit.mostEditedSlateEdits > 0 && (
                      <div>Most in one slate: <span className="font-semibold">{pickChangeHabit.mostEditedSlateEdits}</span></div>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground text-xs italic">No edits recorded yet</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
