# Development

Use Node 22 and PostgreSQL 16. `npm ci`, `npx prisma generate`, then configure a local `DATABASE_URL` pointing to a disposable development database. Native and web routes use the same schema. The provided initial migration replaces private deployment history; it is not an upgrade path for unrelated installations.

For a non-Docker dev server, copy `.env.example` to a private `.env`, supply random secrets, add `DATABASE_URL`, set `AUTH_URL`/`NEXTAUTH_URL` to `http://localhost:3000` and `NEXTAUTH_URL_INTERNAL=http://localhost:3000`, then run:

```sh
npx prisma migrate deploy
node --env-file=.env prisma/seed.cjs
npm run dev
```

Node scripts do not automatically load `.env`; `node --env-file=.env prisma/seed.cjs` is an alternative for seeding outside Docker. The Next.js server and Prisma CLI load `.env` themselves. Do not use a production database for development or tests.

## Checks

```sh
npm ci
npx prisma generate
npm test
npx tsc --noEmit --pretty false
npm run lint
npm audit --omit=dev --audit-level=high
npm run build
```

Unit tests cover scoring, kickoff/reveal rules, standings, themes, tiebreakers, schedule safety, and push configuration. Database test scripts explicitly require named disposable databases. Browser tests require `nflpicks_ui_test`, synthetic fixtures from `scripts/seed-ui-test.cjs`, and Chromium/WebKit (`npx playwright install --with-deps chromium webkit`). CI creates disposable databases, migrates from empty, checks bootstrap idempotency, runs server and native tests, and runs browser regressions. Never weaken the database guards to run tests against a real league.

## Layout and extension points

- `src/app`: Next.js pages and web/native routes.
- `src/lib`: scoring, locks, provider adapter, authentication, reminders, and native contracts.
- `src/components`: responsive UI; `ui/` includes upstream-derived primitives.
- `src/lib/espn.ts`: optional provider integration. Replace this boundary with a provider you are licensed to use.
- `prisma/schema.prisma`: persistent model; add forward migrations for future releases.
- `prisma/seed.cjs`: first administrator only, no real games or players.

Build-time `NEXT_PUBLIC_*` values are public. Never add secrets there. Keep sports data and real league details out of snapshots, fixtures, screenshots, and sample environments. No iOS files belong in this repository; changes to native API contracts should remain backward compatible where practical.
