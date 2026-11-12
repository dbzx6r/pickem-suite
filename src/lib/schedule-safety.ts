import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AvailabilityGame, gameHasStarted, scheduleChanged } from './game-availability';
type Game = AvailabilityGame & { id:string; weekId:string; homeTeam:string; awayTeam:string };
export async function recordScheduleSafety(tx: Prisma.TransactionClient, old: Game, next: AvailabilityGame) {
  const now=new Date();
  const key=`game-lock:${old.id}`;
  if(gameHasStarted(old,now) || gameHasStarted(next,now)) await tx.auditLog.upsert({where:{id:key},create:{id:key,action:'GAME_PICK_LOCK_PRESERVED',targetType:'Game',targetId:old.id,details:{originalKickoff:new Date(old.startTime).toISOString()}},update:{}});
  if(!scheduleChanged(old,next)) return;
  const fingerprint=createHash('sha256').update(JSON.stringify([old.id,old.startTime,next.startTime,old.statusState,next.statusState])).digest('hex').slice(0,32);
  const auditId=`schedule:${fingerprint}`;
  if(await tx.auditLog.findUnique({where:{id:auditId}})) return;
  const locked=Boolean(await tx.auditLog.findUnique({where:{id:key}}));
  await tx.auditLog.create({data:{id:auditId,action:'GAME_SCHEDULE_CHANGED',targetType:'Game',targetId:old.id,details:{previousKickoff:new Date(old.startTime).toISOString(),kickoff:new Date(next.startTime).toISOString(),previousStatus:old.statusState ?? null,status:next.statusState ?? null,lockPreserved:locked}}});
  const recipients=await tx.user.findMany({where:{OR:[{role:'ADMIN'},{picks:{some:{gameId:old.id}}},{tiebreakers:{some:{weekId:old.weekId}}}]},select:{id:true}});
  await tx.notification.createMany({data:recipients.map(u=>({userId:u.id,type:'SCHEDULE_CHANGED',title:`${old.awayTeam} at ${old.homeTeam}: schedule update`,message:`Status: ${next.statusState ?? 'scheduled'}. Scheduled kickoff: ${new Date(next.startTime).toLocaleString('en-US',{timeZone:'America/Los_Angeles'})} Pacific. Your saved entries were kept. ${locked ? 'The existing pick lock remains in place.' : 'Only scheduled, unstarted games accept picks.'} Postponed/canceled scoring requires commissioner review; no picks were reassigned.`,href:'/picks',dedupeKey:`${auditId}:${u.id}`})),skipDuplicates:true});
}
