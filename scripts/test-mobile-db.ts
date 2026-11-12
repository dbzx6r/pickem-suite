import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { writeFile } from 'node:fs/promises';

test('native personal adapter against disposable PostgreSQL', async t => {
  assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/nflpicks_ui_test');
  process.env.AUTH_SECRET = 'disposable-mobile-test-only-secret';
  const prisma = new PrismaClient();
  const Module = require('node:module'); const original = Module._load;
  Module._load = function(name: string, ...args: unknown[]) {
    if (name === '@/lib/prisma') return { prisma };
    if (name.startsWith('@/')) return original.call(this, require('node:path').resolve(__dirname, '../src', name.slice(2)), ...args);
    return original.call(this, name, ...args);
  };
  const { handleMobile } = require('../src/lib/mobile-api');
  const { issueMobileSession } = require('../src/lib/mobile-auth');
  Module._load = original;
  const password = 'Disposable-ui-test-2026!'; let token: string; let second: string; let admin: string;
  async function api(path: string, method = 'GET', body?: unknown, bearer = token, extra: Record<string,string> = {}) {
    return handleMobile(new Request(`http://localhost/api/v1/${path}`, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined }), path.split('/')) as Promise<Response>;
  }
  async function login(email = 'chromium@example.invalid') { const r = await api('auth/login', 'POST', { email, password, client: 'native' }, ''); assert.equal(r.status, 200); return r.json(); }
  const root = 'leagues/ui-season';
  try {
    await prisma.rateLimitBucket.deleteMany();
    await prisma.pick.deleteMany({where:{weekId:'ui-week-2'}});
    await prisma.tiebreaker.deleteMany({where:{weekId:'ui-week-2'}});
    await prisma.user.upsert({ where: { id: 'mobile-admin' }, create: { id: 'mobile-admin', email: 'mobile-admin@example.invalid', password: await bcrypt.hash(password, 10), role: 'ADMIN' }, update: {} });
    await t.test('capabilities and native login match the Swift contract', async () => {
      const caps = await (await api('capabilities', 'GET', undefined, '')).json(); assert.equal(caps.country, 'US'); assert.equal(caps.environment, 'personal'); assert.equal(caps.stakesEnabled, false);
      const result = await login(); token = result.token; second = (await login('webkit@example.invalid')).token; admin = (await login('mobile-admin@example.invalid')).token;
      assert.ok(result.expiresAt); assert.equal(result.account.id, 'ui-chromium');
      assert.equal((await api('me', 'GET', undefined, '')).status, 401);
      assert.equal((await api('me', 'GET', undefined, token.slice(0,-1)+'x')).status, 401);
      assert.equal((await api('me', 'GET', undefined, '', { cookie: `authjs.session-token=${token}` })).status, 401);
      assert.equal((await api('me', 'GET', undefined, token, { origin: 'https://evil.invalid' })).status, 403);
    });
    await t.test('Live Activities bind tokens to account/session and clean up invalid or final activities', async () => {
      const { deliverLiveActivities } = require('../src/lib/live-activities');
      const route = 'live-activities';
      const body = { activityId: 'test-live-1', gameId: 'ui-game-2', token: 'ab'.repeat(32), environment: 'sandbox' };
      const game = await prisma.game.findUniqueOrThrow({ where: { id: body.gameId } });
      assert.equal((await api(route, 'POST', body)).status, 503);
      process.env.LIVE_ACTIVITIES_ENABLED = 'true'; process.env.APNS_PRODUCTION_KEY_PATH = '/not-used-in-tests'; process.env.APNS_PRODUCTION_KEY_ID = 'TEST-PROD'; process.env.APNS_SANDBOX_KEY_PATH = '/not-used-in-tests'; process.env.APNS_SANDBOX_KEY_ID = 'TEST-SANDBOX'; process.env.APNS_TEAM_ID = 'TEST'; process.env.APNS_BUNDLE_ID = 'org.example.pickem';
      try {
        assert.equal((await api(route, 'POST', body, '')).status, 401);
        assert.equal((await api(route, 'POST', body)).status, 404);
        await prisma.game.update({ where: { id: body.gameId }, data: { statusState: 'in' } });
        assert.equal((await api(route, 'POST', { ...body, environment: 'https://evil.invalid' })).status, 400);
        assert.equal((await api(route, 'POST', body)).status, 200);
        assert.equal((await api(route, 'POST', body, second)).status, 409);
        assert.equal((await api(route, 'DELETE', { activityId: body.activityId }, second)).status, 200);
        assert.equal(await prisma.liveActivity.count(), 1);
        const calls: unknown[] = [];
        await deliverLiveActivities([body.gameId], async (_token: string, env: string, payload: any) => { calls.push(payload); assert.equal(env, 'sandbox'); return { status: 200 }; });
        assert.equal(calls.length, 1); assert.equal((calls[0] as any).aps.event, 'update');
        await deliverLiveActivities([body.gameId], async () => ({ status: 503 }));
        assert.equal(await prisma.liveActivity.count(), 1);
        await deliverLiveActivities([body.gameId], async () => ({ status: 410 }));
        assert.equal(await prisma.liveActivity.count(), 0);
        assert.equal((await api(route, 'POST', body)).status, 200);
        await prisma.game.update({ where: { id: body.gameId }, data: { isFinal: true } });
        await deliverLiveActivities([body.gameId], async (_token: string, _env: string, payload: any) => { assert.equal(payload.aps.event, 'end'); return { status: 200 }; });
        assert.equal(await prisma.liveActivity.count(), 0);
        await prisma.game.update({ where: { id: body.gameId }, data: { isFinal: false } });
        const extra = await issueMobileSession(await prisma.user.findUniqueOrThrow({ where: { id: 'ui-chromium' } }));
        assert.equal((await api(route, 'POST', body, extra)).status, 200);
        assert.equal((await api(route, 'POST', body, token)).status, 409);
        assert.equal((await api('auth/logout', 'POST', {}, extra)).status, 200);
        assert.equal(await prisma.liveActivity.count(), 0);
        assert.equal((await api(route, 'POST', body)).status, 200);
        await prisma.liveActivity.update({ where: { activityId: body.activityId }, data: { expiresAt: new Date(0) } });
        await deliverLiveActivities([body.gameId], async () => { throw new Error('Expired activity must not send'); });
        assert.equal(await prisma.liveActivity.count(), 0);
      } finally {
        delete process.env.LIVE_ACTIVITIES_ENABLED; delete process.env.APNS_PRODUCTION_KEY_PATH; delete process.env.APNS_PRODUCTION_KEY_ID; delete process.env.APNS_SANDBOX_KEY_PATH; delete process.env.APNS_SANDBOX_KEY_ID; delete process.env.APNS_TEAM_ID;
        await prisma.liveActivity.deleteMany();
        await prisma.game.update({ where: { id: game.id }, data: { statusState: game.statusState, isFinal: game.isFinal } });
      }
    });
    await t.test('read existing league/week/member data without exposing credentials', async () => {
      const leagues = await (await api('leagues')).json(); assert.equal(leagues.leagues[0].id, 'ui-season');
      const weeks = await (await api(`${root}/weeks`)).json(); assert.equal(weeks.currentWeek, 2); assert.equal(weeks.standingsWeek, 1);
      assert.equal((await (await api(`${root}/weeks/1/standings`)).json()).isFinal, true);
      assert.equal((await (await api(`${root}/weeks/2/standings`)).json()).isFinal, false);
      const members = await (await api(`${root}/members`)).json(); assert.ok(members.members.length >= 3); assert.equal(JSON.stringify(members).includes('@example.invalid'), false);
      const slate = await (await api(`${root}/weeks/2/slate`)).json(); assert.equal(slate.games[0].season, 2099); assert.equal(slate.games[0].source, 'personal-server'); assert.deepEqual(slate.openWeeks, [2,3]);
      await writeFile('/tmp/pickem-personal-contract.json', JSON.stringify({ capabilities: await (await api('capabilities')).json(), login: { ...(await login()), token: 'redacted-test-token' }, leagues, weeks, members, slate, standings: await (await api(`${root}/weeks/1/standings`)).json() }));
    });
    await t.test('season standings match website totals, overrides and ordering without private fields', async () => {
      const { getLeaderboard } = require('../src/lib/scoring');
      assert.equal((await api(`${root}/standings`, 'GET', undefined, '')).status, 401);
      assert.equal((await api('leagues/not-active/standings')).status, 404);
      const score = await prisma.weeklyScore.findFirstOrThrow({where:{userId:'ui-chromium'}});
      await prisma.weeklyScore.update({where:{id:score.id},data:{adminOverridePoints:43}});
      try {
        const response = await api(`${root}/standings`); assert.equal(response.status,200);
        const actual = await response.json();
        const expected = (await getLeaderboard(false)).sort((a: any,b: any)=>b.totalPoints-a.totalPoints).map((x: any,i: number)=>({account_id:x.id,display_name:x.displayName,points:x.totalPoints,rank:i+1}));
        assert.deepEqual(actual.standings,expected); assert.equal(actual.season,2099);
        assert.equal(actual.standings.find((x: any)=>x.account_id==='ui-chromium').points,43);
        assert.equal(actual.standings.some((x: any)=>x.account_id==='mobile-admin'),false);
        assert.ok(response.headers.get('cache-control')?.includes('no-store'));
      } finally {await prisma.weeklyScore.update({where:{id:score.id},data:{adminOverridePoints:score.adminOverridePoints}});}
    });
    await t.test('profiles match recorded totals and hide other players’ future selections', async () => {
      await prisma.pick.create({data:{userId:'ui-webkit',weekId:'ui-week-2',gameId:'ui-game-2',pickedTeam:'KC'}});
      try {
        const response = await api(`${root}/profiles/ui-webkit`); assert.equal(response.status,200);
        const profile=(await response.json()).profile;
        assert.equal(profile.totalPoints,2); assert.equal(profile.pickPercentage,100); assert.equal(profile.weeksWon,1);
        assert.equal(profile.picks.some((x:any)=>x.week===2),false);
        assert.equal(profile.rivals.find((x:any)=>x.id==='ui-chromium').ties,1);
        assert.equal(profile.achievements.length,8);
        assert.equal(JSON.stringify(profile).includes('@example.invalid'),false);
        const own=(await (await api(`${root}/profiles/ui-webkit`,'GET',undefined,second)).json()).profile;
        assert.ok(own.picks.some((x:any)=>x.week===2));
        assert.equal((await api(`${root}/profiles/missing`)).status,404);
        const participation=(await (await api(`${root}/weeks/2/participation`)).json());
        assert.equal(participation.players.find((x:any)=>x.id==='ui-webkit').saved,1);
        assert.equal(participation.games[0].revealed,false);assert.deepEqual(participation.games[0].picks,[]);
        await prisma.game.update({where:{id:'ui-game-2'},data:{statusState:'postponed'}});
        assert.deepEqual((await (await api(`${root}/weeks/2/participation`)).json()).games[0].picks,[]);
        assert.equal((await (await api(`${root}/weeks/1/participation`)).json()).games[0].picks.length,2);
      } finally {await prisma.game.update({where:{id:'ui-game-2'},data:{statusState:'pre'}});await prisma.pick.deleteMany({where:{userId:'ui-webkit',gameId:'ui-game-2'}});}
    });
    await t.test('stake-free challenges enforce ownership, game locks, duplicate protection and atomic transitions',async()=>{
      const body={acceptorId:'ui-webkit',gameId:'ui-game-2',team:'BUF'};
      const route=`${root}/challenges`;
      await prisma.sideBet.deleteMany();
      assert.equal((await api(route,'POST',{...body,stake:'money'})).status,400);
      assert.equal((await api(route,'POST',{...body,acceptorId:'ui-chromium'})).status,400);
      assert.equal((await api(route,'POST',{...body,gameId:'ui-game-1'})).status,409);
      assert.equal((await api(route,'POST',body,admin)).status,403);
      const attempts=await Promise.all([api(route,'POST',body),api(route,'POST',body)]);
      assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);
      const bet=(await (await api(route)).json()).challenges[0];assert.equal(bet.status,'pending');
      assert.equal((await api(`${route}/${bet.id}`,'PATCH',{action:'accept'})).status,404);
      assert.equal((await api(`${route}/${bet.id}`,'PATCH',{action:'accept'},second)).status,200);
      assert.equal((await api(`${route}/${bet.id}`,'PATCH',{action:'cancel'})).status,409);
      assert.equal((await prisma.sideBet.findUniqueOrThrow({where:{id:bet.id}})).stake,null);
      await prisma.sideBet.update({where:{id:bet.id},data:{status:'pending'}});
      await prisma.auditLog.create({data:{id:'game-lock:ui-game-2',action:'TEST_LOCK',targetType:'game',targetId:'ui-game-2'}});
      try {
        assert.equal((await api(`${route}/${bet.id}`,'PATCH',{action:'accept'},second)).status,409);
        assert.equal((await (await api(route)).json()).challenges[0].status,'expired');
        assert.equal((await api(route,'POST',body)).status,409);
      } finally {await prisma.auditLog.delete({where:{id:'game-lock:ui-game-2'}});}
      await prisma.sideBet.update({where:{id:bet.id},data:{stake:'private stake'}});
      assert.deepEqual((await (await api(route)).json()).challenges,[]);
      assert.equal((await api(`${route}/${bet.id}`,'PATCH',{action:'accept'},second)).status,404);
      await prisma.sideBet.update({where:{id:bet.id},data:{stake:null,betDetails:{team:'BUF',unsupported:'legacy free text'}}});
      assert.deepEqual((await (await api(route)).json()).challenges,[]);
      assert.equal((await api(`${route}/${bet.id}`,'PATCH',{action:'accept'},second)).status,400);
      await prisma.sideBet.deleteMany();
    });
    await t.test('calendar and record archive match the website without private fields',async()=>{
      const calendar=await (await api(`${root}/calendar`)).json();assert.equal(calendar.games.length,3);assert.equal(calendar.games[0].week,1);
      const records=await (await api(`${root}/records`)).json();assert.equal(records.seasons[0].year,2099);assert.equal(records.seasons[0].players.length,2);assert.equal(records.seasons[0].players[0].points,2);
      assert.equal(JSON.stringify(records).includes('@example.invalid'),false);
      assert.equal((await api('leagues/missing/records')).status,404);
    });
    await t.test('native inbox shows only own notices and cannot mark another player’s notice read',async()=>{
      const foreign=await prisma.notification.create({data:{userId:'ui-webkit',type:'TEST',title:'Private',message:'Other player'}});
      try {
        const inbox=await (await api('inbox')).json();assert.equal(inbox.notifications.some((x:any)=>x.id===foreign.id),false);
        assert.equal((await api('inbox','PATCH',{id:foreign.id})).status,200);
        assert.equal((await prisma.notification.findUniqueOrThrow({where:{id:foreign.id}})).readAt,null);
        assert.equal((await api('inbox','PATCH',{all:true})).status,200);
      } finally {await prisma.notification.delete({where:{id:foreign.id}});}
    });
    await t.test('native preferences preserve unrelated settings and validate team/theme', async () => {
      await prisma.user.update({where:{id:'ui-chromium'},data:{profile:{update:{reducedMotion:true,notificationPreferences:{leagueActivity:false}}}}});
      const experience=await (await api('experience')).json();assert.equal(experience.teams.length,32);assert.ok(experience.themes.some((x:{id:string})=>x.id==='midnight'));
      assert.equal((await api('preferences','PATCH',{theme:'oled'})).status,200);
      assert.equal((await (await api('experience')).json()).preferences.theme,'oled');
      assert.equal((await api('preferences','PATCH',{theme:'team',favoriteTeam:'SEA'})).status,200);
      const profile=await prisma.profile.findFirstOrThrow({where:{user:{id:'ui-chromium'}}});assert.equal(profile.favoriteTeam,'SEA');assert.equal(profile.reducedMotion,true);assert.deepEqual(profile.notificationPreferences,{leagueActivity:false});
      assert.equal((await api('preferences','PATCH',{theme:'bogus'})).status,400);
      assert.equal((await api('preferences','PATCH',{favoriteTeam:'INVALID'})).status,400);
      assert.equal((await api('preferences','PATCH',{role:'ADMIN'})).status,400);
    });
    await t.test('chat uses shared messages, validates replies and toggles only own reactions', async () => {
      await prisma.chatMessage.deleteMany();
      await prisma.leagueSettings.update({where:{id:'default'},data:{chatEnabled:true}});
      assert.equal((await api('chat','GET',undefined,'')).status,401);
      assert.equal((await api('chat','POST',{text:' '})).status,400);
      assert.equal((await api('chat','POST',{text:'x'.repeat(501)})).status,400);
      const response=await api('chat','POST',{text:'A synthetic game-day conversation'});assert.equal(response.status,201);
      const message=(await response.json()).message;assert.equal(message.displayName,(await prisma.user.findUniqueOrThrow({where:{id:'ui-chromium'},include:{profile:true}})).profile?.displayName);
      assert.equal((await api('chat','POST',{text:'A reply',replyToId:message.id},second)).status,201);
      assert.equal((await api('chat','POST',{text:'Bad reply',replyToId:'missing'})).status,400);
      assert.equal((await api('chat/reaction','POST',{messageId:message.id,emoji:'🏈'})).status,200);
      assert.equal((await api('chat/reaction','POST',{messageId:message.id,emoji:'🏈'},second)).status,200);
      assert.equal((await api('chat/reaction','POST',{messageId:message.id,emoji:'🏈'})).status,200);
      const feed=await (await api('chat')).json();assert.equal(feed.messages.length,2);assert.deepEqual(feed.messages[0].reactions[0].userIds,['ui-webkit']);assert.equal(feed.messages[1].reply.id,message.id);assert.equal(JSON.stringify(feed).includes('@example.invalid'),false);
      const foreign=await prisma.chatMessage.create({data:{userId:'ui-chromium',text:'Other app',appSource:'other'}});
      assert.equal((await api('chat','POST',{text:'Cross app',replyToId:foreign.id})).status,400);
      assert.equal((await api('chat/reaction','POST',{messageId:foreign.id,emoji:'🏈'})).status,404);
      assert.equal((await api('chat/history','POST',{beforeId:foreign.id})).status,404);
      const history=await (await api('chat/history','POST',{beforeId:feed.messages[1].id})).json();assert.equal(history.messages.length,1);
      await prisma.leagueSettings.update({where:{id:'default'},data:{chatEnabled:false}});
      assert.equal((await api('chat','POST',{text:'Disabled'})).status,403);assert.equal((await api('chat/reaction','POST',{messageId:message.id,emoji:'🏈'})).status,403);assert.deepEqual((await (await api('chat')).json()).messages,[]);
      await prisma.leagueSettings.update({where:{id:'default'},data:{chatEnabled:true}});
    });
    await t.test('live game context preserves score, possession, clock and quarter values', async () => {
      await prisma.game.update({where:{id:'ui-game-2'},data:{statusState:'in',period:3,clock:'8:42',possession:'BUF',downDistance:'2nd & 6',homeScore:17,awayScore:14,homeScoreQ1:7,awayScoreQ1:0,spreadLine:'BUF -3.5',overUnder:47.5}});
      const game=(await (await api(`${root}/weeks/2/slate`)).json()).games[0];
      assert.equal(game.status,'LIVE');assert.equal(game.clock,'8:42');assert.equal(game.period,3);assert.equal(game.down_distance,'2nd & 6');assert.equal(game.home_quarters[0],7);assert.equal(game.away_quarters[0],0);assert.equal(game.home_score,17);assert.equal(game.over_under,47.5);
      await prisma.game.update({where:{id:'ui-game-2'},data:{statusState:'pre',period:null,clock:null,possession:null,downDistance:null,homeScore:null,awayScore:null,homeScoreQ1:null,awayScoreQ1:null}});
    });
    await t.test('manual pick edits update the same database and revision history', async () => {
      assert.equal((await api(`${root}/picks`, 'PUT', {gameId:'ui-game-2',team:'BUF'})).status,200);
      assert.equal((await api(`${root}/picks`, 'PUT', {gameId:'ui-game-2',team:'KC'})).status,200);
      const pick = await prisma.pick.findUniqueOrThrow({ where: {userId_gameId:{userId:'ui-chromium',gameId:'ui-game-2'}} }); assert.equal(pick.pickedTeam,'KC'); assert.equal(pick.editCount,1);
      assert.equal((await prisma.pickRevision.findFirstOrThrow({where:{pickId:pick.id}})).source,'ios');
      assert.equal((await api(`${root}/picks`, 'PUT', {gameId:'ui-game-2',team:'KC'})).status,200);
      assert.equal(await prisma.pickRevision.count({where:{pickId:pick.id}}),2);
      const other = await (await api(`${root}/weeks/2/slate`,'GET',undefined,second)).json(); assert.equal(other.picks.length,0);
    });
    await t.test('deny invalid teams, cross-league IDs, final games and commissioner picks', async () => {
      assert.equal((await api(`${root}/picks`, 'PUT', {gameId:'ui-game-2',team:'SF'})).status,400);
      assert.equal((await api('leagues/missing/picks', 'PUT', {gameId:'ui-game-2',team:'BUF'})).status,404);
      assert.equal((await api(`${root}/picks`, 'PUT', {gameId:'ui-game-1',team:'BUF'})).status,403);
      assert.equal((await api(`${root}/picks`, 'PUT', {gameId:'ui-game-2',team:'BUF'},admin)).status,403);
      assert.equal((await api(`${root}/weeks/2/tiebreaker`, 'PUT', {total:42},admin)).status,403);
      const before = await prisma.pick.count();
      assert.equal((await api(`${root}/picks`, 'PUT', {gameId:'ui-game-2',team:'BUF',userId:'ui-webkit'})).status,400);
      assert.equal(await prisma.pick.count(),before);
      assert.equal((await api(`${root}/weeks/2/rules`,'PUT',{doubleGameId:null,tiebreakerGameId:null},admin)).status,404);
    });
    await t.test('durable/rescheduled/paused locks reject overwrites', async () => {
      for (const state of ['in','postponed','canceled','suspended']) {
        await prisma.game.update({where:{id:'ui-game-2'},data:{statusState:state}});
        assert.equal((await api(`${root}/picks`,'PUT',{gameId:'ui-game-2',team:'BUF'})).status,403);
      }
      await prisma.game.update({where:{id:'ui-game-2'},data:{statusState:'pre'}});
      await prisma.auditLog.create({data:{id:'game-lock:ui-game-2',action:'GAME_LOCK',targetType:'Game',targetId:'ui-game-2'}});
      assert.equal((await api(`${root}/picks`,'PUT',{gameId:'ui-game-2',team:'BUF'})).status,403);
      assert.ok((await (await api(`${root}/weeks/2/slate`)).json()).games[0].locked_at);
      await prisma.auditLog.delete({where:{id:'game-lock:ui-game-2'}});
      assert.equal((await prisma.pick.findUniqueOrThrow({where:{userId_gameId:{userId:'ui-chromium',gameId:'ui-game-2'}}})).pickedTeam,'KC');
    });
    await t.test('tiebreaker save, privacy, locked rejection and validation', async () => {
      for (const total of [-1,201,1.5,'42']) assert.equal((await api(`${root}/weeks/2/tiebreaker`,'PUT',{total})).status,400);
      assert.equal((await api(`${root}/weeks/2/tiebreaker`,'PUT',{total:42})).status,200);
      assert.equal((await prisma.tiebreaker.findUniqueOrThrow({where:{userId_weekId:{userId:'ui-chromium',weekId:'ui-week-2'}}})).guessedTotal,42);
      assert.equal((await (await api(`${root}/weeks/2/slate`,'GET',undefined,second)).json()).tiebreaker,null);
      assert.equal((await (await api(`${root}/weeks/2/standings`,'GET',undefined,second)).json()).standings[0].difference,null);
      await prisma.game.update({where:{id:'ui-game-2'},data:{statusState:'in'}});
      assert.equal((await api(`${root}/weeks/2/tiebreaker`,'PUT',{total:50})).status,409);
      await prisma.game.update({where:{id:'ui-game-2'},data:{statusState:'pre'}});
    });
    await t.test('outside-window games and concurrent kickoff changes cannot accept picks', async () => {
      const later = await prisma.week.create({data:{seasonId:'ui-season',weekNumber:4,lockTime:new Date(Date.now()+10*86400000)}});
      const game = await prisma.game.create({data:{weekId:later.id,homeTeam:'SF',awayTeam:'SEA',startTime:later.lockTime,statusState:'pre'}});
      assert.equal((await api(`${root}/picks`,'PUT',{gameId:game.id,team:'SF'})).status,403);
      await prisma.game.delete({where:{id:game.id}}); await prisma.week.delete({where:{id:later.id}});
      let acquired!:()=>void; let release!:()=>void;
      const ready = new Promise<void>(resolve=>{ acquired=resolve; }); const proceed=new Promise<void>(resolve=>{release=resolve;});
      const schedule=prisma.$transaction(async tx=>{
        await tx.$queryRaw`SELECT id FROM "Game" WHERE id = 'ui-game-2' FOR UPDATE`;
        acquired(); await proceed; await tx.game.update({where:{id:'ui-game-2'},data:{statusState:'in'}});
      },{timeout:15000});
      await ready;
      const attempt=api(`${root}/picks`,'PUT',{gameId:'ui-game-2',team:'BUF'});
      await new Promise(resolve=>setTimeout(resolve,250)); release(); await schedule;
      assert.equal((await attempt).status,403);
      await prisma.game.update({where:{id:'ui-game-2'},data:{statusState:'pre'}});
    });
    await t.test('historical ranks and overrides are retained', async () => {
      await prisma.weeklyScore.update({where:{userId_weekId:{userId:'ui-chromium',weekId:'ui-week-1'}},data:{adminOverridePoints:9,finalRank:2}});
      const rows=(await (await api(`${root}/weeks/1/standings`)).json()).standings;
      const row=rows.find((r:{account_id:string})=>r.account_id==='ui-chromium'); assert.equal(row.points,9); assert.equal(row.rank,2);
      await prisma.weeklyScore.update({where:{userId_weekId:{userId:'ui-chromium',weekId:'ui-week-1'}},data:{adminOverridePoints:null,finalRank:1}});
    });
    await t.test('password reset invalidates sessions and logout revokes only that device', async () => {
      const extra=(await login()).token; await prisma.user.update({where:{id:'ui-chromium'},data:{sessionVersion:{increment:1}}});
      assert.equal((await api('me')).status,401); token=(await login()).token;
      assert.equal((await api('me','GET',undefined,extra)).status,401);
      assert.equal((await api('auth/logout','POST',{})).status,200); assert.equal((await api('me')).status,401);
      assert.equal((await api('me','GET',undefined,second)).status,200);
      token=(await login()).token;
      const user=await prisma.user.findUniqueOrThrow({where:{id:'ui-chromium'}}); const expired=await issueMobileSession(user);
      const crypto=require('node:crypto'); await prisma.rateLimitBucket.update({where:{key:'mobile-session:'+crypto.createHash('sha256').update(expired).digest('hex')},data:{resetAt:new Date(0)}});
      assert.equal((await api('me','GET',undefined,expired)).status,401);
    });
    await t.test('login lockout and forced password changes are enforced', async () => {
      await prisma.user.update({where:{id:'ui-webkit'},data:{mustChangePassword:true}});
      assert.equal((await api('me','GET',undefined,second)).status,403);
      assert.equal((await api('auth/login','POST',{email:'webkit@example.invalid',password,client:'native'},'')).status,403);
      await prisma.user.update({where:{id:'ui-webkit'},data:{mustChangePassword:false,lockedUntil:new Date(Date.now()+60000)}});
      assert.equal((await api('auth/login','POST',{email:'webkit@example.invalid',password,client:'native'},'')).status,401);
      await prisma.user.update({where:{id:'ui-webkit'},data:{lockedUntil:null}});
    });
    // Leave clean repeatable UI credentials and no rate buckets for the browser/native smoke tests.
    await prisma.rateLimitBucket.deleteMany();
  } finally { await prisma.$disconnect(); }
});
