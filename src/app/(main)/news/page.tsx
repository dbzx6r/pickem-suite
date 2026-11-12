import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink } from 'lucide-react';

type Article = { id: number; headline: string; description: string; published: string; links?: { web?: { href?: string } }; categories?: Array<{ team?: { abbreviation?: string } }> };

export default async function NewsPage() {
  const session = await auth();
  const [user, settings] = await Promise.all([
    session?.user?.id ? prisma.user.findUnique({ where: { id: session.user.id }, select: { profile: { select: { favoriteTeam: true } } } }) : null,
    prisma.leagueSettings.findUnique({ where: { id: 'default' }, select: { newsEnabled: true } }),
  ]);
  const favorite = user?.profile?.favoriteTeam;
  if (process.env.ENABLE_ESPN_DATA !== 'true' || settings?.newsEnabled === false) return <div><h1 className="text-3xl font-black gradient-text">NFL News</h1><p className="mt-2 text-muted-foreground">The commissioner has disabled the news feed.</p></div>;
  let articles: Article[] = [];
  try {
    const response = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=30', { next: { revalidate: 300 } });
    if (response.ok) articles = ((await response.json()) as { articles?: Article[] }).articles ?? [];
  } catch {}
  const ordered = favorite ? [...articles].sort((a, b) => Number(Boolean(b.categories?.some((c) => c.team?.abbreviation === favorite))) - Number(Boolean(a.categories?.some((c) => c.team?.abbreviation === favorite)))) : articles;
  return <div className="space-y-5"><div><h1 className="text-2xl font-black gradient-text sm:text-3xl">NFL News</h1><p className="text-muted-foreground">Current reporting from ESPN, with favorite-team stories prioritized. Open the original source for full context.</p></div><div className="grid gap-3 md:grid-cols-2">{ordered.map((article) => { const favoriteStory = favorite && article.categories?.some((c) => c.team?.abbreviation === favorite); return <Card key={article.id} className={`glass-card min-w-0 ${favoriteStory ? 'border-primary/40' : 'border-border'}`}><CardContent className="min-w-0 p-4">{favoriteStory && <Badge className="mb-2">{favorite} favorite</Badge>}<h2 className="break-words font-bold leading-snug">{article.headline}</h2><p className="mt-2 break-words text-sm text-muted-foreground">{article.description}</p><div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{new Date(article.published).toLocaleString()}</span>{article.links?.web?.href && <a href={article.links.web.href} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 font-semibold text-primary">ESPN <ExternalLink className="h-3 w-3" /></a>}</div></CardContent></Card>; })}</div>{articles.length === 0 && <p className="py-12 text-center text-muted-foreground">News is temporarily unavailable.</p>}<p className="text-xs text-muted-foreground">Headlines and summaries are provided by ESPN and refresh approximately every five minutes.</p></div>;
}
