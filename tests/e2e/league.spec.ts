import {test,expect,APIRequestContext} from '@playwright/test';
import { THEMES } from '../../src/lib/themes';
let cookies: Awaited<ReturnType<APIRequestContext['storageState']>>['cookies']=[];
test.beforeAll(async({request},info)=>{
  const csrf=await (await request.get('/api/auth/csrf')).json();
  await request.post('/api/auth/callback/credentials',{form:{csrfToken:csrf.csrfToken,email:info.project.name+'@example.invalid',password:'Disposable-ui-test-2026!',callbackUrl:'http://127.0.0.1:3113/'}});
  expect((await (await request.get('/api/auth/session')).json()).user?.id).toBe('ui-'+info.project.name);
  cookies=(await request.storageState()).cookies;
});
test.beforeEach(async({context})=>{await context.addCookies(cookies)});
for(const theme of THEMES) test(`layout, menu and score explanation: ${theme.id}`,async({page})=>{
  expect((await page.request.patch('/api/user/preferences',{data:{theme:theme.id,favoriteTeam:'BAL',reducedMotion:true}})).ok()).toBeTruthy();
  for(const width of [320,390,1366]){
    await page.setViewportSize({width,height:844});await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme',theme.id);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
    const nav=page.getByRole('navigation',{name:'Main navigation'});
    await expect(nav.getByRole('link',{name:'Leaderboard',exact:true})).toBeInViewport();
    await nav.getByRole('button',{name:'More navigation'}).click();
    await expect(page.getByRole('menuitem',{name:'History'})).toBeVisible();
    await page.keyboard.press('Escape');await expect(page.getByRole('menu')).toHaveCount(0);
    await page.getByRole('button',{name:/Explain season points/}).first().click();
    await expect(page.getByRole('dialog')).toContainText('1 correct + 1 bonus = 2 scored points');
    await expect(page.getByRole('dialog')).not.toContainText('guessedTotal');
    await page.getByRole('button',{name:'Close',exact:true}).click();
    await nav.getByRole('button',{name:'Open league chat'}).click();
    await expect(page.getByRole('button',{name:'Close group chat'})).toBeInViewport();
    await page.getByRole('textbox',{name:'Chat message'}).fill('Unsent layout test');
    await page.getByRole('button',{name:'Close group chat'}).click();
  }
});
test('week choice persists without silently replacing the current week',async({page})=>{
  await page.goto('/picks/3');await expect(page.getByRole('combobox',{name:'Viewing week'})).toHaveValue('3');
  await page.goto('/picks');await expect(page.getByRole('link',{name:'Continue viewing Week 3 · Next week'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Current week · Week 2'})).toBeVisible();
  const response=await page.request.get('/api/leaderboard');const data=await response.json();
  for(const entry of data.entries) for(const week of entry.scoreBreakdown) expect(Object.keys(week).sort()).toEqual(['bonus','correct','effective','final','rank','raw','tiebreakerUsed','trueTie','week','weekId'].sort());
});
test('large text and short screen keep navigation and chat close accessible',async({page})=>{
  await page.setViewportSize({width:390,height:430});
  await page.goto('/');
  await page.addStyleTag({content:'html { font-size: 24px !important; }'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.getByRole('button',{name:'More navigation'}).click();
  await expect(page.getByRole('menu')).toBeInViewport();
  await page.keyboard.press('Escape');
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Open league chat'}).click();
  await page.getByRole('textbox',{name:'Chat message'}).focus();
  await expect(page.getByRole('button',{name:'Close group chat'})).toBeInViewport();
  await page.getByRole('button',{name:'Close group chat'}).click();
});
test('ordinary picks and tiebreakers save while final games reject changes',async({page})=>{
  expect((await page.request.post('/api/picks',{data:{weekId:'ui-week-2',gameId:'ui-game-2',pickedTeam:'BUF'}})).ok()).toBeTruthy();
  expect((await page.request.post('/api/picks',{data:{weekId:'ui-week-2',tiebreakerTotal:45}})).ok()).toBeTruthy();
  const saved=await (await page.request.get('/api/picks?weekId=ui-week-2')).json();
  expect(saved.picks[0].pickedTeam).toBe('BUF');expect(saved.tiebreaker.guessedTotal).toBe(45);
  expect((await page.request.post('/api/picks',{data:{weekId:'ui-week-1',gameId:'ui-game-1',pickedTeam:'KC'}})).status()).toBe(403);
  expect((await page.request.post('/api/picks',{data:{weekId:'ui-week-1',tiebreakerTotal:99}})).status()).toBe(403);
});
