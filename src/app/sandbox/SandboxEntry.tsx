'use client';

import { useSandbox } from '@/contexts/SandboxContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FlaskConical } from 'lucide-react';

export default function SandboxEntry() {
  const { enterSandbox } = useSandbox();

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <Card className="bg-slate-900/50 border-orange-500/30 max-w-md w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-orange-500/20 flex items-center justify-center">
              <FlaskConical className="h-8 w-8 text-orange-400" />
            </div>
          </div>
          <CardTitle className="text-white text-2xl">Sandbox Mode</CardTitle>
          <CardDescription className="text-slate-400">
            Enter a safe test environment with fake data. No real picks, scores, or standings are affected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="text-sm text-slate-400 space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-orange-400 mt-0.5">🧪</span>
              <span>Uses a separate sandbox season and games</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-orange-400 mt-0.5">🔒</span>
              <span>Your real picks and stats are never touched</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-orange-400 mt-0.5">🏈</span>
              <span>Great for testing the automation API before going live</span>
            </li>
          </ul>
          <Button onClick={enterSandbox} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold">
            Enter Sandbox Mode
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
