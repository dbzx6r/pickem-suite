'use client';

import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import { ArrowDown, ChevronUp, Loader2, MessageCircle, Pin, RefreshCw, Reply, Send, X } from 'lucide-react';
import { activeMentionQuery, insertMention, mentionedParticipantIds } from '@/lib/chat-mentions';

const MESSAGE_LIMIT = 50;
const MAX_MESSAGE_LENGTH = 500;

interface ChatMessage {
  id: string;
  text: string;
  appSource: string;
  createdAt: string;
  user: {
    id: string;
    profile: { displayName: string; avatarUrl: string | null } | null;
  };
  replyTo: { id: string; text: string; user: { profile: { displayName: string } | null } } | null;
  reactions: Array<{ emoji: string; userId: string }>;
  mentions: Array<{ userId: string }>;
  pinnedAt: string | null;
}

type Participant = { id: string; displayName: string };

type FetchMode = 'initial' | 'newer' | 'older';

function timestampValue(message: ChatMessage): number {
  return new Date(message.createdAt).getTime();
}

function sortMessages(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort(
    (a, b) => timestampValue(a) - timestampValue(b) || a.id.localeCompare(b.id),
  );
}

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return sortMessages([...byId.values()]);
}

function localDateKey(value: string): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatDayLabel(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (localDateKey(value) === localDateKey(today.toISOString())) return 'Today';
  if (localDateKey(value) === localDateKey(yesterday.toISOString())) return 'Yesterday';

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

function formatSentAt(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function FloatingChat() {
  const { data: session, status } = useSession();
  const currentUserId = (session?.user as { id?: string } | undefined)?.id;
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === 'ADMIN';
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [mentionCaret, setMentionCaret] = useState(0);
  const [mentionChoice, setMentionChoice] = useState(0);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [unreadMarkerId, setUnreadMarkerId] = useState<string | null>(null);
  const [showJump, setShowJump] = useState(false);
  const [pinnedMessage, setPinnedMessage] = useState<ChatMessage | null>(null);
  const initializedRef = useRef(false);
  const fetchInFlightRef = useRef(false);
  const openRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const previousScrollHeightRef = useRef<number | null>(null);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    const openChat = () => {
      setOpen(true);
      setUnread(0);
    };
    window.addEventListener('nfl:chat-open', openChat);
    return () => window.removeEventListener('nfl:chat-open', openChat);
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const fetchMessages = useCallback(
    async (mode: FetchMode = 'newer') => {
      if (status !== 'authenticated' || fetchInFlightRef.current) return;
      fetchInFlightRef.current = true;
      const existing = messagesRef.current;
      const params = new URLSearchParams({ limit: String(MESSAGE_LIMIT) });

      if (mode === 'newer' && existing.length > 0) {
        const latest = existing[existing.length - 1];
        params.set('afterAt', latest.createdAt);
        params.set('afterId', latest.id);
      }
      if (mode === 'older' && existing.length > 0) {
        const oldest = existing[0];
        params.set('beforeAt', oldest.createdAt);
        params.set('beforeId', oldest.id);
        previousScrollHeightRef.current = scrollAreaRef.current?.scrollHeight ?? null;
        setLoadingOlder(true);
      } else if (mode === 'initial') {
        setLoading(true);
      }

      try {
        const res = await fetch(`/api/chat/messages?${params.toString()}`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error('Could not refresh chat');

        const data = (await res.json()) as { messages?: ChatMessage[]; participants?: Participant[]; pinnedMessage?: ChatMessage | null; hasMore?: boolean };
        const incoming = data.messages ?? [];
        const existingIds = new Set(existing.map((message) => message.id));
        const unseenFromOthers = incoming.filter(
          (message) => !existingIds.has(message.id) && message.user.id !== currentUserId,
        ).length;

        setMessages((current) => mergeMessages(current, incoming));
        if (data.participants) setParticipants(data.participants);
        if ('pinnedMessage' in data) setPinnedMessage(data.pinnedMessage ?? null);
        const firstUnseen = incoming.find((message) => !existingIds.has(message.id) && message.user.id !== currentUserId);
        if (firstUnseen && (!openRef.current || !shouldAutoScrollRef.current)) setUnreadMarkerId((current) => current ?? firstUnseen.id);
        if (mode !== 'newer') setHasMore(Boolean(data.hasMore));
        if (mode === 'newer' && initializedRef.current && !openRef.current && unseenFromOthers > 0) {
          setUnread((count) => count + unseenFromOthers);
        }
        initializedRef.current = true;
        setLastUpdated(new Date());
        setFetchError(null);
      } catch {
        setFetchError('Chat is having trouble reconnecting.');
      } finally {
        fetchInFlightRef.current = false;
        setLoading(false);
        setLoadingOlder(false);
      }
    },
    [currentUserId, status],
  );

  useEffect(() => {
    if (status !== 'authenticated' || initializedRef.current) return;
    void fetchMessages('initial');
  }, [fetchMessages, status]);

  useEffect(() => {
    if (status !== 'authenticated' || !window.location.search.includes('chat=open')) return;
    const timer = window.setTimeout(() => setOpen(true), 0);
    return () => window.clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    if (status !== 'unauthenticated') return;
    initializedRef.current = false;
    fetchInFlightRef.current = false;
    messagesRef.current = [];
    const timer = window.setTimeout(() => {
      setMessages([]);
      setParticipants([]);
      setUnread(0);
      setLastUpdated(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    const refresh = () => {
      if (document.visibilityState === 'visible') void fetchMessages('newer');
    };
    const interval = window.setInterval(refresh, 5000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [fetchMessages, status]);

  useEffect(() => {
    if (!open) return;
    shouldAutoScrollRef.current = true;
    window.setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, [open]);

  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;

    if (previousScrollHeightRef.current !== null) {
      scrollArea.scrollTop += scrollArea.scrollHeight - previousScrollHeightRef.current;
      previousScrollHeightRef.current = null;
      return;
    }
    if (open && shouldAutoScrollRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          replyToId: replyingTo?.id ?? null,
          mentionedUserIds: mentionedParticipantIds(text, participants),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Message could not be sent');

      setMessages((current) => mergeMessages(current, [data.message]));
      setInput('');
      setReplyingTo(null);
      shouldAutoScrollRef.current = true;
      setLastUpdated(new Date());
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Message could not be sent');
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void send();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionSuggestions.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setMentionChoice((current) => {
          const direction = event.key === 'ArrowDown' ? 1 : -1;
          return (current + direction + mentionSuggestions.length) % mentionSuggestions.length;
        });
        return;
      }
      if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
        event.preventDefault();
        chooseMention(mentionSuggestions[mentionChoice] ?? mentionSuggestions[0]);
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  const mention = activeMentionQuery(input, mentionCaret);
  const mentionSuggestions = mention
    ? participants
        .filter((participant) => participant.id !== currentUserId)
        .filter((participant) => participant.displayName.toLowerCase().includes(mention.query.trim().toLowerCase()))
        .slice(0, 6)
    : [];

  const chooseMention = (participant: Participant) => {
    const inserted = insertMention(input, mentionCaret, participant.displayName);
    setInput(inserted.text);
    setMentionCaret(inserted.caret);
    setMentionChoice(0);
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(inserted.caret, inserted.caret);
    }, 0);
  };

  const handleScroll = () => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;
    shouldAutoScrollRef.current =
      scrollArea.scrollHeight - scrollArea.scrollTop - scrollArea.clientHeight < 80;
    setShowJump(!shouldAutoScrollRef.current);
  };

  const jumpToNewest = () => {
    shouldAutoScrollRef.current = true;
    setShowJump(false);
    setUnreadMarkerId(null);
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const react = async (messageId: string, emoji: string) => {
    const response = await fetch(`/api/chat/messages/${messageId}/reactions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emoji }) });
    if (!response.ok) return;
    const data = await response.json() as { reactions: ChatMessage['reactions'] };
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, reactions: data.reactions } : message));
  };

  const togglePin = async (message: ChatMessage) => {
    const response = await fetch(`/api/chat/messages/${message.id}/pin`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pinned: !message.pinnedAt }) });
    if (response.ok) {
      const updated = { ...message, pinnedAt: message.pinnedAt ? null : new Date().toISOString() };
      setMessages((current) => current.map((item) => item.id === message.id ? updated : item));
      setPinnedMessage(updated.pinnedAt ? updated : null);
    }
  };

  if (status !== 'authenticated') return null;

  return (
    <div className="chat-dock fixed inset-x-2 z-[60] flex flex-col items-end gap-2 sm:left-auto sm:right-6 sm:w-96">
      {open && (
        <section
          aria-label="League group chat"
          className="chat-panel flex min-h-0 w-full max-w-full flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
        >
          <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/50 py-2 pl-4 pr-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">League Chat</span>
                <span
                  className={`h-2 w-2 rounded-full ${fetchError ? 'bg-amber-400' : 'bg-emerald-400'}`}
                  aria-label={fetchError ? 'Connection issue' : 'Live updates connected'}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                {fetchError
                  ? 'Trying to reconnect…'
                  : lastUpdated
                    ? `Updated ${lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
                    : 'Connecting…'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Close group chat"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          {fetchError && (
            <button
              type="button"
              onClick={() => void fetchMessages(messages.length ? 'newer' : 'initial')}
              className="flex items-center justify-center gap-1.5 border-b border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300"
            >
              <RefreshCw className="h-3 w-3" />
              Reconnect chat
            </button>
          )}

          {pinnedMessage && <div className="border-b border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs"><div className="flex items-center gap-1 font-semibold text-amber-300"><Pin className="h-3 w-3" />Commissioner pin</div><p className="mt-0.5 line-clamp-2">{pinnedMessage.text}</p></div>}

          <div
            ref={scrollAreaRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto p-3"
          >
            {hasMore && (
              <div className="mb-3 text-center">
                <button
                  type="button"
                  onClick={() => void fetchMessages('older')}
                  disabled={loadingOlder}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  {loadingOlder ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronUp className="h-3 w-3" />}
                  Load earlier messages
                </button>
              </div>
            )}

            {loading && messages.length === 0 && (
              <div className="flex items-center justify-center gap-2 pt-10 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading chat…
              </div>
            )}
            {!loading && messages.length === 0 && (
              <p className="pt-10 text-center text-xs text-muted-foreground">No messages yet. Say hi! 👋</p>
            )}

            <div className="space-y-2">
              {messages.map((message, index) => {
                const previous = messages[index - 1];
                const showDay = !previous || localDateKey(previous.createdAt) !== localDateKey(message.createdAt);
                const isMe = message.user.id === currentUserId;
                const name = message.user.profile?.displayName ?? 'Unknown';
                const initials = name
                  .split(' ')
                  .map((part) => part[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase();
                const appBadgeColor =
                  message.appSource === 'nfl'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-orange-500/20 text-orange-400';

                return (
                  <div key={message.id}>
                    {unreadMarkerId === message.id && <div className="my-3 flex items-center gap-2"><div className="h-px flex-1 bg-red-400/60" /><span className="text-[10px] font-semibold text-red-300">New messages</span><div className="h-px flex-1 bg-red-400/60" /></div>}
                    {showDay && (
                      <div className="my-3 flex items-center gap-2" aria-label={`Messages from ${formatDayLabel(message.createdAt)}`}>
                        <div className="h-px flex-1 bg-accent" />
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {formatDayLabel(message.createdAt)}
                        </span>
                        <div className="h-px flex-1 bg-accent" />
                      </div>
                    )}
                    <div className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
                      {message.user.profile?.avatarUrl ? (
                        <Image
                          src={message.user.profile.avatarUrl}
                          alt={name}
                          width={28}
                          height={28}
                          unoptimized
                          className="h-7 w-7 flex-shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold">
                          {initials}
                        </div>
                      )}
                      <div className={`flex max-w-[78%] flex-col space-y-0.5 ${isMe ? 'items-end' : 'items-start'}`}>
                        <div className="flex items-center gap-1">
                          {!isMe && <span className="text-[10px] text-muted-foreground">{name}</span>}
                          <span className={`rounded px-1 text-[9px] ${appBadgeColor}`}>
                            {message.appSource.toUpperCase()}
                          </span>
                        </div>
                        {message.replyTo && <div className="max-w-full rounded border-l-2 border-primary/50 bg-black/20 px-2 py-1 text-[10px] text-muted-foreground"><b>{message.replyTo.user.profile?.displayName ?? 'Participant'}</b>: {message.replyTo.text.slice(0, 90)}</div>}
                        <div
                          className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-2xl px-3 py-2 text-xs ${
                            isMe
                              ? 'rounded-tr-sm bg-primary text-primary-foreground'
                              : 'rounded-tl-sm bg-accent'
                          }`}
                        >
                          {message.text}
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          {['👍', '🔥', '😂'].map((emoji) => { const count = message.reactions.filter((reaction) => reaction.emoji === emoji).length; const mine = message.reactions.some((reaction) => reaction.emoji === emoji && reaction.userId === currentUserId); return <button key={emoji} type="button" onClick={() => void react(message.id, emoji)} className={`rounded-full border px-1.5 py-0.5 text-[10px] ${mine ? 'border-primary bg-primary/20' : 'border-border'}`}>{emoji}{count ? ` ${count}` : ''}</button>; })}
                          <button type="button" onClick={() => setReplyingTo(message)} className="rounded p-1 text-muted-foreground hover:text-foreground" title="Reply"><Reply className="h-3 w-3" /></button>
                          {isAdmin && <button type="button" onClick={() => void togglePin(message)} className={`rounded p-1 ${message.pinnedAt ? 'text-amber-300' : 'text-muted-foreground hover:text-foreground'}`} title={message.pinnedAt ? 'Unpin' : 'Pin'}><Pin className="h-3 w-3" /></button>}
                        </div>
                        <time
                          dateTime={message.createdAt}
                          title={formatSentAt(message.createdAt)}
                          className="text-[9px] text-muted-foreground"
                        >
                          {formatSentAt(message.createdAt)}
                        </time>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div ref={bottomRef} />
          </div>

          {showJump && <button type="button" onClick={jumpToNewest} className="absolute bottom-24 right-4 flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-lg"><ArrowDown className="h-3 w-3" />Newest</button>}

          <form onSubmit={handleSubmit} className="border-t border-border p-3">
            {sendError && <p className="mb-2 text-xs text-red-400">{sendError}</p>}
            {replyingTo && <div className="mb-2 flex items-center justify-between rounded border border-border bg-muted/50 px-2 py-1 text-[10px]"><span>Replying to <b>{replyingTo.user.profile?.displayName ?? 'Participant'}</b>: {replyingTo.text.slice(0, 60)}</span><button type="button" onClick={() => setReplyingTo(null)}><X className="h-3 w-3" /></button></div>}
            <div className="relative flex items-end gap-2">
              <div className="min-w-0 flex-1">
                {mentionSuggestions.length > 0 && (
                  <div className="absolute bottom-full left-0 right-0 z-10 mb-2 max-h-48 overflow-y-auto rounded-xl border border-border bg-background p-1 shadow-2xl" role="listbox" aria-label="Mention a league participant">
                    {mentionSuggestions.map((participant, index) => (
                      <button
                        key={participant.id}
                        type="button"
                        role="option"
                        aria-selected={index === mentionChoice}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => chooseMention(participant)}
                        className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm ${index === mentionChoice ? 'bg-primary/20 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
                      >
                        @{participant.displayName}
                      </button>
                    ))}
                  </div>
                )}
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(event) => {
                    setInput(event.target.value);
                    setMentionCaret(event.target.selectionStart);
                    setMentionChoice(0);
                    if (sendError) setSendError(null);
                  }}
                  onClick={(event) => setMentionCaret(event.currentTarget.selectionStart)}
                  onKeyUp={(event) => setMentionCaret(event.currentTarget.selectionStart)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message… use @Display Name to mention"
                  maxLength={MAX_MESSAGE_LENGTH}
                  rows={2}
                  className="max-h-28 min-h-10 w-full resize-none rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm outline-none transition-colors focus:border-primary/50"
                  aria-label="Chat message"
                />
                <div className="mt-0.5 flex justify-end gap-2 px-1 text-[9px] text-muted-foreground sm:justify-between">
                  <span className="hidden sm:inline">Enter to send · Shift+Enter for a new line</span>
                  <span className="shrink-0">{input.length}/{MAX_MESSAGE_LENGTH}</span>
                </div>
              </div>
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Send message"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => { setOpen((isOpen) => !isOpen); if (!open) setUnread(0); }}
        className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={open ? 'Close league chat' : 'Open league chat'}
        aria-expanded={open}
      >
        <MessageCircle className="h-6 w-6" />
        {unread > 0 && !open && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    </div>
  );
}
