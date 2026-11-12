'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { NFL_TEAMS } from '@/lib/espn';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { THEMES, applyTheme } from '@/lib/themes';
import { mutate } from 'swr';

type Prefs = { theme: string; favoriteTeam: string | null; reducedMotion: boolean; notificationPreferences: { pickReminders?: boolean; leagueActivity?: boolean } };

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export default function ProfilePreferences() {
  const [prefs, setPrefs] = useState<Prefs>({ theme: 'midnight', favoriteTeam: null, reducedMotion: false, notificationPreferences: { pickReminders: true, leagueActivity: true } });
  const [pushEnabled, setPushEnabled] = useState(false);
  const [testingNotifications, setTestingNotifications] = useState(false);
  useEffect(() => {
    fetch('/api/user/preferences').then((response) => response.json()).then((data) => data.preferences && setPrefs(data.preferences));
    if ('serviceWorker' in navigator) navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription()).then((subscription) => setPushEnabled(Boolean(subscription))).catch(() => undefined);
  }, []);
  const save = async () => {
    const response = await fetch('/api/user/preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(prefs) });
    if (response.ok) {
      applyTheme(prefs.theme, prefs.favoriteTeam ? NFL_TEAMS[prefs.favoriteTeam]?.color : null);
      document.documentElement.dataset.reducedMotion = String(prefs.reducedMotion);
      void mutate('/api/leaderboard');
      toast.success('Preferences saved');
    } else toast.error('Could not save preferences');
  };
  const enableBrowserAlerts = async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return toast.error('Push notifications are unavailable in this browser');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return toast.error('Notification permission was not granted');
    const keyResponse = await fetch('/api/push/public-key');
    const keyData = await keyResponse.json();
    if (!keyResponse.ok) return toast.error(keyData.error || 'Push is not configured');
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(keyData.publicKey) });
    const response = await fetch('/api/push/subscriptions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subscription.toJSON()) });
    if (!response.ok) return toast.error('Could not register this device');
    setPushEnabled(true);
    toast.success('Browser push alerts enabled');
  };
  const testNotifications = async () => {
    setTestingNotifications(true);
    try {
      const response = await fetch('/api/notifications/test', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) return toast.error(data.error || 'Could not send a test alert');
      window.dispatchEvent(new Event('nfl:notifications-updated'));
      if (data.status === 'SENT') toast.success('Test push sent. It should appear on this device.');
      else if (data.status === 'FAILED') toast.error('The in-app alert was created, but browser push delivery failed.');
      else toast.success('In-app test alert created. Enable push on this device for browser alerts.');
    } finally {
      setTestingNotifications(false);
    }
  };
  const disableBrowserAlerts = async () => {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await fetch(`/api/push/subscriptions?endpoint=${encodeURIComponent(subscription.endpoint)}`, { method: 'DELETE' });
      await subscription.unsubscribe();
    }
    setPushEnabled(false);
    toast.success('Push alerts disabled on this device');
  };
  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      <fieldset className="min-w-0 sm:col-span-2">
        <legend className="text-lg font-bold">Make it your home field</legend>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">Choose your look, then save preferences. Your league, your colors.</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {THEMES.map(theme => <label key={theme.id} className={`relative cursor-pointer rounded-xl border p-3 transition-colors focus-within:ring-2 focus-within:ring-ring ${prefs.theme === theme.id ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-accent'}`}>
            <div className="mb-3 flex h-12 overflow-hidden rounded-lg border border-border" aria-hidden="true">{theme.colors.map((color, i) => <span key={i} className="flex-1" style={{ backgroundColor: theme.id === 'team' && i === 2 && prefs.favoriteTeam ? NFL_TEAMS[prefs.favoriteTeam]?.color : color }} />)}</div>
            <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{theme.name}</span><input type="radio" name="theme" value={theme.id} checked={prefs.theme === theme.id} onChange={() => setPrefs({ ...prefs, theme: theme.id })} className="h-4 w-4 shrink-0 accent-primary" /></div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{theme.description}</p>
          </label>)}
        </div>
      </fieldset>
      <div className="min-w-0">
        <Label htmlFor="favoriteTeam">Favorite team</Label>
        <select id="favoriteTeam" className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={prefs.favoriteTeam ?? ''} onChange={(event) => setPrefs({ ...prefs, favoriteTeam: event.target.value || null })}>
          <option value="">No favorite</option>
          {Object.entries(NFL_TEAMS).map(([abbr, team]) => <option key={abbr} value={abbr}>{team.city} {team.name}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={prefs.notificationPreferences?.pickReminders !== false} onChange={(event) => setPrefs({ ...prefs, notificationPreferences: { ...prefs.notificationPreferences, pickReminders: event.target.checked } })} />Pick and game-lock reminders</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={prefs.notificationPreferences?.leagueActivity !== false} onChange={(event) => setPrefs({ ...prefs, notificationPreferences: { ...prefs.notificationPreferences, leagueActivity: event.target.checked } })} />League activity and mentions</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={prefs.reducedMotion} onChange={(event) => setPrefs({ ...prefs, reducedMotion: event.target.checked })} />Reduce motion</label>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button onClick={save}>Save preferences</Button>
        {pushEnabled
          ? <Button variant="outline" onClick={disableBrowserAlerts}>Disable push on this device</Button>
          : <Button variant="outline" onClick={enableBrowserAlerts}>Enable real push alerts</Button>}
        <Button variant="outline" onClick={testNotifications} disabled={testingNotifications}>{testingNotifications ? 'Sending test…' : 'Send test alert'}</Button>
      </div>
      <p className="text-xs text-muted-foreground sm:col-span-2">On iPhone, add NFL Picks to your Home Screen before enabling browser push. Lock reminders and chat mentions are sent to each registered device.</p>
    </div>
  );
}
