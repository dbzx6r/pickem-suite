'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Trash2, Shield, UserPlus, ChevronDown, ChevronUp, KeyRound, X } from 'lucide-react';

interface User {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  profile: { displayName: string; avatarUrl: string | null } | null;
  weeklyScores: Array<{ points: number }>;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', displayName: '', role: 'USER' });
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [roleChanging, setRoleChanging] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/users')
      .then((r) => r.json())
      .then((d) => setUsers(d.users || []))
      .finally(() => setLoading(false));
  }, []);

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (res.ok) {
        setUsers((prev) => [d.user, ...prev]);
        setForm({ email: '', password: '', displayName: '', role: 'USER' });
        setShowCreate(false);
        toast.success(`User ${d.user.profile?.displayName || d.user.email} created`);
      } else {
        toast.error(d.error || 'Failed to create user');
      }
    } catch {
      toast.error('Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const resetUserPassword = async (userId: string) => {
    if (!resetPassword) return;
    setResetting(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, newPassword: resetPassword, action: 'reset_password' }),
      });
      const d = await res.json();
      if (res.ok) {
        toast.success('Temporary password set — user will be prompted to change it on next login');
        setResetUserId(null);
        setResetPassword('');
      } else {
        toast.error(d.error || 'Failed to reset password');
      }
    } catch {
      toast.error('Failed to reset password');
    } finally {
      setResetting(false);
    }
  };

  const deleteUser = async (user: User) => {
    const expected = `DELETE ${user.profile?.displayName || user.email}`;
    const confirmation = prompt(`This permanently deletes the account and may affect historical records. Type exactly:\n\n${expected}`);
    if (confirmation !== expected) return;
    const userId = user.id;
    setDeleting(userId);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, confirmation }),
      });
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== userId));
        toast.success('User deleted');
      } else {
        const d = await res.json();
        toast.error(d.error || 'Failed to delete');
      }
    } catch {
      toast.error('Failed to delete');
    } finally {
      setDeleting(null);
    }
  };

  const setCommissioner = async (user: User, makeCommissioner: boolean) => {
    const action = makeCommissioner ? 'grant' : 'revoke';
    if (!confirm(`${action === 'grant' ? 'Grant' : 'Revoke'} Commissioner access for ${user.profile?.displayName || user.email}? This changes administrative authority immediately.`)) return;
    setRoleChanging(user.id);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_role', userId: user.id, role: makeCommissioner ? 'ADMIN' : 'USER' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Role change failed');
      setUsers((current) => current.map((item) => item.id === user.id ? data.user : item));
      toast.success(makeCommissioner ? 'Commissioner access granted' : 'Commissioner access revoked');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Role change failed');
    } finally {
      setRoleChanging(null);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      {/* Create User */}
      <Card className="glass-card border-border">
        <CardHeader className="pb-2">
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="flex items-center justify-between w-full text-left"
          >
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Create User
            </CardTitle>
            {showCreate ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
        </CardHeader>
        {showCreate && (
          <CardContent>
            <form onSubmit={createUser} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="displayName">Display Name</Label>
                <Input id="displayName" placeholder="John Smith" value={form.displayName}
                  onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} required
                  className="bg-muted/50 border-border" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="john@example.com" value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required
                  className="bg-muted/50 border-border" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="password">Temporary Password</Label>
                <Input id="password" type="password" placeholder="12+ characters" minLength={12} value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required
                  className="bg-muted/50 border-border" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="role">Role</Label>
                <select id="role" value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  className="flex h-10 w-full rounded-md border px-3 py-2 text-sm bg-muted/50 border-border text-foreground">
                  <option value="USER">User</option>
                  <option value="ADMIN">Commissioner</option>
                </select>
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <Button type="submit" disabled={creating} className="min-w-32">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create User'}
                </Button>
              </div>
            </form>
          </CardContent>
        )}
      </Card>

      {/* User List */}
      <Card className="glass-card border-border">
        <CardHeader>
          <CardTitle>Users ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {users.map((user) => {
              const totalPoints = user.weeklyScores.reduce((sum, ws) => sum + ws.points, 0);
              const initials = (user.profile?.displayName || user.email).slice(0, 2).toUpperCase();
              const isResetting = resetUserId === user.id;
              return (
                <div key={user.id} className="py-3 border-b border-white/5 last:border-0">
                  <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap sm:gap-4">
                    <Avatar className="h-8 w-8 shrink-0">
                      {user.profile?.avatarUrl && (
                        <AvatarImage src={user.profile.avatarUrl} alt={user.profile?.displayName || user.email} />
                      )}
                      <AvatarFallback className="text-xs font-bold bg-primary/20 text-primary">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold truncate">
                          {user.profile?.displayName || user.email}
                        </span>
                        {user.role === 'ADMIN' && (
                          <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30 text-xs">
                            <Shield className="h-3 w-3 mr-1" />
                            Commissioner
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                    <div className="ml-auto shrink-0 text-right sm:ml-0">
                      <p className="font-semibold text-primary">{totalPoints} pts</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex w-full flex-wrap items-center justify-end gap-1 sm:w-auto sm:flex-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-yellow-400 hover:bg-yellow-500/10"
                        onClick={() => setCommissioner(user, user.role !== 'ADMIN')}
                        disabled={roleChanging === user.id}
                        title={user.role === 'ADMIN' ? 'Revoke commissioner access' : 'Grant commissioner access'}
                      >
                        {roleChanging === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : user.role === 'ADMIN' ? 'Revoke' : 'Make Commissioner'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                        onClick={() => { setResetUserId(isResetting ? null : user.id); setResetPassword(''); }}
                        title="Reset password"
                      >
                        {isResetting ? <X className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
                      </Button>
                      {user.role !== 'ADMIN' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          onClick={() => deleteUser(user)}
                          disabled={deleting === user.id}
                        >
                          {deleting === user.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                  {isResetting && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 sm:ml-12 sm:flex-nowrap">
                      <Input
                        type="password"
                        placeholder="Temporary password (12+ chars)"
                        value={resetPassword}
                        onChange={(e) => setResetPassword(e.target.value)}
                        className="h-9 min-w-0 flex-1 border-border bg-muted/50 text-sm"
                      />
                      <Button
                        size="sm"
                        onClick={() => resetUserPassword(user.id)}
                        disabled={resetting || resetPassword.length < 12}
                        className="shrink-0"
                      >
                        {resetting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Set'}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
