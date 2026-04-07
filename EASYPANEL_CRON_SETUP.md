# Easypanel Cron Worker Setup (Production)

This project uses a dedicated worker container for task-deadline reminder emails.

## What is already implemented

- Deadline job runner: `npm run job:task-deadline-reminders`
- Worker image: `Dockerfile.worker`
- Worker entrypoint: `scripts/cron-worker-entrypoint.sh`
- Timezone-aware reminder logic using `REMINDER_TIMEZONE` (set to `Asia/Dhaka`)

## Easypanel configuration

Create a **new app/service** in the same project (example name: `backend-cron-worker`) and configure:

- Build context: your backend repo path
- Dockerfile: `Dockerfile.worker`
- Replicas: `1`
- No public port required

## Required environment variables on worker

Use the same env values as backend API for DB and mail:

- `DATABASE_URL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `MAIL_FROM`
- `PUBLIC_APP_URL`
- `APP_NAME`
- `REMINDER_TIMEZONE=Asia/Dhaka`

Cron-specific envs:

- `TZ=Asia/Dhaka`
- `CRON_SCHEDULE=0 0 * * *`
- `CRON_COMMAND=cd /app && node dist/src/jobs/task-deadline-reminders.runner`

## Schedule notes

- `CRON_SCHEDULE=0 0 * * *` means daily at 12:00 AM in container timezone.
- Because `TZ=Asia/Dhaka`, this runs at Bangladesh midnight.

## Validation

After deploy, check worker logs:

- startup logs should show `[cron-worker] timezone=Asia/Dhaka schedule='0 0 * * *'`
- at trigger time, Nest logs from `TaskDeadlineRemindersService` should appear

