import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { recordScheduleSafety } from '../src/lib/schedule-safety';

test('schedule changes preserve entries, deduplicate notices and serialize durable locks', async () => {
  assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/nflpicks_ui_test');
  const prisma = new PrismaClient();
  const Module = require('node:module');
  const original = Module._load;
  Module._load = function(name: string, ...args: unknown[]) {
    if (name === '@/lib/prisma') return { prisma };
    return original.call(this, name, ...args);
  };
  const { gamePickOpen, lockAndCheckGame, saveTiebreakerSafely } = require('../src/lib/game-lock');
  const { selectWeeklyTiebreaker } = require('../src/lib/tiebreaker-selection');
  Module._load = original;
  async function cleanup() {
    const games=await prisma.game.findMany({where:{week:{seasonId:'schedule-test-season'}},select:{id:true}});
    await prisma.auditLog.deleteMany({where:{targetType:'Game',targetId:{in:games.map(g=>g.id)}}});
    await prisma.pick.deleteMany({where:{userId:'schedule-test-user'}});
    await prisma.tiebreaker.deleteMany({where:{userId:'schedule-test-user'}});
    await prisma.game.deleteMany({where:{week:{seasonId:'schedule-test-season'}}});
    await prisma.week.deleteMany({where:{seasonId:'schedule-test-season'}});
    await prisma.user.deleteMany({where:{id:'schedule-test-user'}});
    await prisma.season.deleteMany({where:{id:'schedule-test-season'}});
  }
  try {
    await cleanup();
    await prisma.user.create({data:{id:'schedule-test-user',email:'schedule@example.invalid',password:'not-a-login'}});
    const season=await prisma.season.create({data:{id:'schedule-test-season',year:2098,isActive:false}});
    const week=await prisma.week.create({data:{seasonId:season.id,weekNumber:1,lockTime:new Date('2098-10-01')}});
    const game=await prisma.game.create({data:{weekId:week.id,homeTeam:'BUF',awayTeam:'KC',startTime:new Date('2098-10-01'),statusState:'pre'}});
    await prisma.week.update({where:{id:week.id},data:{tiebreakerGameId:game.id}});
    await prisma.pick.create({data:{userId:'schedule-test-user',weekId:week.id,gameId:game.id,pickedTeam:'BUF'}});
    assert.equal(await saveTiebreakerSafely('schedule-test-user',week.id,game.id,42),true);
    const moved={...game,startTime:new Date('2098-10-02')};
    await prisma.$transaction(tx=>recordScheduleSafety(tx,game,moved));
    await prisma.$transaction(tx=>recordScheduleSafety(tx,game,moved));
    assert.equal(await prisma.notification.count({where:{userId:'schedule-test-user'}}),1);
    assert.equal(await gamePickOpen(game),true);
    for(const statusState of ['postponed','canceled','suspended','in','post']) {
      await prisma.game.update({where:{id:game.id},data:{statusState}});
      assert.equal(await prisma.$transaction(tx=>lockAndCheckGame(tx,game.id)),false);
      assert.equal(await saveTiebreakerSafely('schedule-test-user',week.id,game.id,99),false);
    }
    await prisma.game.update({where:{id:game.id},data:{statusState:'pre',startTime:new Date(Date.now()-1000)}});
    // Moving a formerly locked game into the future must never reopen it.
    await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "Game" WHERE id=${game.id} FOR UPDATE`;
      const old=await tx.game.findUniqueOrThrow({where:{id:game.id}});
      await recordScheduleSafety(tx,old,moved);
      await tx.game.update({where:{id:game.id},data:{startTime:moved.startTime}});
    });
    assert.equal(await gamePickOpen(moved),false);
    assert.equal(await prisma.$transaction(tx=>lockAndCheckGame(tx,game.id)),false);
    assert.equal(await saveTiebreakerSafely('schedule-test-user',week.id,game.id,99),false);
    await prisma.game.create({data:{weekId:week.id,homeTeam:'NYJ',awayTeam:'MIA',startTime:new Date('2098-10-03'),statusState:'pre'}});
    await selectWeeklyTiebreaker(week.id);
    assert.equal((await prisma.week.findUniqueOrThrow({where:{id:week.id}})).tiebreakerGameId,game.id);
    assert.equal((await prisma.pick.findFirstOrThrow({where:{gameId:game.id}})).pickedTeam,'BUF');
    assert.equal((await prisma.tiebreaker.findFirstOrThrow({where:{weekId:week.id}})).guessedTotal,42);
    // A pending submission sees a cancellation committed while it waits for the row.
    const other=await prisma.game.findFirstOrThrow({where:{weekId:week.id,id:{not:game.id}}});
    let acquired!:()=>void;
    const ready=new Promise<void>(resolve=>{acquired=resolve});
    const change=prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "Game" WHERE id=${other.id} FOR UPDATE`;
      acquired();
      await new Promise(resolve=>setTimeout(resolve,100));
      await tx.game.update({where:{id:other.id},data:{statusState:'canceled'}});
    });
    await ready;
    const submission=prisma.$transaction(tx=>lockAndCheckGame(tx,other.id));
    await change;
    assert.equal(await submission,false);
  } finally {
    // Only synthetic, explicitly identified fixtures are removed.
    await cleanup();
    await prisma.$disconnect();
  }
});
