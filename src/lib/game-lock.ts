import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { AvailabilityGame, gameIsOpen } from './game-availability';
export async function gamePickOpen(game: AvailabilityGame & {id:string}, now=new Date(), db: Prisma.TransactionClient = prisma) {
  if (!gameIsOpen(game,now)) return false;
  return !(await db.auditLog.findUnique({where:{id:`game-lock:${game.id}`},select:{id:true}}));
}
export async function lockAndCheckGame(db: Prisma.TransactionClient, id:string) {
  await db.$queryRaw`SELECT id FROM "Game" WHERE id = ${id} FOR UPDATE`;
  const game=await db.game.findUnique({where:{id}});
  return game ? gamePickOpen(game,new Date(),db) : false;
}
export async function saveTiebreakerSafely(userId:string,weekId:string,expectedGameId:string,total:number) {
  return prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`tiebreaker:${weekId}`}))`;
    const week=await tx.week.findUnique({where:{id:weekId}});
    if(!week || week.isFinal || week.tiebreakerGameId!==expectedGameId || !(await lockAndCheckGame(tx,expectedGameId))) return false;
    await tx.tiebreaker.upsert({where:{userId_weekId:{userId,weekId}},update:{guessedTotal:total},create:{userId,weekId,guessedTotal:total}});
    return true;
  });
}
