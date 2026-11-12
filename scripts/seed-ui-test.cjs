const {PrismaClient}=require('@prisma/client');
const bcrypt=require('bcryptjs');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'Node'}});
const {seedAchievements}=require('../src/lib/achievements');
const p=new PrismaClient();
async function main(){
  if(new URL(process.env.DATABASE_URL).pathname!=='/nflpicks_ui_test') throw new Error('Disposable test database required');
  if(await p.user.count()) throw new Error('Refusing to seed a nonempty database');
  await seedAchievements(p);
  const season=await p.season.create({data:{id:'ui-season',year:2099,isActive:true}});
  await p.leagueSettings.create({data:{id:'default',leagueName:'Test league',chatEnabled:true}});
  for(const name of ['chromium','webkit']) await p.user.create({data:{id:'ui-'+name,email:name+'@example.invalid',password:await bcrypt.hash('Disposable-ui-test-2026!',10),profile:{create:{displayName:'A very long participant name for mobile layout',favoriteTeam:'BAL',theme:'light'}}}});
  const now=Date.now();
  for(let n=1;n<=3;n++){
    const start=new Date(now+(n===1?-3:n)*86400000);
    const week=await p.week.create({data:{id:'ui-week-'+n,seasonId:season.id,weekNumber:n,lockTime:start,isFinal:n===1}});
    await p.game.create({data:{id:'ui-game-'+n,weekId:week.id,homeTeam:'BUF',awayTeam:'KC',startTime:start,statusState:n===1?'post':'pre',isFinal:n===1,winnerTeam:n===1?'BUF':null,homeScore:n===1?24:null,awayScore:n===1?17:null}});
    await p.week.update({where:{id:week.id},data:{tiebreakerGameId:'ui-game-'+n,doubleGameId:'ui-game-'+n}});
  }
  for(const name of ['chromium','webkit']){
    await p.pick.create({data:{userId:'ui-'+name,weekId:'ui-week-1',gameId:'ui-game-1',pickedTeam:'BUF',isCorrect:true,pointsEarned:2}});
    await p.weeklyScore.create({data:{userId:'ui-'+name,weekId:'ui-week-1',points:2,finalRank:1,tiebreakerUsed:true}});
    await p.tiebreaker.create({data:{userId:'ui-'+name,weekId:'ui-week-1',guessedTotal:41,difference:0}});
  }
  console.log('Synthetic UI league seeded');
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>p.$disconnect());
