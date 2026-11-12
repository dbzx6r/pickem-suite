import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { gameId } = await params;
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });

  const options: Array<{
    betType: string;
    label: string;
    fields: Array<{ name: string; type: string; options?: string[]; default?: number }>;
  }> = [
    {
      betType: 'winner',
      label: 'Pick the winner',
      fields: [
        { name: 'team', type: 'team-select', options: [game.awayTeam, game.homeTeam] },
      ],
    },
  ];

  if (game.spreadLine !== null) {
    options.push({
      betType: 'spread',
      label: `Spread bet (${game.spreadLine})`,
      fields: [
        { name: 'team', type: 'team-select', options: [game.awayTeam, game.homeTeam] },
        { name: 'value', type: 'number', default: 3.5 },
      ],
    });
  }

  if (game.overUnder !== null) {
    options.push({
      betType: 'total',
      label: `Over/Under (${game.overUnder})`,
      fields: [
        { name: 'direction', type: 'select', options: ['over', 'under'] },
        { name: 'value', type: 'number', default: game.overUnder },
      ],
    });
  }

  return NextResponse.json({ options });
}
