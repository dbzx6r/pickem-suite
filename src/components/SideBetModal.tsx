'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface BetField {
  name: string;
  type: string;
  options?: string[];
  default?: number;
}

interface BetOption {
  betType: string;
  label: string;
  fields: BetField[];
}

interface Game {
  id: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  isFinal: boolean;
}

interface SideBetModalProps {
  opponentId: string;
  opponentName: string;
  sport: 'nfl' | 'mlb';
  isOpen: boolean;
  onClose: () => void;
}

export default function SideBetModal({
  opponentId,
  opponentName,
  sport,
  isOpen,
  onClose,
}: SideBetModalProps) {
  const [step, setStep] = useState(1);
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [betOptions, setBetOptions] = useState<BetOption[]>([]);
  const [selectedBetType, setSelectedBetType] = useState('');
  const [betDetails, setBetDetails] = useState<Record<string, string | number>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      setStep(1);
      setSelectedGame(null);
      setBetOptions([]);
      setSelectedBetType('');
      setBetDetails({});
      setError('');
      setSuccess(false);
      setLoading(true);
      fetch('/api/weeks/active')
        .then((r) => r.json())
        .then((data: { games?: Game[] }) => setGames((data.games ?? []).filter((g) => !g.isFinal)))
        .catch(() => setError('Failed to load games'))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isOpen, sport]);

  const initBetDetails = (option: BetOption) => {
    const defaults: Record<string, string | number> = {};
    for (const field of option.fields) {
      if (field.default !== undefined) defaults[field.name] = field.default;
      else if (field.options?.length) defaults[field.name] = field.options[0];
      else defaults[field.name] = '';
    }
    setBetDetails(defaults);
  };

  const handleSelectGame = async (game: Game) => {
    setSelectedGame(game);
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/games/${game.id}/side-bet-options`);
      const data = (await res.json()) as { options?: BetOption[] };
      const options = data.options ?? [];
      setBetOptions(options);
      if (options.length > 0) {
        setSelectedBetType(options[0].betType);
        initBetDetails(options[0]);
      }
      setStep(2);
    } catch {
      setError('Failed to load bet options');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectBetType = (betType: string) => {
    setSelectedBetType(betType);
    const option = betOptions.find((o) => o.betType === betType);
    if (option) initBetDetails(option);
  };

  const handleSubmit = async () => {
    if (!selectedGame) return;
    setSubmitting(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        acceptorId: opponentId,
        sport,
        betType: selectedBetType,
        betDetails,
        gameId: selectedGame.id,
      };

      const res = await fetch('/api/side-bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? 'Failed to send challenge');
      }
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send challenge');
    } finally {
      setSubmitting(false);
    }
  };

  const currentOption = betOptions.find((o) => o.betType === selectedBetType);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>🎲 Challenge {opponentName}</DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">🎲</div>
            <p className="text-green-400 font-semibold text-sm">
              Challenge sent! Waiting for {opponentName} to accept.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Step indicator */}
            <div className="flex items-center gap-1 text-xs">
              {(['Game', 'Prediction', 'Review'] as const).map((label, i) => {
                const n = i + 1;
                const active = step === n;
                const done = step > n;
                return (
                  <div key={label} className="flex items-center gap-1">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs ${
                        done
                          ? 'bg-green-500 text-white'
                          : active
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-accent text-muted-foreground'
                      }`}
                    >
                      {done ? '✓' : n}
                    </div>
                    <span className={active ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                      {label}
                    </span>
                    {n < 3 && <span className="text-muted-foreground mx-1">›</span>}
                  </div>
                );
              })}
            </div>

            {error && (
              <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            {/* Step 1: Pick a game */}
            {step === 1 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground font-medium">Select an upcoming game:</p>
                {loading ? (
                  <p className="text-sm text-muted-foreground">Loading games…</p>
                ) : games.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No upcoming games available for friendly challenges.
                  </p>
                ) : (
                  games.map((game) => (
                    <button
                      key={game.id}
                      onClick={() => handleSelectGame(game)}
                      className="w-full text-left p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-all"
                    >
                      <div className="font-semibold text-sm">
                        {game.awayTeam} @ {game.homeTeam}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {new Date(game.startTime).toLocaleString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Step 2: Pick bet type */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="p-2 rounded-md bg-muted/50 border border-border">
                  <p className="text-sm font-medium">
                    {selectedGame?.awayTeam} @ {selectedGame?.homeTeam}
                  </p>
                </div>

                {loading ? (
                  <p className="text-sm text-muted-foreground">Loading options…</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                      Choose bet type
                    </p>
                    {betOptions.map((option) => (
                      <label
                        key={option.betType}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                          selectedBetType === option.betType
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-border hover:bg-muted/50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="betType"
                          value={option.betType}
                          checked={selectedBetType === option.betType}
                          onChange={() => handleSelectBetType(option.betType)}
                          className="accent-primary"
                        />
                        <span className="text-sm font-medium">{option.label}</span>
                      </label>
                    ))}
                  </div>
                )}

                {/* Dynamic fields for the selected bet type */}
                {currentOption && currentOption.fields.length > 0 && (
                  <div className="space-y-3 pt-1">
                    {currentOption.fields.map((field) => (
                      <div key={field.name}>
                        <Label className="text-xs capitalize text-muted-foreground">
                          {field.name === 'direction'
                            ? 'Over / Under'
                            : field.name === 'team'
                            ? 'Team'
                            : field.name}
                        </Label>
                        {field.type === 'team-select' || field.type === 'select' ? (
                          <select
                            value={(betDetails[field.name] as string) ?? ''}
                            onChange={(e) =>
                              setBetDetails((prev) => ({ ...prev, [field.name]: e.target.value }))
                            }
                            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            {(field.options ?? []).map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            type="number"
                            step="0.5"
                            value={(betDetails[field.name] as number) ?? ''}
                            onChange={(e) =>
                              setBetDetails((prev) => ({
                                ...prev,
                                [field.name]: parseFloat(e.target.value) || 0,
                              }))
                            }
                            className="mt-1"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setStep(3)}
                    disabled={!selectedBetType || loading}
                    className="flex-1"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Review and submit */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="p-3 rounded-md bg-muted/50 border border-border space-y-1">
                  <p className="text-sm font-medium">
                    {selectedGame?.awayTeam} @ {selectedGame?.homeTeam}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {selectedBetType === 'winner' && `Winner: ${betDetails.team ?? ''}`}
                    {selectedBetType === 'spread' &&
                      `Spread: ${betDetails.team ?? ''} ${betDetails.value ?? ''}`}
                    {selectedBetType === 'total' &&
                      `Total: ${betDetails.direction ?? ''} ${betDetails.value ?? ''}`}
                  </p>
                </div>

<p className="text-sm text-muted-foreground">Bragging rights only. No money, prizes, goods, or services.</p>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setStep(2)}>
                    Back
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex-1"
                  >
                    {submitting ? 'Sending…' : '⚔️ Send Challenge'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
