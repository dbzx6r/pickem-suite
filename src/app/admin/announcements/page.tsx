'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash2, Eye, EyeOff } from 'lucide-react';

interface Announcement {
  id: string;
  message: string;
  isActive: boolean;
  createdAt: string;
}

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchAnnouncements = () => {
    setLoading(true);
    fetch('/api/admin/announcements')
      .then((r) => r.json())
      .then((d) => setAnnouncements(d.announcements || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { const timer = window.setTimeout(() => void fetchAnnouncements(), 0); return () => window.clearTimeout(timer); }, []);

  const create = async () => {
    if (!message.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, isActive: true }),
      });
      if (res.ok) {
        toast.success('Announcement created!');
        setMessage('');
        fetchAnnouncements();
      } else {
        toast.error('Failed to create');
      }
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    const res = await fetch('/api/admin/announcements', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isActive: !current }),
    });
    if (res.ok) { toast.success('Updated'); fetchAnnouncements(); }
    else toast.error('Failed');
  };

  const deleteAnnouncement = async (id: string) => {
    if (!confirm('Delete this announcement?')) return;
    const res = await fetch('/api/admin/announcements', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) { toast.success('Deleted'); fetchAnnouncements(); }
    else toast.error('Failed');
  };

  return (
    <div className="space-y-6">
      <Card className="glass-card border-border">
        <CardHeader>
          <CardTitle>New Announcement</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="msg" className="mb-1 block">Message</Label>
              <Input
                id="msg"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="🏈 Week 5 picks are now open!"
                className="bg-muted/50 border-border"
                onKeyDown={(e) => e.key === 'Enter' && create()}
              />
            </div>
            <Button
              onClick={create}
              disabled={creating || !message.trim()}
              className="mt-5 gap-2"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Post
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card border-border">
        <CardHeader>
          <CardTitle>All Announcements</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <div className="space-y-3">
              {announcements.map((ann) => (
                <div key={ann.id} className="flex items-start gap-3 py-3 border-b border-white/5 last:border-0">
                  <div className="flex-1">
                    <p className="text-sm">{ann.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(ann.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {ann.isActive ? (
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Inactive</Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => toggleActive(ann.id, ann.isActive)}
                      title={ann.isActive ? 'Deactivate' : 'Activate'}
                    >
                      {ann.isActive ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-400 hover:text-red-300"
                      onClick={() => deleteAnnouncement(ann.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
              {announcements.length === 0 && (
                <p className="text-center text-muted-foreground py-6 text-sm">No announcements yet</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
