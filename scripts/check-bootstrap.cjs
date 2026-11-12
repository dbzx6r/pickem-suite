const assert=require('node:assert/strict');
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
async function main(){
  assert.equal(new URL(process.env.DATABASE_URL).pathname,'/pickem_bootstrap_test');
  assert.equal(await p.user.count(),1);
  assert.equal(await p.user.count({where:{role:'ADMIN',mustChangePassword:true}}),1);
  assert.equal(await p.season.count(),1);
  assert.equal(await p.game.count(),0);
  assert.equal((await p.leagueSettings.findUnique({where:{id:'default'}})).registrationEnabled,false);
  console.log('Fresh bootstrap and repeat bootstrap verified.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>p.$disconnect());
