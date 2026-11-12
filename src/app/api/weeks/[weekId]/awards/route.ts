import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ weekId: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { weekId } = await params;
  const awards = await prisma.slateAward.findMany({
    where: { weekId },
    include: { user: { select: { id: true, profile: { select: { displayName: true, avatarUrl: true } } } } },
  });

  return NextResponse.json({ awards });
}
