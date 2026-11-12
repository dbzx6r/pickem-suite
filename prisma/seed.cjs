const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
async function main() {
  if (await prisma.user.count({where:{role:'ADMIN'}})) {
    console.log('An administrator already exists. Existing accounts and seasons were preserved.'); return;
  }
  if (await prisma.user.count()) throw new Error('Existing users found without an administrator; manual recovery required.');
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_SEED_PASSWORD || '';
  const year = process.env.SEASON_YEAR ? Number(process.env.SEASON_YEAR) : new Date().getFullYear();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Set ADMIN_EMAIL in .env.');
  if (password.length < 16 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || /REPLACE|CHANGE_ME/i.test(password)) throw new Error('Set a random ADMIN_SEED_PASSWORD with at least 16 characters including uppercase, lowercase and a number.');
  if (!Number.isInteger(year) || year < 2000 || year > 2200) throw new Error('Invalid SEASON_YEAR');
  const hash = await bcrypt.hash(password, 12);
  await prisma.$transaction(async tx => {
    await tx.user.create({data:{email,password:hash,role:'ADMIN',mustChangePassword:true,profile:{create:{displayName:'Commissioner'}}}});
    await tx.leagueSettings.upsert({where:{id:'default'},create:{id:'default',leagueName:process.env.LEAGUE_NAME || 'Pickem Suite',registrationEnabled:false,newsEnabled:false},update:{}});
    await tx.season.create({data:{year,seasonType:'REGULAR',isActive:true,isSandbox:false}});
  });
  console.log('Administrator and empty season created. Sign in and change the initial password. No games or participants were imported.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>prisma.$disconnect());
