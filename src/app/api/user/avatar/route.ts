import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};
const MAX_SIZE = 12 * 1024 * 1024; // 12MB

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('avatar') as File | null;
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json({ error: 'Invalid file type. Use JPG, PNG, GIF, or WebP' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large. Max 12MB' }, { status: 400 });
  }

  const userId = session.user.id as string;
  const filename = `${userId}${ext}`;
  const uploadsDir = join('/app/uploads', 'avatars');
  const filePath = join(uploadsDir, filename);

  try {
    await mkdir(uploadsDir, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);
  } catch (err) {
    console.error('[avatar upload] write error:', err);
    return NextResponse.json({ error: 'Failed to save file. Check server logs.' }, { status: 500 });
  }

  const avatarUrl = `/api/uploads/avatars/${filename}`;

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
  if (user?.profileId) {
    await prisma.profile.update({ where: { id: user.profileId }, data: { avatarUrl } });
  }

  return NextResponse.json({ avatarUrl });
}
