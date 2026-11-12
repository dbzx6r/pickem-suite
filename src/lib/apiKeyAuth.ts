import { prisma } from '@/lib/prisma';

export async function authenticateApiKey(request: Request) {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const key = auth.slice(7);
  const user = await prisma.user.findUnique({ where: { apiKey: key } });
  return user ?? null;
}
