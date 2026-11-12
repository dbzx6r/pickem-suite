#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ -e .env ]; then echo '.env already exists; edit it directly. Nothing overwritten.'; exit 1; fi
command -v openssl >/dev/null || { echo 'Install OpenSSL first.'; exit 1; }
umask 077
cp .env.example .env
# No Python or Node is required for this bootstrap.
db_secret=$(openssl rand -hex 32)
auth_secret=$(openssl rand -hex 32)
cron_secret=$(openssl rand -hex 32)
admin_secret="Aa1-$(openssl rand -hex 24)"
sed -e "s/REPLACE_WITH_RANDOM_HEX/$db_secret/" .env > .env.tmp
# Replace auth/cron independently; all generated values are safe hexadecimal.
sed -e "s/^AUTH_SECRET=.*/AUTH_SECRET=$auth_secret/" -e "s/^CRON_SECRET=.*/CRON_SECRET=$cron_secret/" -e "s/REPLACE_WITH_STRONG_PASSWORD/$admin_secret/" .env.tmp > .env
rm .env.tmp
printf '%s\n' 'Created private .env with random credentials.' 'Edit APP_URL, ADMIN_EMAIL, and LEAGUE_NAME before starting.' 'Your initial administrator password is ADMIN_SEED_PASSWORD in .env.'
