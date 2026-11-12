# Native companion integration

The website and native API share the same database, picks, ranking, and sessions/accounts. **The server integration is included; the iOS app is not.** You need a compatible client and, for Apple push, your own Apple Developer setup. The repository contains no bundle registration, signing certificate, provisioning profile, key, TestFlight link, or app distribution.

## API contract

Use your server’s HTTPS origin with `/api/v1` appended. This API is for player clients, not a multi-tenant league-creation service. Begin with `GET /api/v1/capabilities`; respect the advertised capabilities rather than assuming management or account deletion is available.

| Endpoint | Purpose |
| --- | --- |
| `GET /capabilities` | Public feature/compatibility discovery |
| `POST /auth/login` | JSON email/password and optional client string; returns bearer session |
| `POST /auth/logout` | Revoke that bearer session and its registrations |
| `GET /me` | Signed-in account |
| `GET /leagues` | Accessible personal league identifier |
| `GET /experience` | Preferences, themes, team metadata |
| `GET/POST/DELETE /pick-reminders` | Read settings, opt in a device, remove current-session registrations |
| `POST/DELETE /live-activities` | Register or stop an activity |

Other league-scoped picks, tiebreakers, standings, members, profiles, challenges, calendar, inbox, and record routes are implemented in `src/lib/mobile-api.ts` and its player/experience modules. See `scripts/test-mobile-db.ts` for executable request/response examples, including lock and privacy checks.

Send `Authorization: Bearer <token>` on protected calls and `Content-Type: application/json` for JSON. Do not put bearer tokens in URLs or logs. Store them in the client platform’s secure credential store. Sessions expire after seven days and can be revoked; handle 401 by signing in again. Temporary-password accounts must change their password through the website first. Native administrators/management flows are not supported. Requests have rate limits and bounded JSON bodies.

Logo URLs are empty when the operator disables logo loading. Feed-dependent details may be absent; clients must handle missing fields without inventing results. The `pickem://picks?league=...&week=...` reminder URL requires a compatible client URL scheme. The activity payload contract is in `src/lib/live-activity-payload.ts`; match its keys and state types in your client.

## Optional APNs

1. Register and sign your own compatible app. Set up the required Push Notifications and Live Activity capabilities with Apple.
2. Create appropriate APNs credentials for your app. Store private key files under ignored `secrets/apns/`, outside the source tree if you use your own mount. Restrict file access while allowing the app container’s UID 1001 to read them.
3. Set these variables in the private `.env`:

```dotenv
APNS_BUNDLE_ID=org.example.yourpickem
APNS_TEAM_ID=YOUR_TEAM_ID
APNS_PRODUCTION_KEY_ID=YOUR_PRODUCTION_KEY_ID
APNS_PRODUCTION_KEY_PATH=/run/secrets/apns/production.p8
APNS_SANDBOX_KEY_ID=YOUR_SANDBOX_KEY_ID
APNS_SANDBOX_KEY_PATH=/run/secrets/apns/sandbox.p8
LIVE_ACTIVITIES_ENABLED=true
PICK_REMINDERS_ENABLED=true
```

4. Start/recreate with the optional mount:

```sh
docker compose -f compose.yaml -f compose.apns.yaml up -d
```

Use both files for subsequent operations, or set `COMPOSE_FILE=compose.yaml:compose.apns.yaml` in your private environment on POSIX hosts. Both push environments and a valid bundle ID must be configured before push capabilities are advertised. Credentials are never silently substituted across environments. The alert topic is your bundle ID; the Live Activity topic appends `.push-type.liveactivity`.

The client sends its provisioning environment, device token, and—for activities—activity/game identifiers. The server binds registrations to the authenticated account/session and enforces quotas. Players explicitly opt in to reminders. Logout, account changes, expired sessions, global preferences, saved picks, and kickoff locks affect delivery. APNs acceptance does not guarantee on-screen delivery; verify on actual sandbox and TestFlight/production devices you control. This repository’s automated tests use synthetic tokens and injected senders, not your APNs account.

## Optional automation API

Personal automation remains available at `/api/automation/week` and `/api/automation/picks`. It uses a player’s own API key and an explicit `AUTOPICK_ALLOWED_USER_ID` allowlist setting. Leave the setting blank to disable it. Never place an API key in a public script, browser bundle, URL, or issue. Inspect the route schemas before building an integration; it cannot bypass kickoff locks or submit for another player.
