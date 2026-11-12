'use client';

import { Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export default function ShareRecapButton({ title, text }: { title: string; text: string }) {
  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title, text, url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast.success('Recap copied');
  };
  return <Button variant="outline" onClick={() => void share()}><Share2 className="mr-2 h-4 w-4" />Share recap</Button>;
}

