import { prisma } from './prisma';
import { NFL_TEAMS, getTeamLogoUrl } from './espn';
import { THEMES } from './themes';
import { MobileError, mobileLimit, type MobileUser } from './mobile-auth';
import { mentionedParticipantIds } from './chat-mentions';
import { sendUserNotification } from './push';
const include = {
  user: { select: { id: true, profile: { select: { displayName: true, favoriteTeam: true } } } },
  replyTo: { select: { id: true, text: true, user: { select: { profile: { select: { displayName: true } } } } } },
  reactions: { select: { emoji: true, userId: true } },
} as const;
const emojis = ['👍','❤️','😂','🔥','🏈','👀'];
type Row = Awaited<ReturnType<typeof messages>>[number];
function messages(where = {}) { return prisma.chatMessage.findMany({where:{appSource:'nfl',...where},include,orderBy:[{createdAt:'desc'},{id:'desc'}],take:50}); }
function serialize(m: Row) { return { id:m.id, userId:m.userId, displayName:m.user.profile?.displayName ?? 'Player', favoriteTeam:m.user.profile?.favoriteTeam ?? null, text:m.text, createdAt:m.createdAt.toISOString(), pinned:m.pinnedAt!==null, reply:m.replyTo ? {id:m.replyTo.id,text:m.replyTo.text,displayName:m.replyTo.user.profile?.displayName ?? 'Player'} : null, reactions:emojis.map(emoji=>({emoji,userIds:m.reactions.filter(r=>r.emoji===emoji).map(r=>r.userId)})).filter(r=>r.userIds.length>0) }; }
export async function mobileExperience(request: Request, key: string, user: MobileUser, json: (r:Request,keys:string[])=>Promise<Record<string,unknown>>): Promise<{body:unknown;status?:number}|undefined> {
  if(key==='experience' && request.method==='GET') {
    const [profile, settings] = await Promise.all([prisma.user.findUnique({where:{id:user.id},select:{profile:{select:{theme:true,favoriteTeam:true,reducedMotion:true}}}}),prisma.leagueSettings.findUnique({where:{id:'default'}})]);
    return {body:{preferences:profile?.profile ?? {theme:'midnight',favoriteTeam:null,reducedMotion:false},themes:THEMES,teams:Object.values(NFL_TEAMS).map(t=>({...t,logoUrl:getTeamLogoUrl(t.abbreviation)})),chatEnabled:settings?.chatEnabled ?? true}};
  }
  if(key==='preferences' && request.method==='PATCH') {
    const body=await json(request,['theme','favoriteTeam']);
    if(body.theme!==undefined && !THEMES.some(t=>t.id===body.theme)) throw new MobileError(400,'Choose an available theme.');
    if(body.favoriteTeam!==undefined && body.favoriteTeam!==null && (typeof body.favoriteTeam!=='string'||!NFL_TEAMS[body.favoriteTeam])) throw new MobileError(400,'Choose an NFL team.');
    const data={...(body.theme!==undefined?{theme:body.theme as string}:{}),...(body.favoriteTeam!==undefined?{favoriteTeam:body.favoriteTeam as string|null}:{})};
    await prisma.user.update({where:{id:user.id},data:{profile:{upsert:{create:{displayName:user.profile?.displayName ?? 'Player',...data},update:data}}}});
    return {body:{ok:true}};
  }
  if(key==='chat' && request.method==='GET' || key==='chat/history' && request.method==='POST') {
    const settings=await prisma.leagueSettings.findUnique({where:{id:'default'}});
    if(settings?.chatEnabled===false) return {body:{messages:[],hasMore:false,enabled:false}};
    let where={};
    if(key==='chat/history') {
      const body=await json(request,['beforeId']);
      if(typeof body.beforeId!=='string') throw new MobileError(400,'Message cursor required.');
      const cursor=await prisma.chatMessage.findFirst({where:{id:body.beforeId,appSource:'nfl'}});
      if(!cursor) throw new MobileError(404,'Message no longer available.');
      where={OR:[{createdAt:{lt:cursor.createdAt}},{createdAt:cursor.createdAt,id:{lt:cursor.id}}]};
    }
    const rows=await messages(where);return {body:{messages:rows.reverse().map(serialize),hasMore:rows.length===50,enabled:true}};
  }
  if(key==='chat' && request.method==='POST') {
    if((await prisma.leagueSettings.findUnique({where:{id:'default'}}))?.chatEnabled===false) throw new MobileError(403,'League chat is disabled.');
    await mobileLimit(`chat:${user.id}`,12,30000);
    const body=await json(request,['text','replyToId']);
    if(typeof body.text!=='string'||!body.text.trim()||body.text.trim().length>500) throw new MobileError(400,'Write a message between 1 and 500 characters.');
    const text=body.text.trim(); const replyToId=body.replyToId;
    if(replyToId!==undefined && replyToId!==null && (typeof replyToId!=='string'||!(await prisma.chatMessage.count({where:{id:replyToId,appSource:'nfl'}})))) throw new MobileError(400,'Reply target no longer exists.');
    const people=await prisma.user.findMany({select:{id:true,profile:{select:{displayName:true,notificationPreferences:true}}}});
    const mentions=mentionedParticipantIds(text,people.map(p=>({id:p.id,displayName:p.profile?.displayName ?? ''}))).filter(id=>id!==user.id).slice(0,20);
    const message=await prisma.chatMessage.create({data:{userId:user.id,text,appSource:'nfl',replyToId:typeof replyToId==='string'?replyToId:null,mentions:{create:mentions.map(userId=>({userId}))}},include});
    await Promise.allSettled(mentions.map(userId=>sendUserNotification({userId,type:'CHAT_MENTION',title:`${user.profile?.displayName ?? 'A player'} mentioned you`,message:text.slice(0,160),href:'/?chat=open',dedupeKey:`chat-mention:${message.id}:${userId}`,pushEnabled:((people.find(p=>p.id===userId)?.profile?.notificationPreferences ?? {}) as {leagueActivity?:boolean}).leagueActivity!==false})));
    return {body:{message:serialize(message)},status:201};
  }
  if(key==='chat/reaction' && request.method==='POST') {
    if((await prisma.leagueSettings.findUnique({where:{id:'default'}}))?.chatEnabled===false) throw new MobileError(403,'League chat is disabled.');
    await mobileLimit(`chat-reaction:${user.id}`,60,60000);
    const body=await json(request,['messageId','emoji']);
    if(typeof body.messageId!=='string'||typeof body.emoji!=='string'||!emojis.includes(body.emoji)) throw new MobileError(400,'Invalid reaction.');
    if(!(await prisma.chatMessage.count({where:{id:body.messageId,appSource:'nfl'}}))) throw new MobileError(404,'Message not found.');
    const unique={messageId:body.messageId,userId:user.id,emoji:body.emoji};
    await prisma.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reaction:${unique.messageId}:${user.id}:${unique.emoji}`}))`; const existing=await tx.chatReaction.findUnique({where:{messageId_userId_emoji:unique}});if(existing) await tx.chatReaction.delete({where:{id:existing.id}});else await tx.chatReaction.create({data:unique});});
    return {body:{ok:true}};
  }
}
