#!/bin/sh
set -eu
while true; do
  for task in sync reminders; do
    curl --fail --silent --show-error --max-time 120 -X POST \
      -H "Authorization: Bearer ${CRON_SECRET}" "http://app:3000/api/cron/${task}" || true
  done
  sleep 300
done
