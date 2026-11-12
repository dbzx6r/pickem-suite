'use client';

import { useState, useEffect, useCallback } from 'react';

interface CountdownResult {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isLocked: boolean;
}

export function useCountdown(
  lockTime: string | Date,
  onLock?: () => void
): CountdownResult {
  const getTimeLeft = useCallback(() => {
    const now = Date.now();
    const lock = new Date(lockTime).getTime();
    const diff = lock - now;

    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, isLocked: true };

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return { days, hours, minutes, seconds, isLocked: false };
  }, [lockTime]);

  const [state, setState] = useState<CountdownResult>(getTimeLeft);

  useEffect(() => {
    const tick = () => {
      const next = getTimeLeft();
      setState((prev) => {
        if (!prev.isLocked && next.isLocked) {
          onLock?.();
        }
        return next;
      });
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [getTimeLeft, onLock]);

  return state;
}
