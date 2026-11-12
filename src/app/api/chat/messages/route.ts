import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rateLimit';
import { sendUserNotification } from '@/lib/push';
import { mentionedParticipantIds } from '@/lib/chat-mentions';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_MESSAGE_LENGTH = 500;

function parseCursor(at: string | null, id: string | null) {
  if (!at && !id) return null;
  if (!at || !id) return 'invalid' as const;
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return 'invalid' as const;
  return { at: date, id };
}

function noStoreJson(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return noStoreJson({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const requestedLimit = Number(searchParams.get('limit') ?? DEFAULT_LIMIT);
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;
  const after = parseCursor(searchParams.get('afterAt'), searchParams.get('afterId'));
  const before = parseCursor(searchParams.get('beforeAt'), searchParams.get('beforeId'));
  const legacySinceValue = searchParams.get('since');
  const legacySince = legacySinceValue ? new Date(legacySinceValue) : null;

  if (
    after === 'invalid' ||
    before === 'invalid' ||
    (legacySince && Number.isNaN(legacySince.getTime())) ||
    (after && before) ||
    (legacySince && (after || before))
  ) {
    return noStoreJson({ error: 'Invalid message cursor' }, { status: 400 });
  }

  let where: Prisma.ChatMessageWhereInput = {};
  let direction: Prisma.SortOrder = 'desc';

  if (after) {
    direction = 'asc';
    // Include the cursor timestamp and let the client deduplicate by ID. This
    // prevents missing a message inserted in the same database millisecond.
    where = { createdAt: { gte: after.at } };
  } else if (before) {
    where = {
      OR: [
        { createdAt: { lt: before.at } },
        { createdAt: before.at, id: { lt: before.id } },
      ],
    };
  } else if (legacySince) {
    // Backward compatibility for clients that loaded the previous chat bundle.
    direction = 'asc';
    where = { createdAt: { gt: legacySince } };
  }

  const rows = await prisma.chatMessage.findMany({
    where,
    orderBy: [{ createdAt: direction }, { id: direction }],
    take: limit,
    include: {
      user: {
        select: {
          id: true,
          profile: { select: { displayName: true, avatarUrl: true } },
        },
      },
      replyTo: { select: { id: true, text: true, user: { select: { profile: { select: { displayName: true } } } } } },
      reactions: { select: { emoji: true, userId: true } },
      mentions: { select: { userId: true } },
    },
  });

  const messages = direction === 'desc' ? rows.reverse() : rows;
  const [participants, pinnedMessage] = await Promise.all([
    prisma.user.findMany({ select: { id: true, profile: { select: { displayName: true } } }, orderBy: { createdAt: 'asc' } }),
    prisma.chatMessage.findFirst({
      where: { pinnedAt: { not: null } },
      orderBy: { pinnedAt: 'desc' },
      include: {
        user: { select: { id: true, profile: { select: { displayName: true, avatarUrl: true } } } },
        replyTo: { select: { id: true, text: true, user: { select: { profile: { select: { displayName: true } } } } } },
        reactions: { select: { emoji: true, userId: true } },
        mentions: { select: { userId: true } },
      },
    }),
  ]);
  return noStoreJson({ messages, pinnedMessage, participants: participants.map((user) => ({ id: user.id, displayName: user.profile?.displayName ?? 'Participant' })), hasMore: direction === 'desc' && rows.length === limit });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return noStoreJson({ error: 'Unauthorized' }, { status: 401 });
  const rateLimit = await checkRateLimit(`chat:${session.user.id}`, { maxRequests: 12, windowMs: 30_000 });
  if (!rateLimit.allowed) return noStoreJson({ error: 'Please wait before sending more messages' }, { status: 429 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return noStoreJson({ error: 'Invalid request body' }, { status: 400 });
  }

  const text =
    typeof body === 'object' && body !== null && 'text' in body
      ? (body as { text?: unknown }).text
      : null;
  if (typeof text !== 'string' || text.trim().length === 0) {
    return noStoreJson({ error: 'Message text required' }, { status: 400 });
  }

  const trimmedText = text.trim();
  if (trimmedText.length > MAX_MESSAGE_LENGTH) {
    return noStoreJson(
      { error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` },
      { status: 400 },
    );
  }

  const replyToId = typeof (body as { replyToId?: unknown }).replyToId === 'string'
    ? (body as { replyToId: string }).replyToId
    : null;
  if (replyToId) {
    const replyExists = await prisma.chatMessage.count({ where: { id: replyToId } });
    if (!replyExists) return noStoreJson({ error: 'Reply target no longer exists' }, { status: 400 });
  }
  const rawMentionIds = Array.isArray((body as { mentionedUserIds?: unknown }).mentionedUserIds)
    ? (body as { mentionedUserIds: unknown[] }).mentionedUserIds.filter((id): id is string => typeof id === 'string').slice(0, 20)
    : [];
  const mentionCandidates = rawMentionIds.length
    ? await prisma.user.findMany({ where: { id: { in: rawMentionIds } }, select: { id: true, profile: { select: { displayName: true, notificationPreferences: true } } } })
    : [];
  const verifiedMentionIds = new Set(mentionedParticipantIds(trimmedText, mentionCandidates.map((user) => ({ id: user.id, displayName: user.profile?.displayName ?? '' }))));
  const mentionedUsers = mentionCandidates.filter((user) => verifiedMentionIds.has(user.id));

  const message = await prisma.chatMessage.create({
    data: {
      userId: (session.user as { id: string }).id,
      text: trimmedText,
      appSource: 'nfl',
      replyToId,
      mentions: { create: mentionedUsers.filter((user) => user.id !== session.user.id).map((user) => ({ userId: user.id })) },
    },
    include: {
      user: {
        select: {
          id: true,
          profile: { select: { displayName: true, avatarUrl: true } },
        },
      },
      replyTo: { select: { id: true, text: true, user: { select: { profile: { select: { displayName: true } } } } } },
      reactions: { select: { emoji: true, userId: true } },
      mentions: { select: { userId: true } },
    },
  });

  const sender = message.user.profile?.displayName ?? 'A participant';
  await Promise.all(message.mentions.map((mention) => sendUserNotification({
    userId: mention.userId,
    type: 'CHAT_MENTION',
    title: `${sender} mentioned you`,
    message: trimmedText.slice(0, 160),
    href: '/?chat=open',
    dedupeKey: `chat-mention:${message.id}:${mention.userId}`,
    pushEnabled: ((mentionedUsers.find((user) => user.id === mention.userId)?.profile?.notificationPreferences ?? {}) as { leagueActivity?: boolean }).leagueActivity !== false,
  })));

  return noStoreJson({ message }, { status: 201 });
}
