'use client';

import { motion } from 'framer-motion';
import { Flame, Trophy } from 'lucide-react';

interface StreakBadgeProps {
  streak: number;
  type?: 'win' | 'pick';
}

export default function StreakBadge({ streak, type = 'win' }: StreakBadgeProps) {
  if (streak === 0) return null;

  const isHot = streak >= 3;
  const Icon = type === 'win' ? Trophy : Flame;

  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
        isHot
          ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
          : 'bg-primary/20 text-primary border border-primary/30'
      }`}
    >
      <Icon className={`h-3 w-3 ${isHot ? 'animate-pulse-football' : ''}`} />
      <span>{streak}W</span>
    </motion.div>
  );
}
