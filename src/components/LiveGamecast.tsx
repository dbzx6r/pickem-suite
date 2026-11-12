'use client';

import { useEffect, useState } from 'react';
import TeamLogo from '@/components/TeamLogo';
import { NFL_TEAMS } from '@/lib/espn';
import {
  ballOnText,
  clampFieldPosition,
  firstDownFieldPosition,
  shortDownDistance,
} from '@/lib/gamecast';
import { LivePlayerCategory, LiveTeamStat } from '@/lib/live-game-stats';

interface LiveGamecastProps {
  isFinal?: boolean;
  awayTeam: string;
  homeTeam: string;
  possession: string | null;
  downDistance: string | null;
  shortDownDistance: string | null;
  possessionText: string | null;
  yardLine: number | null;
  distance: number | null;
  isRedZone: boolean;
  driveSummary: string | null;
  lastPlayText: string | null;
  awayScore: number | null;
  homeScore: number | null;
  awayScoreQ1: number | null;
  awayScoreQ2: number | null;
  awayScoreQ3: number | null;
  awayScoreQ4: number | null;
  homeScoreQ1: number | null;
  homeScoreQ2: number | null;
  homeScoreQ3: number | null;
  homeScoreQ4: number | null;
  teamStats: LiveTeamStat[];
  boxScore: LivePlayerCategory[];
}

type FieldSituation = Pick<
  LiveGamecastProps,
  'possession' | 'possessionText' | 'yardLine' | 'distance' | 'isRedZone'
>;

const fieldLinePositions = Array.from({ length: 9 }, (_, index) => (index + 1) * 10);
type LivePanelTab = 'gamecast' | 'box-score' | 'team-stats';

function validYardLine(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= 100;
}

function FieldGraphic({
  awayTeam,
  homeTeam,
  situation,
}: {
  awayTeam: string;
  homeTeam: string;
  situation: FieldSituation | null;
}) {
  const position = situation && validYardLine(situation.yardLine)
    ? clampFieldPosition(situation.yardLine)
    : null;
  const markerLeft = position === null ? null : 5 + (position * 0.9);
  const firstDown = situation
    ? firstDownFieldPosition(
        situation.yardLine,
        situation.distance,
        situation.possession,
        awayTeam,
        homeTeam,
      )
    : null;
  const firstDownX = firstDown === null ? null : 5 + (firstDown * 0.9);
  const possessionColor = situation?.possession
    ? NFL_TEAMS[situation.possession]?.color ?? '#ffffff'
    : '#ffffff';

  return (
    <div className="relative h-32 overflow-hidden rounded-lg bg-[#07150e]" aria-label="Live field position">
      <svg
        className="absolute inset-x-0 bottom-0 h-[106px] w-full"
        viewBox="0 0 100 34"
        preserveAspectRatio="none"
        role="img"
        aria-label={position === null ? 'Field position is updating' : `Ball at ${Math.round(position)} percent of the field`}
      >
        <defs>
          <linearGradient id="gamecast-field" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16a968" />
            <stop offset="100%" stopColor="#087044" />
          </linearGradient>
        </defs>
        <polygon points="5,2 95,2 100,32 0,32" fill="url(#gamecast-field)" />
        <polygon points="5,2 14,2 10,32 0,32" fill="#0b4f37" opacity="0.92" />
        <polygon points="86,2 95,2 100,32 90,32" fill="#0b4f37" opacity="0.92" />
        {situation?.isRedZone && situation.possession === awayTeam && (
          <polygon points="77,2 95,2 100,32 72,32" fill="#ef4444" opacity="0.18" />
        )}
        {situation?.isRedZone && situation.possession === homeTeam && (
          <polygon points="5,2 23,2 28,32 0,32" fill="#ef4444" opacity="0.18" />
        )}
        {fieldLinePositions.map((yard) => {
          const x = 5 + (yard * 0.9);
          return <line key={yard} x1={x} y1="2" x2={x} y2="32" stroke="white" strokeOpacity="0.22" strokeWidth="0.35" />;
        })}
        <line x1="50" y1="2" x2="50" y2="32" stroke="white" strokeOpacity="0.5" strokeWidth="0.55" />
        {[20, 50, 80].map((yard) => (
          <text
            key={yard}
            x={5 + (yard * 0.9)}
            y="30"
            textAnchor="middle"
            fill="white"
            fillOpacity="0.72"
            fontSize="3.2"
            fontWeight="700"
          >
            {yard === 50 ? 50 : 20}
          </text>
        ))}
        {firstDownX !== null && (
          <line
            x1={firstDownX}
            y1="2"
            x2={firstDownX}
            y2="32"
            stroke="#facc15"
            strokeWidth="0.85"
            strokeDasharray="1.5 1"
          />
        )}
        <text x="7" y="19" textAnchor="middle" fill="white" fillOpacity="0.66" fontSize="3.3" fontWeight="800" transform="rotate(-90 7 19)">
          {awayTeam}
        </text>
        <text x="93" y="19" textAnchor="middle" fill="white" fillOpacity="0.66" fontSize="3.3" fontWeight="800" transform="rotate(90 93 19)">
          {homeTeam}
        </text>
      </svg>

      {markerLeft !== null ? (
        <div
          className="absolute top-1 -translate-x-1/2 transition-[left] duration-500 ease-out motion-reduce:transition-none"
          style={{ left: `${markerLeft}%` }}
        >
          <div className="mx-auto rounded-full border border-white/70 bg-black/55 p-1 shadow-lg shadow-black/50">
            <TeamLogo abbreviation={situation?.possession ?? awayTeam} size={25} />
          </div>
          <div className="mx-auto h-[50px] w-px bg-white/65" />
          <div
            className="mx-auto -mt-1 h-2.5 w-4 rounded-[50%] border border-white/80 shadow-md"
            style={{ backgroundColor: possessionColor, transform: 'rotate(-18deg)' }}
          >
            <span className="mx-auto mt-[3px] block h-px w-2 bg-white/80" />
          </div>
        </div>
      ) : (
        <div className="absolute inset-x-0 top-5 text-center text-[10px] font-semibold text-white/75">
          Field position updating
        </div>
      )}
    </div>
  );
}

function LineScore({ props }: { props: LiveGamecastProps }) {
  const rows = [
    [props.awayTeam, props.awayScoreQ1, props.awayScoreQ2, props.awayScoreQ3, props.awayScoreQ4, props.awayScore],
    [props.homeTeam, props.homeScoreQ1, props.homeScoreQ2, props.homeScoreQ3, props.homeScoreQ4, props.homeScore],
  ];
  return (
    <div className="border-b border-border px-3 py-3">
      <table className="w-full table-fixed text-center text-[11px]">
        <thead className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
          <tr><th className="w-16 text-left">Team</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th className="text-foreground">T</th></tr>
        </thead>
        <tbody>
          {rows.map(([team, ...scores]) => (
            <tr key={String(team)} className="border-t border-white/5">
              <td className="py-2 text-left font-black text-foreground">{team}</td>
              {scores.map((score, index) => <td key={index} className={index === 4 ? 'font-black text-foreground' : 'text-foreground/80'}>{score ?? '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlayerTeamTable({
  team,
  category,
  side,
}: {
  team: string;
  category: LivePlayerCategory;
  side: 'away' | 'home';
}) {
  const lines = category[side];
  return (
    <div>
      <div className="flex items-center gap-2 border-y border-border bg-white/[0.025] px-3 py-2">
        <TeamLogo abbreviation={team} size={22} />
        <p className="text-[11px] font-black text-foreground">{team} {category.label}</p>
      </div>
      {lines.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full whitespace-nowrap text-right text-[10px]">
            <thead className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="sticky left-0 min-w-36 bg-[#0d1512] px-3 py-2 text-left">Player</th>
                {category.labels.map((label, index) => <th key={`${label}-${index}`} className="min-w-12 px-2 py-2">{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, lineIndex) => (
                <tr key={`${line.athlete}-${lineIndex}`} className="border-t border-white/5">
                  <td className="sticky left-0 max-w-48 truncate bg-[#0d1512] px-3 py-2 text-left font-semibold text-foreground" title={line.athlete}>{line.athlete}</td>
                  {category.labels.map((_, statIndex) => <td key={statIndex} className="px-2 py-2 tabular-nums text-foreground/80">{line.stats[statIndex] ?? '—'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-3 py-4 text-center text-[10px] text-muted-foreground">No {category.label.toLowerCase()} stats yet.</p>
      )}
    </div>
  );
}

function BoxScorePanel({ props }: { props: LiveGamecastProps }) {
  const [categoryName, setCategoryName] = useState(() => props.boxScore[0]?.name ?? '');
  const category = props.boxScore.find((item) => item.name === categoryName) ?? props.boxScore[0] ?? null;
  return (
    <div>
      <LineScore props={props} />
      {props.boxScore.length > 0 ? (
        <>
          <div className="flex gap-1 overflow-x-auto border-b border-border px-2 py-2">
            {props.boxScore.map((item) => (
              <button
                type="button"
                key={item.name}
                onClick={() => setCategoryName(item.name)}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-bold transition-colors ${category?.name === item.name ? 'bg-emerald-500/20 text-emerald-300' : 'bg-muted/50 text-muted-foreground hover:text-foreground'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {category && (
            <div>
              <PlayerTeamTable team={props.awayTeam} category={category} side="away" />
              <PlayerTeamTable team={props.homeTeam} category={category} side="home" />
            </div>
          )}
        </>
      ) : (
        <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">Player statistics are updating.</p>
      )}
    </div>
  );
}

function TeamStatsPanel({ props }: { props: LiveGamecastProps }) {
  return (
    <div>
      <div className="grid grid-cols-[1fr_2fr_1fr] items-center border-b border-border px-3 py-3 text-center">
        <div className="flex flex-col items-center gap-1"><TeamLogo abbreviation={props.awayTeam} size={28} /><span className="text-[10px] font-black">{props.awayTeam}</span></div>
        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground">Team Stats</p>
        <div className="flex flex-col items-center gap-1"><TeamLogo abbreviation={props.homeTeam} size={28} /><span className="text-[10px] font-black">{props.homeTeam}</span></div>
      </div>
      {props.teamStats.length > 0 ? props.teamStats.map((stat) => (
        <div key={stat.name} className="grid grid-cols-[1fr_2fr_1fr] items-center border-b border-white/5 px-3 py-2 text-center text-[11px] last:border-b-0">
          <span className="font-black tabular-nums text-foreground">{stat.away ?? '—'}</span>
          <span className="px-1 text-[9px] font-semibold text-muted-foreground">{stat.label}</span>
          <span className="font-black tabular-nums text-foreground">{stat.home ?? '—'}</span>
        </div>
      )) : (
        <p className="px-3 py-8 text-center text-[11px] text-muted-foreground">Team statistics are updating.</p>
      )}
    </div>
  );
}

export default function LiveGamecast(props: LiveGamecastProps) {
  const availableTabs: Array<[LivePanelTab, string]> = props.isFinal
    ? [['box-score', 'Box Score'], ['team-stats', 'Team Stats']]
    : [['gamecast', 'Gamecast'], ['box-score', 'Box Score'], ['team-stats', 'Team Stats']];
  const [activeTab, setActiveTab] = useState<LivePanelTab>(props.isFinal ? 'box-score' : 'gamecast');
  const [lastSituation, setLastSituation] = useState<FieldSituation | null>(() => (
    validYardLine(props.yardLine)
      ? {
          possession: props.possession,
          possessionText: props.possessionText,
          yardLine: props.yardLine,
          distance: props.distance,
          isRedZone: props.isRedZone,
        }
      : null
  ));

  useEffect(() => {
    if (!validYardLine(props.yardLine)) return;
    const update = window.setTimeout(() => {
      setLastSituation({
        possession: props.possession,
        possessionText: props.possessionText,
        yardLine: props.yardLine,
        distance: props.distance,
        isRedZone: props.isRedZone,
      });
    }, 0);
    return () => window.clearTimeout(update);
  }, [props.distance, props.isRedZone, props.possession, props.possessionText, props.yardLine]);

  const currentSituation = validYardLine(props.yardLine)
    ? {
        possession: props.possession,
        possessionText: props.possessionText,
        yardLine: props.yardLine,
        distance: props.distance,
        isRedZone: props.isRedZone,
      }
    : lastSituation;
  const drive = props.driveSummary?.trim() || 'Updating';

  return (
    <section className="mb-3 overflow-hidden rounded-xl border border-emerald-400/20 bg-black/25" aria-label={props.isFinal ? 'Completed game details' : 'Live game center'}>
      <div className="flex border-b border-border" role="tablist" aria-label={props.isFinal ? 'Completed game details' : 'Live game details'}>
        {availableTabs.map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`relative flex-1 px-2 py-2.5 text-[10px] font-black transition-colors ${activeTab === tab ? 'text-emerald-300' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {label}
            {activeTab === tab && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-emerald-400" />}
          </button>
        ))}
      </div>

      {activeTab === 'gamecast' && (
        <div role="tabpanel">
          <div className="flex items-center justify-end border-b border-border px-3 py-1.5">
            {props.isRedZone ? (
              <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-red-300">Red Zone</span>
            ) : (
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Live field</span>
            )}
          </div>
          <div className="grid grid-cols-3 divide-x divide-white/10 border-b border-border">
            <div className="min-w-0 px-2 py-2 text-center">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Down</p>
              <p className="mt-0.5 truncate text-xs font-black text-foreground">{shortDownDistance(props.shortDownDistance, props.downDistance)}</p>
            </div>
            <div className="min-w-0 px-2 py-2 text-center">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Ball on</p>
              <p className="mt-0.5 truncate text-xs font-black text-foreground">
                {ballOnText(currentSituation?.possessionText ?? props.possessionText, currentSituation?.yardLine ?? props.yardLine, props.awayTeam, props.homeTeam)}
              </p>
            </div>
            <div className="min-w-0 px-2 py-2 text-center">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Drive</p>
              <p className="mt-0.5 break-words text-[10px] font-black leading-tight text-foreground" title={drive}>{drive}</p>
            </div>
          </div>

          <div className="p-2"><FieldGraphic awayTeam={props.awayTeam} homeTeam={props.homeTeam} situation={currentSituation} /></div>

          {props.lastPlayText && (
            <div className="border-t border-border px-3 py-2.5">
              <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">Last play</p>
              <p className="mt-1 text-[11px] leading-relaxed text-foreground/90">{props.lastPlayText}</p>
            </div>
          )}
        </div>
      )}
      {activeTab === 'box-score' && <div role="tabpanel"><BoxScorePanel props={props} /></div>}
      {activeTab === 'team-stats' && <div role="tabpanel"><TeamStatsPanel props={props} /></div>}
    </section>
  );
}
