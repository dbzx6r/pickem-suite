import { nativeRemindersEnabled, reminderSettings, registerReminderDevice, removeReminderDevices } from './native-reminders';
import { liveActivitiesEnabled, registerLiveActivity, removeLiveActivity } from './live-activities';
import { createPickReminders } from './pick-reminders';
import { gradeFinalPick } from './pick-scoring';
import { mobileProfile, mobileParticipation, mobileChallenges, mobileRecords } from './mobile-players';
import { getLeaderboard } from './scoring';
import { standingsWeek } from './standings-week';
import { mobileExperience } from './mobile-experience';
import { prisma } from './prisma';
import { account, authenticateMobile, mobileLogin, mobileLimit, MobileError, revokeMobileSession } from './mobile-auth';
import { getOpenWeekIds } from './pick-window';
import { gamePickOpen, lockAndCheckGame, saveTiebreakerSafely } from './game-lock';
import { tiebreakerValidationError } from './pick-validation';
import { rankWeeklyEntries } from './ranking';
import { checkAndAwardAchievements } from './achievements';

function reply(body: unknown, status = 200) { return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Authorization', 'X-Content-Type-Options': 'nosniff' } }); }
async function json(request: Request, keys: string[]) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new MobileError(415, 'JSON required.');
  // Bound the streaming body, including clients that omit Content-Length.
  const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  if (reader) { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 8192) { await reader.cancel(); throw new MobileError(413, 'Request too large.'); } chunks.push(value); } }
  let data;
  try { data = JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new MobileError(400, 'Invalid JSON.'); }
  if (!data || Array.isArray(data) || typeof data !== 'object' || Object.keys(data).some(key => !keys.includes(key))) throw new MobileError(400, 'Unsupported fields.');
  return data as Record<string, unknown>;
}
async function context(id: string) {
  const season = await prisma.season.findFirst({ where: { id, isActive: true, isSandbox: false } });
  if (!season) throw new MobileError(404, 'Active league not found. Refresh your leagues.');
  const [weeks, settings] = await Promise.all([
    prisma.week.findMany({ where: { seasonId: season.id }, orderBy: { weekNumber: 'asc' }, include: { games: { orderBy: { startTime: 'asc' } } } }),
    prisma.leagueSettings.findUnique({ where: { id: 'default' } }),
  ]);
  const open = getOpenWeekIds(weeks, new Date(), settings?.pickWindowWeeks ?? 2);
  return { season, weeks, settings, open };
}
export async function handleMobile(request: Request, path: string[]) {
  try {
    const key = path.join('/'); const method = request.method;
    // This API authenticates native Bearer sessions only; website cookies confer no access.
    if (request.headers.has('origin')) throw new MobileError(403, 'Use the native app for this API.');
    if (key === 'capabilities' && method === 'GET') return reply({ apiVersion: 1, country: 'US', stakesEnabled: false, environment: 'personal', registrationEnabled: false, leagueCreationEnabled: false, managementEnabled: false, accountDeletionEnabled: false, syntheticSchedule: false, rankingPolicy: 'legacy-deterministic', features: [...(nativeRemindersEnabled() ? ['pick-reminders'] : []), ...(liveActivitiesEnabled() ? ['live-activities'] : []), 'login', 'leagues', 'picks', 'tiebreakers', 'standings', 'members', 'preferences', 'chat', 'odds', 'team-logos', 'profiles', 'participation', 'challenges', 'inbox', 'calendar', 'records'] });
    if (key === 'auth/login' && method === 'POST') return reply(await mobileLogin(request, await json(request, ['email', 'password', 'client'])));
    const user = await authenticateMobile(request);
    if (key === 'auth/logout' && method === 'POST') { await removeLiveActivity(request, user); await removeReminderDevices(request, user); await revokeMobileSession(request); return reply({ ok: true }); }
    if (user.mustChangePassword) throw new MobileError(403, 'Change your password on the website before using the app.');
    await mobileLimit(`mobile-requests:${user.id}`, 180, 60_000);
    if (key === 'live-activities' && method === 'POST') return reply(await registerLiveActivity(request, user, await json(request, ['activityId', 'gameId', 'token', 'environment'])));
    if (key === 'live-activities' && method === 'DELETE') { const body = await json(request, ['activityId']); if (typeof body.activityId !== 'string') throw new MobileError(400, 'Activity required.'); return reply(await removeLiveActivity(request, user, body.activityId)); }
    if (key === 'pick-reminders' && method === 'GET') return reply(await reminderSettings(request, user));
    if (key === 'pick-reminders' && method === 'POST') return reply(await registerReminderDevice(request, user, await json(request, ['token', 'environment'])));
    if (key === 'pick-reminders' && method === 'DELETE') return reply(await removeReminderDevices(request, user));
    const experience = await mobileExperience(request, key, user, json);
    if (experience) return reply(experience.body, experience.status ?? 200);
    if (key === 'inbox' && method === 'GET') {
      await createPickReminders(user.id);
      const [notifications, announcements] = await Promise.all([
        prisma.notification.findMany({ where: { userId: user.id }, select: { id: true, title: true, message: true, readAt: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 100 }),
        prisma.announcement.findMany({ where: { isActive: true }, select: { id: true, message: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 20 }),
      ]);
      return reply({ notifications, announcements });
    }
    if (key === 'inbox' && method === 'PATCH') {
      const body = await json(request, ['id', 'all']);
      if (body.all !== true && (typeof body.id !== 'string' || body.id.length > 100)) throw new MobileError(400, 'Choose a notification.');
      await prisma.notification.updateMany({ where: { userId: user.id, ...(body.all === true ? { readAt: null } : { id: body.id as string }) }, data: { readAt: new Date() } });
      return reply({ ok: true });
    }
    if (key === 'me' && method === 'GET') return reply({ account: account(user) });
    if (key === 'leagues' && method === 'GET') {
      const [seasons, settings] = await Promise.all([prisma.season.findMany({ where: { isActive: true, isSandbox: false } }), prisma.leagueSettings.findUnique({ where: { id: 'default' } })]);
      return reply({ leagues: seasons.map(s => ({ id: s.id, name: settings?.leagueName ?? 'NFL Picks', season: s.year, role: user.role === 'ADMIN' ? 'COMMISSIONER' : 'PLAYER', plan: 'FREE', canPick: user.role !== 'ADMIN' })) });
    }
    if (path[0] !== 'leagues' || !path[1]) throw new MobileError(404, 'This action is available on the personal website only.');
    const ctx = await context(path[1]);
    if (path.length === 3 && path[2] === 'records' && method === 'GET') return reply(await mobileRecords());
    if (path.length === 3 && path[2] === 'calendar' && method === 'GET') return reply({ games: ctx.weeks.flatMap(w => w.games.map(g => ({ id: g.id, week: w.weekNumber, home: g.homeTeam, away: g.awayTeam, startsAt: g.startTime.toISOString(), status: g.isFinal ? 'FINAL' : g.statusState === 'in' ? 'LIVE' : !g.statusState || g.statusState === 'pre' ? 'SCHEDULED' : 'UNAVAILABLE' }))) });
    if (path.length === 4 && path[2] === 'profiles' && method === 'GET') return reply(await mobileProfile(path[3], user.id, ctx.season.id));
    if (path[2] === 'challenges') return reply(await mobileChallenges(request, path, user, ctx.season.id, json));
    if (path.length === 3 && path[2] === 'weeks' && method === 'GET') return reply({ weeks: ctx.weeks.map(w => w.weekNumber), standingsWeek: standingsWeek(ctx.weeks, new Date()), currentWeek: (ctx.weeks.find(w => !w.isFinal) ?? ctx.weeks.at(-1))?.weekNumber ?? null });
    if (path.length === 3 && path[2] === 'standings' && method === 'GET') {
      // Same recorded totals and stable points-only ordering as the website.
      const entries = (await getLeaderboard(false)).sort((a, b) => b.totalPoints - a.totalPoints);
      return reply({ season: ctx.season.year, standings: entries.map((entry, index) => ({ account_id: entry.id, display_name: entry.displayName, points: entry.totalPoints, rank: index + 1 })) });
    }
    if (path.length === 3 && path[2] === 'members' && method === 'GET') {
      const members = await prisma.user.findMany({ select: { id: true, role: true, profile: { select: { displayName: true } } }, orderBy: { createdAt: 'asc' } });
      return reply({ members: members.map(m => ({ account_id: m.id, display_name: m.profile?.displayName ?? 'Player', role: m.role === 'ADMIN' ? 'COMMISSIONER' : 'PLAYER', status: 'ACTIVE' })) });
    }
    if (path.length === 3 && path[2] === 'picks' && method === 'PUT') {
      if (user.role === 'ADMIN') throw new MobileError(403, 'Commissioners do not make picks.');
      const body = await json(request, ['gameId', 'team']);
      if (typeof body.gameId !== 'string' || typeof body.team !== 'string') throw new MobileError(400, 'Game and team required.');
      const week = ctx.weeks.find(w => w.games.some(g => g.id === body.gameId));
      const game = week?.games.find(g => g.id === body.gameId);
      if (!week || !game) throw new MobileError(404, 'Game not found in this league.');
      if (!ctx.open.has(week.id)) throw new MobileError(403, 'This week is outside the pick window.');
      if (![game.homeTeam, game.awayTeam].includes(body.team)) throw new MobileError(400, 'Invalid team.');
      const pickedTeam = body.team;
      const saved = await prisma.$transaction(async tx => {
        if (!(await lockAndCheckGame(tx, game.id))) return false;
        // Recheck account/season after waiting on the game lock.
        const current = await tx.user.findUnique({ where: { id: user.id } });
        const active = await tx.season.findUnique({ where: { id: ctx.season.id } });
        const currentWeek = await tx.week.findUnique({ where: { id: week.id } });
        if (!current || current.role !== 'USER' || current.mustChangePassword || current.sessionVersion !== user.sessionVersion || !active?.isActive || currentWeek?.isFinal) throw new MobileError(403, 'Refresh before submitting.');
        const existing = await tx.pick.findUnique({ where: { userId_gameId: { userId: user.id, gameId: game.id } } });
        if (existing?.pickedTeam === pickedTeam && !existing.isAutoPick) return true;
        const pick = existing ? await tx.pick.update({ where: { id: existing.id }, data: { pickedTeam, isAutoPick: false, editCount: { increment: 1 } } }) : await tx.pick.create({ data: { userId: user.id, weekId: week.id, gameId: game.id, pickedTeam } });
        await tx.pickRevision.create({ data: { pickId: pick.id, userId: user.id, weekId: week.id, gameId: game.id, previousTeam: existing?.pickedTeam ?? null, pickedTeam, source: 'ios' } });
        return true;
      });
      if (!saved) throw new MobileError(403, 'This game is locked. Your previous pick was kept.');
      checkAndAwardAchievements(user.id, prisma, week.id).catch(() => console.error('Mobile pick achievement update failed'));
      return reply({ ok: true });
    }
    if (path[2] !== 'weeks' || path.length !== 5 || !/^\d+$/.test(path[3])) throw new MobileError(404, 'Manage this personal league on the website.');
    const week = ctx.weeks.find(w => w.weekNumber === Number(path[3]));
    if (!week) throw new MobileError(404, 'Week not found.');
    if (path[4] === 'participation' && method === 'GET') return reply(await mobileParticipation(week.id));
    if (path[4] === 'slate' && method === 'GET') {
      const [picks, guess, locks] = await Promise.all([
        prisma.pick.findMany({ where: { userId: user.id, weekId: week.id }, select: { gameId: true, pickedTeam: true } }),
        prisma.tiebreaker.findUnique({ where: { userId_weekId: { userId: user.id, weekId: week.id } } }),
        prisma.auditLog.findMany({ where: { id: { in: week.games.map(g => `game-lock:${g.id}`) } }, select: { targetId: true, createdAt: true } }),
      ]);
      return reply({ games: week.games.map(g => ({ id: g.id, season: ctx.season.year, week: week.weekNumber, source: 'personal-server', home: g.homeTeam, away: g.awayTeam, starts_at: g.startTime.toISOString(), status: g.isFinal ? 'FINAL' : (!g.statusState || g.statusState === 'pre') ? 'SCHEDULED' : g.statusState === 'in' ? 'LIVE' : 'UNAVAILABLE', locked_at: locks.find(l => l.targetId === g.id)?.createdAt.toISOString() ?? null, home_score: g.homeScore, away_score: g.awayScore, spread_line: g.spreadLine, over_under: g.overUnder, odds_provider: g.oddsProvider, context_updated_at: g.contextUpdatedAt?.toISOString() ?? null, broadcast: g.broadcast, venue: g.venue, weather: g.weather, home_record: g.homeRecord, away_record: g.awayRecord, period: g.period, clock: g.clock, possession: g.possession, down_distance: g.downDistance, home_quarters: [g.homeScoreQ1,g.homeScoreQ2,g.homeScoreQ3,g.homeScoreQ4], away_quarters: [g.awayScoreQ1,g.awayScoreQ2,g.awayScoreQ3,g.awayScoreQ4] })), picks: picks.map(p => ({ game_id: p.gameId, team: p.pickedTeam })), rules: { double_game_id: week.doubleGameId, tiebreaker_game_id: week.tiebreakerGameId }, tiebreaker: guess?.guessedTotal ?? null, openWeeks: user.role === 'ADMIN' ? [] : ctx.weeks.filter(w => ctx.open.has(w.id)).map(w => w.weekNumber), serverTime: new Date().toISOString() });
    }
    if (path[4] === 'standings' && method === 'GET') {
      const [picks, scores, guesses] = await Promise.all([
        prisma.pick.findMany({ where: { weekId: week.id, user: { role: 'USER' } }, include: { user: { select: { profile: { select: { displayName: true } } } } } }),
        prisma.weeklyScore.findMany({ where: { weekId: week.id } }),
        prisma.tiebreaker.findMany({ where: { weekId: week.id } }),
      ]);
      const tb = week.games.find(g => g.id === week.tiebreakerGameId);
      const revealed = Boolean(tb?.isFinal && tb.homeScore !== null && tb.awayScore !== null);
      const entries = [...new Set(picks.map(p => p.userId))].map(userId => {
        const own = picks.filter(p => p.userId === userId); const score = scores.find(s => s.userId === userId);
        const points = own.reduce((sum, p) => { const g = week.games.find(g => g.id === p.gameId); return sum + (g ? gradeFinalPick(g, p.pickedTeam, week.doubleGameId)?.pointsEarned ?? 0 : 0); }, 0);
        return { userId, effectivePoints: score?.adminOverridePoints ?? (week.isFinal && score ? score.points : points), tbDiff: revealed ? guesses.find(t => t.userId === userId)?.difference ?? null : null, displayName: own[0].user.profile?.displayName ?? 'Player', storedRank: week.isFinal ? score?.finalRank : null };
      });
      const rows = rankWeeklyEntries(week.id, entries).map(e => ({ account_id: e.userId, display_name: e.displayName, points: e.effectivePoints, difference: e.tbDiff, rank: e.storedRank ?? e.finalRank }));
      return reply({ isFinal: week.isFinal, week: week.weekNumber, standings: rows.sort((a, b) => a.rank - b.rank) });
    }
    if (path[4] === 'tiebreaker' && method === 'PUT') {
      if (user.role === 'ADMIN') throw new MobileError(403, 'Commissioners do not make picks.');
      const body = await json(request, ['total']); const error = tiebreakerValidationError(body.total);
      if (error) throw new MobileError(400, error);
      if (!ctx.open.has(week.id) || !week.tiebreakerGameId) throw new MobileError(403, 'Tiebreaker unavailable.');
      const game = week.games.find(g => g.id === week.tiebreakerGameId);
      if (!game || !(await gamePickOpen(game)) || !(await saveTiebreakerSafely(user.id, week.id, game.id, body.total as number))) throw new MobileError(409, 'The tiebreaker locked or changed. Refresh before trying again.');
      return reply({ ok: true });
    }
    throw new MobileError(404, 'This action is available on the personal website only.');
  } catch (error) {
    if (error instanceof MobileError) return reply({ error: error.message }, error.status);
    console.error('Mobile API request failed');
    return reply({ error: 'Unable to complete the request. Try again.' }, 500);
  }
}
