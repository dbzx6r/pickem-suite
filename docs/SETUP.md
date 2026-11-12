# Installation

## 1. Prepare a clean installation

Use a new directory and a new PostgreSQL database. The single initial migration is for a **fresh database**, not for upgrading an existing private deployment with different migration history. Do not point it at another application’s database.

Install Docker with Compose v2+, Git, OpenSSL, and a POSIX shell. The supplied containers use Node 22 and PostgreSQL 16. You do not need Node installed on the host for the Docker instructions. Windows users should use WSL2 with Docker integration.

```sh
git clone https://github.com/dbzx6r/pickem-suite.git
cd pickem-suite
sh scripts/configure.sh
```

The script refuses to overwrite an existing `.env`, generates random database/authentication/worker/bootstrap secrets, and restricts the file to its owner. Edit it locally:

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Exact browser origin, initially `http://localhost:3000`; HTTPS for remote users |
| `APP_PORT` | Loopback port on your host, default `3000` |
| `ADMIN_EMAIL` | Your administrator login identifier; no welcome email is sent |
| `ADMIN_SEED_PASSWORD` | Random initial password; required only for first bootstrap |
| `LEAGUE_NAME` | Your league’s display name |
| `SEASON_YEAR` | Optional starting year; blank uses the current calendar year |
| `POSTGRES_PASSWORD` | Generated hexadecimal password; do not rotate without updating the DB role |
| `AUTH_SECRET` | Session signing secret; changing it invalidates sessions |
| `CRON_SECRET` | Internal worker bearer secret; never expose it to browsers |
| `ENABLE_ESPN_DATA` | Optional external feed, default `false` |
| `NEXT_PUBLIC_TEAM_LOGOS_ENABLED` | Optional remote logos, default `false`; requires rebuilding |

Use hexadecimal generated database passwords with the supplied connection URL. If customizing credentials with URL-special characters, URL-encode them in `DATABASE_URL` in your own Compose configuration. Never post the output of `docker compose config` publicly: it expands secrets.

## 2. Build and bootstrap

```sh
docker compose build
docker compose run --rm setup
docker compose up -d
docker compose ps
```

The setup service starts PostgreSQL, applies migrations, and creates one administrator, closed-registration league settings, and an empty regular season. It makes no external sports requests. Re-running it applies outstanding migrations but preserves an existing administrator and all league records. It does not reset forgotten passwords.

Visit the configured origin. Log in with your administrator credentials and change the initial password. Remove `ADMIN_SEED_PASSWORD` from `.env` after that. Keep the other secrets. The administrator manages the league; create a separate player account if you want to make picks yourself.

## 3. Let players connect

The app listens only on `127.0.0.1` on the host. PostgreSQL has no published port. Place a trusted HTTPS reverse proxy in front of the app; configure your own domain and certificate. Example for Caddy **running on the same host**, with your real domain substituted:

```caddyfile
picks.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Set `APP_URL=https://picks.example.com`, then `docker compose up -d`. Forward only the proxy’s required ports. If the proxy is containerized, localhost refers to that container: attach it to an app-facing network and proxy to `app:3000` instead. Do not publish PostgreSQL or expose an untrusted proxy that can inject forwarded host/client-IP headers. `AUTH_TRUST_HOST` assumes you control that proxy and its accepted hostnames.

Private VPN access is another option, but web push and secure cookies still need a trustworthy HTTPS origin for remote devices. Do not expose this as a paid/public signup service.

## 4. Populate your league

Use **Admin → Users** to create players. Use **Weeks** and **Games** to create a slate manually; all dates should represent the intended real kickoff. See the [commissioner guide](COMMISSIONER.md).

For the optional sports adapter, review [rights and limitations](LEGAL.md), set `ENABLE_ESPN_DATA=true`, recreate the app, and run the sync action in Admin. The internal scheduler repeats sync and reminders every five minutes. A failed feed is not a reason to invent results—verify games manually. Enable news separately in league settings if wanted.

For optional logos, set `NEXT_PUBLIC_TEAM_LOGOS_ENABLED=true`, then:

```sh
docker compose build app
docker compose up -d app
```

For web push, generate VAPID keys using the tools image:

```sh
docker compose run --rm --no-deps setup npx web-push generate-vapid-keys
```

Copy the keys into the private `.env`, set `VAPID_SUBJECT` to a valid contact URI you control, and recreate the app. Treat the private key as a secret. Players must allow browser notifications and enable reminders. Native APNs is configured separately in [Native integration](NATIVE_INTEGRATION.md).

## Troubleshooting

- **Port already used:** change `APP_PORT` and the localhost `APP_URL` consistently; adjust the reverse proxy upstream.
- **Database/authentication errors:** ensure `setup` succeeded and inspect `docker compose logs --tail=100 app postgres`. An existing database volume retains its original password; editing `.env` alone does not change it.
- **Redirect/sign-in loop:** check the exact origin, HTTPS forwarding, proxy hostname, and host clock; clear this site’s cookies after changing origins.
- **No games:** the fresh database is intentionally empty. Create games manually or explicitly enable and run sync.
- **No logos:** default behavior. Enabling logos requires an app rebuild and network access to the remote CDN.
- **No reminders:** check app health, scheduler logs, league times, saved picks, opt-in, browser/OS permissions, and VAPID/APNs settings. Notification delivery is not guaranteed.
- **Build fails for lack of space:** free unused build cache after checking what it contains; never delete database volumes to fix a build.
- **Stop without losing records:** `docker compose down`. **Do not add `--volumes`** unless you intentionally want to destroy this installation’s data.
