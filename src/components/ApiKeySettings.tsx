'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Eye, EyeOff, RefreshCw, Copy, Check, Key } from 'lucide-react';
import { toast } from 'sonner';

export default function ApiKeySettings() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/user/apikey')
      .then(r => r.json())
      .then(d => setApiKey(d.apiKey))
      .catch(() => toast.error('Failed to load API key'))
      .finally(() => setLoading(false));
  }, []);

  const maskedKey = apiKey
    ? `sk-${'•'.repeat(20)}${apiKey.slice(-4)}`
    : 'sk-••••••••••••••••••••';

  const handleRegenerate = async () => {
    if (!confirm('This will invalidate your old key. Are you sure?')) return;
    setRegenerating(true);
    try {
      const res = await fetch('/api/user/apikey', { method: 'PATCH' });
      const data = await res.json();
      setApiKey(data.apiKey);
      setRevealed(true);
      toast.success('API key regenerated');
    } catch {
      toast.error('Failed to regenerate API key');
    } finally {
      setRegenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!apiKey) return;
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    toast.success('API key copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="bg-slate-900/50 border-slate-700/50 backdrop-blur">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Key className="h-5 w-5 text-emerald-400" />
          <CardTitle className="text-white">Automation API Key</CardTitle>
        </div>
        <CardDescription className="text-slate-400">
          Use this key to submit picks programmatically via the Automation API.{' '}
          <a href="/AUTOMATION_API.md" className="text-emerald-400 hover:underline" target="_blank">
            View API docs
          </a>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="h-10 bg-slate-800 animate-pulse rounded-md" />
        ) : (
          <>
            <div className="flex gap-2">
              <Input
                readOnly
                value={revealed && apiKey ? apiKey : maskedKey}
                className="font-mono bg-slate-800 border-slate-600 text-slate-200 flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setRevealed(r => !r)}
                className="border-slate-600 text-slate-300 hover:text-white shrink-0"
                title={revealed ? 'Hide key' : 'Reveal key'}
              >
                {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopy}
                disabled={!revealed}
                className="border-slate-600 text-slate-300 hover:text-white shrink-0"
                title="Copy to clipboard"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerate}
                disabled={regenerating}
                className="border-red-800/50 text-red-400 hover:bg-red-950/30 hover:text-red-300"
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-2 ${regenerating ? 'animate-spin' : ''}`} />
                Regenerate Key
              </Button>
              <Badge variant="outline" className="text-yellow-400 border-yellow-800/50 bg-yellow-950/20 text-xs">
                ⚠ Regenerating invalidates your old key
              </Badge>
            </div>
            <p className="text-xs text-slate-500">
              Keep this key private. It can submit picks on your behalf. Compatible with n8n, Ollama, and any HTTP client.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
