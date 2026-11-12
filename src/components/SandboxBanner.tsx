'use client';

import { useSandbox } from '@/contexts/SandboxContext';
import { Button } from '@/components/ui/button';
import { FlaskConical } from 'lucide-react';

export default function SandboxBanner() {
  const { isSandbox, exitSandbox } = useSandbox();

  if (!isSandbox) return null;

  return (
    <div className="sticky top-0 z-[55] flex w-full flex-wrap items-center justify-between gap-2 bg-orange-500 px-3 py-2 text-sm font-medium text-white shadow-lg sm:px-4">
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <FlaskConical className="h-4 w-4 shrink-0" />
        <span className="leading-snug">🧪 SANDBOX MODE — This is test data only. No real scores are affected.</span>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={exitSandbox}
        className="border-white text-white hover:bg-white hover:text-orange-600 text-xs h-7 shrink-0"
      >
        Exit Sandbox
      </Button>
    </div>
  );
}
