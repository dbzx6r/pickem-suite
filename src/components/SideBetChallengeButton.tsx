'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Swords } from 'lucide-react';
import SideBetModal from './SideBetModal';

interface SideBetChallengeButtonProps {
  opponentId: string;
  opponentName: string;
  sport: 'nfl' | 'mlb';
}

export default function SideBetChallengeButton({
  opponentId,
  opponentName,
  sport,
}: SideBetChallengeButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="mb-4">
        <Swords className="w-4 h-4 mr-2" />
        Challenge to Side Bet
      </Button>
      <SideBetModal
        opponentId={opponentId}
        opponentName={opponentName}
        sport={sport}
        isOpen={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
