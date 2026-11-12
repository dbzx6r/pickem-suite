'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface Profile {
  displayName: string;
  avatarUrl: string | null;
}

interface Game {
  id: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  isFinal: boolean;
}

interface SideBet {
  id: string;
  proposerId: string;
  acceptorId: string;
  sport: string;
  gameId: string | null;
  betType: string;
  betDetails: Record<string, unknown>;
  stake: string | null;
  status: string;
  winnerId: string | null;
  proposerProfile: Profile;
  acceptorProfile: Profile;
  game: Game | null;
}

interface SideBetsSectionProps {
  userId: string;
  currentUserId: string | null;
  sport: 'nfl' | 'mlb';
}

function explainBet(
  betType: string,
  betDetails: Record<string, unknown>,
  homeTeam: string,
  awayTeam: string,
  sport: string,
): { proposerSide: string; acceptorSide: string } {
  if (betType === 'winner') {
    const team = betDetails.team as string;
    const otherTeam = team === homeTeam ? awayTeam : homeTeam;
    return { proposerSide: `${team} wins`, acceptorSide: `${otherTeam} wins` };
  }
  if (betType === 'spread') {
    const team = betDetails.team as string;
    const value = betDetails.value as number;
    const otherTeam = team === homeTeam ? awayTeam : homeTeam;
    const label = sport === 'mlb' ? 'run line' : 'spread';
    return {
      proposerSide: `${team} covers ${label} (-${value})`,
      acceptorSide: `${otherTeam} +${value}`,
    };
  }
  if (betType === 'total') {
    const direction = betDetails.direction as string;
    const value = betDetails.value as number;
    const opposite = direction === 'over' ? 'under' : 'over';
    return {
      proposerSide: `${direction} ${value}`,
      acceptorSide: `${opposite} ${value}`,
    };
  }
  return { proposerSide: betType, acceptorSide: 'other side' };
}

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'accepted') return 'default';
  if (status === 'pending') return 'secondary';
  if (status === 'declined' || status === 'cancelled') return 'destructive';
  return 'outline';
}

function BetCard({
  bet,
  currentUserId,
  onAction,
  isOwnProfile,
  sport,
}: {
  bet: SideBet;
  currentUserId: string;
  onAction: (id: string, action: string) => void;
  isOwnProfile: boolean;
  sport: 'nfl' | 'mlb';
}) {
  const isProposer = bet.proposerId === currentUserId;
  const isPendingReceived =
    isOwnProfile && bet.status === 'pending' && bet.acceptorId === currentUserId;
  const opponentProfile = isProposer ? bet.acceptorProfile : bet.proposerProfile;
  const initials = opponentProfile.displayName.slice(0, 2).toUpperCase();

  const resultLabel = () => {
    if (bet.status !== 'resolved') return null;
    if (bet.winnerId === null) return '🤝 Push';
    if (bet.winnerId === currentUserId) return '🏆 You won!';
    return '😞 You lost';
  };

  const gameLabel = bet.game ? `${bet.game.awayTeam} @ ${bet.game.homeTeam}` : null;
  const betLabel = (() => {
    const { betType, betDetails } = bet;
    if (betType === 'winner') return `${betDetails.team as string} wins`;
    if (betType === 'spread') {
      const label = sport === 'mlb' ? 'run line' : 'spread';
      return `${betDetails.team as string} covers ${label} (-${betDetails.value})`;
    }
    if (betType === 'total') return `${betDetails.direction as string} ${betDetails.value}`;
    return betType;
  })();
  const inlineDesc = gameLabel ? `${betLabel} · ${gameLabel}` : betLabel;

  const explain =
    isPendingReceived && bet.game
      ? explainBet(bet.betType, bet.betDetails, bet.game.homeTeam, bet.game.awayTeam, sport)
      : null;

  return (
    <Card className="glass-card border-border">
      <CardContent className="py-3 px-4">
        {isPendingReceived && explain && bet.game ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-3 space-y-1.5">
              <p className="text-sm font-semibold text-yellow-300">
                📋 {bet.proposerProfile.displayName} challenged you:
              </p>
              <p className="text-xs text-muted-foreground">
                🎮 {bet.game.awayTeam} @ {bet.game.homeTeam} —{' '}
                {new Date(bet.game.startTime).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </p>
              <p className="text-xs text-foreground">🎯 Bet: {explain.proposerSide}</p>
              <p className="text-xs text-muted-foreground pl-4">
                (You&apos;d be taking: {explain.acceptorSide})
              </p>
              {bet.stake && (
                <p className="text-xs text-yellow-400">💰 Stake: {bet.stake}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-7 text-xs border-green-500/50 text-green-400 hover:bg-green-500/10"
                onClick={() => onAction(bet.id, 'accept')}
              >
                Accept ✓
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-7 text-xs border-red-500/50 text-red-400 hover:bg-red-500/10"
                onClick={() => onAction(bet.id, 'decline')}
              >
                Decline ✗
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Avatar className="h-7 w-7 shrink-0">
                {opponentProfile.avatarUrl && (
                  <AvatarImage src={opponentProfile.avatarUrl} alt={opponentProfile.displayName} />
                )}
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{opponentProfile.displayName}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{inlineDesc}</p>
                {bet.stake && (
                  <p className="text-xs text-yellow-400 mt-0.5">💰 {bet.stake}</p>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <Badge variant={statusBadgeVariant(bet.status)} className="text-xs capitalize">
                {bet.status}
              </Badge>

              {bet.status === 'resolved' && isOwnProfile && (
                <span className="text-sm font-semibold">{resultLabel()}</span>
              )}

              {isOwnProfile && bet.status === 'pending' && bet.proposerId === currentUserId && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs px-2 mt-1"
                  onClick={() => onAction(bet.id, 'cancel')}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SideBetsSection({
  userId,
  currentUserId,
  sport,
}: SideBetsSectionProps) {
  const isOwnProfile = userId === currentUserId;
  const [bets, setBets] = useState<SideBet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAllResolved, setShowAllResolved] = useState(false);

  const fetchBets = useCallback(async () => {
    if (isOwnProfile && !currentUserId) return;
    setLoading(true);
    setError('');
    try {
      const url = isOwnProfile
        ? '/api/side-bets'
        : `/api/side-bets?userId=${encodeURIComponent(userId)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load bets');
      const data = (await res.json()) as { bets: SideBet[] };
      setBets(data.bets.filter((b) => b.sport.toLowerCase() === sport));
    } catch {
      setError('Failed to load friendly challenges');
    } finally {
      setLoading(false);
    }
  }, [isOwnProfile, userId, currentUserId, sport]);

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchBets(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchBets]);

  const handleAction = async (id: string, action: string) => {
    try {
      const res = await fetch(`/api/side-bets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? 'Action failed');
      }
      await fetchBets();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading friendly challenges…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  // Public view — accepted + resolved only, no action buttons
  if (!isOwnProfile) {
    return (
      <div>
        <h3 className="font-semibold text-sm text-muted-foreground mb-3">Public Friendly Challenges</h3>
        {bets.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4">
            No public friendly challenges yet.
          </p>
        ) : (
          <div className="space-y-3">
            {bets.map((bet) => (
              <BetCard
                key={bet.id}
                bet={bet}
                currentUserId={userId}
                onAction={() => {}}
                isOwnProfile={false}
                sport={sport}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!currentUserId) return null;

  const pendingReceived = bets.filter(
    (b) => b.acceptorId === currentUserId && b.status === 'pending',
  );
  const pendingSent = bets.filter(
    (b) => b.proposerId === currentUserId && b.status === 'pending',
  );
  const active = bets.filter((b) => b.status === 'accepted');
  const resolved = bets.filter((b) =>
    ['resolved', 'declined', 'cancelled'].includes(b.status),
  );

  if (bets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No friendly challenges yet. Challenge someone to get started!
      </p>
    );
  }

  const visibleResolved = showAllResolved ? resolved : resolved.slice(0, 5);

  const renderSection = (title: string, items: SideBet[]) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
        {items.map((bet) => (
          <BetCard
            key={bet.id}
            bet={bet}
            currentUserId={currentUserId}
            onAction={handleAction}
            isOwnProfile={true}
            sport={sport}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {renderSection('⏳ Pending — Action Needed', pendingReceived)}
      {renderSection('📤 Pending — Waiting', pendingSent)}
      {renderSection('🎲 Active Bets', active)}
      {resolved.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">✅ Resolved</h3>
          {visibleResolved.map((bet) => (
            <BetCard
              key={bet.id}
              bet={bet}
              currentUserId={currentUserId}
              onAction={handleAction}
              isOwnProfile={true}
              sport={sport}
            />
          ))}
          {resolved.length > 5 && (
            <button
              onClick={() => setShowAllResolved(!showAllResolved)}
              className="text-sm text-muted-foreground hover:text-foreground mt-2"
            >
              {showAllResolved ? 'Show less' : `Show ${resolved.length - 5} more`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
