import { defineConfig } from '@playwright/test';
if (!process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).pathname !== '/nflpicks_ui_test') throw new Error('UI tests require the disposable nflpicks_ui_test database');
export default defineConfig({
  testDir:'./tests/e2e', fullyParallel:false, workers:1, timeout:60000, maxFailures:3,
  reporter:[['list'],['html',{open:'never'}]],
  use:{baseURL:'http://127.0.0.1:3113',trace:'retain-on-failure'},
  projects:[{name:'chromium',use:{browserName:'chromium'}},{name:'webkit',use:{browserName:'webkit'}}],
  webServer:{command:'npm run start -- --hostname 127.0.0.1 --port 3113',url:'http://127.0.0.1:3113/login',reuseExistingServer:false,timeout:120000},
});
