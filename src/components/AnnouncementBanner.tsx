'use client';

import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useState } from 'react';

interface AnnouncementBannerProps {
  message: string;
}

export default function AnnouncementBanner({ message }: AnnouncementBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="relative bg-primary/20 border border-primary/30 rounded-lg px-4 py-3 mb-6"
    >
      <p className="text-sm leading-relaxed text-foreground pr-8 whitespace-pre-line">
        {message.split(/(https:\/\/[^\s<>"']+)/g).map((part, index) =>
          part.startsWith('https://') ? (
            <a key={index} href={part} target="_blank" rel="noopener noreferrer"
              className="font-semibold underline underline-offset-2 break-words hover:text-primary">
              {part}
            </a>
          ) : part
        )}
      </p>
      <button
        aria-label="Dismiss announcement"
        onClick={() => setDismissed(true)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  );
}
