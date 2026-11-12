# Operations and recovery

## Keep it private

Run one trusted private league per installation. Registration is closed by default. Keep `.env`, APNs keys, database dumps, and uploaded avatars outside Git. Database records include account email addresses, password hashes, picks, chat, notification endpoints, and device tokens. Restrict administrator access and use HTTPS. Decide and communicate retention/deletion practices to participants. This repository has no automatic email recovery service or full self-service account-deletion workflow; commissioners handle requests.

The internal worker calls authenticated sync/reminder routes every five minutes. Monitor `docker compose ps` and `docker compose logs --tail=100 app scheduler`. Do not publish raw logs or configuration expansions; redact account identifiers, tokens, cookies, and messages first. A healthy web process does not prove the sports provider or notification services are working.

## Back up

From the installation directory, create a private destination. These commands read data; keep the resulting files confidential:

```sh
umask 077
mkdir -p backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
docker compose exec -T postgres pg_dump -U pickem -d pickem -Fc > "backups/$stamp.dump"
docker compose exec -T app tar -czf - -C /app/uploads . > "backups/$stamp-avatars.tgz"
docker compose exec -T postgres pg_restore --list < "backups/$stamp.dump" > /dev/null
```

Back up `.env` and any APNs keys separately in encrypted storage. Copy backups off-host. A dump and avatar archive are not an atomic snapshot; stop app/scheduler briefly if you need both to represent precisely the same moment. Test restoration on a separate disposable host/project before trusting a backup.

## Restore to a new installation

Restoring overwrites data. Use a new Compose project/directory, preserve the target’s existing data first, stop its app and scheduler, and verify the target database before proceeding. Do not point these commands at your running league by accident.

Start a fresh PostgreSQL service with the backed-up matching configuration, then restore the custom dump:

```sh
docker compose up -d postgres
# ONLY on the intended empty recovery database:
docker compose exec -T postgres pg_restore -U pickem -d pickem --no-owner --no-acl --exit-on-error < backups/SELECTED.dump
```

Restore the avatar archive into the `avatars` volume using a temporary app container (`docker compose run --rm --no-deps -T app tar -xzf - -C /app/uploads < backups/SELECTED-avatars.tgz`). Restore the matching application version and secrets, then start the app/scheduler and verify login, weeks, standings, and sample picks. Do not rerun an initial seed to “recover” an existing league.

## Update

Read release notes, take a verified backup, and record the current Git revision and image ID. Keep the previous image until validation completes. Use a maintenance window, stop app/scheduler, fetch the desired release, rebuild, run `docker compose run --rm setup` to apply migrations, and restart. The setup script does not replace an existing administrator.

Verify login, player access, current games, lock behavior, standings, and reminders. Migration compatibility determines whether an older image can run against an updated database. Never automatically restore a database to roll back a code change: that can destroy newly submitted picks. Decide the acceptable data-loss window before a restore.

Do not run `docker compose down --volumes`, volume pruning, or database-reset commands against a league you wish to retain.
