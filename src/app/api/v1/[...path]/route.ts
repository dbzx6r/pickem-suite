import { handleMobile } from '@/lib/mobile-api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function route(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return handleMobile(request, (await context.params).path);
}
export { route as GET, route as POST, route as PUT, route as PATCH, route as DELETE };
