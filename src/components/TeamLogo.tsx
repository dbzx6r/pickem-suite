'use client';

import Image from 'next/image';
import { useState } from 'react';
import { NFL_TEAMS, getTeamLogoUrl } from '@/lib/espn';

interface TeamLogoProps {
  abbreviation: string;
  size?: number;
  className?: string;
  showName?: boolean;
}

export default function TeamLogo({
  abbreviation,
  size = 48,
  className = '',
  showName = false,
}: TeamLogoProps) {
  const [imgError, setImgError] = useState(false);
  const team = NFL_TEAMS[abbreviation];
  const logoUrl = getTeamLogoUrl(abbreviation);
  const teamColor = team?.color || '#1a2647';
  const initials = abbreviation.slice(0, 2);

  if (process.env.NEXT_PUBLIC_TEAM_LOGOS_ENABLED !== 'true' || imgError || !abbreviation) {
    return (
      <div
        className={`flex items-center justify-center rounded-full font-bold text-white ${className}`}
        style={{
          width: size,
          height: size,
          backgroundColor: teamColor,
          fontSize: size * 0.3,
        }}
      >
        {initials}
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <Image
        src={logoUrl}
        alt={team?.name || abbreviation}
        width={size}
        height={size}
        className="object-contain"
        onError={() => setImgError(true)}
      />
      {showName && team && (
        <span className="text-xs text-muted-foreground">{team.city}</span>
      )}
    </div>
  );
}
