'use client';

import { useCountdown } from '@/hooks/useCountdown';
import { Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CountdownTimerProps {
  lockTime: string | Date;
  onLock?: () => void;
}

export default function CountdownTimer({ lockTime, onLock }: CountdownTimerProps) {
  const { days, hours, minutes, seconds, isLocked } = useCountdown(lockTime, onLock);

  if (isLocked) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-2 text-red-400 font-semibold"
      >
        <Clock className="h-4 w-4" />
        <span>Game locked 🔒</span>
      </motion.div>
    );
  }

  const segments = [
    ...(days > 0 ? [{ label: 'days', value: days }] : []),
    { label: 'hrs', value: hours },
    { label: 'min', value: minutes },
    { label: 'sec', value: seconds },
  ];

  const urgentColor = hours === 0 && days === 0 ? 'text-red-400' : 'text-primary';

  return (
    <div className={`flex items-center gap-2 font-mono ${urgentColor}`}>
      <Clock className="h-4 w-4 shrink-0" />
      <span className="text-sm text-muted-foreground">Next game locks in</span>
      <div className="flex items-center gap-1">
        <AnimatePresence mode="popLayout">
          {segments.map((seg, i) => (
            <span key={seg.label} className="flex items-center gap-1">
              <motion.span
                key={`${seg.label}-${seg.value}`}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="font-bold text-lg tabular-nums"
              >
                {String(seg.value).padStart(2, '0')}
              </motion.span>
              <span className="text-xs text-muted-foreground">{seg.label}</span>
              {i < segments.length - 1 && <span className="text-muted-foreground">:</span>}
            </span>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
