#!/usr/bin/env bash
set -euo pipefail

: "${CRON_SCHEDULE:=0 0 * * *}"
: "${TZ:=Asia/Dhaka}"
: "${CRON_COMMAND:=cd /app && node dist/src/jobs/task-deadline-reminders.runner}"

if [ -f "/usr/share/zoneinfo/${TZ}" ]; then
  ln -snf "/usr/share/zoneinfo/${TZ}" /etc/localtime
  echo "${TZ}" > /etc/timezone
fi

# Expose container env vars to cron commands (safely escaped).
# This avoids syntax errors when values contain spaces, #, <, >, quotes, etc.
{
  echo "#!/usr/bin/env bash"
  while IFS='=' read -r name value; do
    # Skip invalid env names just in case.
    if [[ ! "$name" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      continue
    fi
    printf 'export %s=%q\n' "$name" "$value"
  done < <(printenv)
} > /etc/profile.d/cron_env.sh
chmod +x /etc/profile.d/cron_env.sh

cat > /etc/cron.d/task-deadline-reminders <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
${CRON_SCHEDULE} root . /etc/profile.d/cron_env.sh; ${CRON_COMMAND} >> /proc/1/fd/1 2>> /proc/1/fd/2
EOF

chmod 0644 /etc/cron.d/task-deadline-reminders
crontab /etc/cron.d/task-deadline-reminders

echo "[cron-worker] timezone=${TZ} schedule='${CRON_SCHEDULE}'"
echo "[cron-worker] command='${CRON_COMMAND}'"

exec cron -f

