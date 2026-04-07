import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TaskPriority, TaskStatus } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import {
    htmlDeadlineReminderEmail,
    subjectDeadlineReminder,
    type TaskEmailContext,
} from '../mail/task-email.templates';

@Injectable()
export class TaskDeadlineRemindersService {
    private readonly logger = new Logger(TaskDeadlineRemindersService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly mail: MailService,
        private readonly config: ConfigService,
    ) {}

    private appName(): string {
        return (this.config.get<string>('APP_NAME') ?? '').trim() || 'CRM';
    }

    private reminderTimeZone(): string {
        return (this.config.get<string>('REMINDER_TIMEZONE') ?? '').trim() || 'UTC';
    }

    private buildContext(task: {
        id: string;
        title: string;
        status: TaskStatus;
        priority: TaskPriority;
        startDate: Date | null;
        dueDate: Date | null;
        project: { name: string } | null;
    }): TaskEmailContext {
        return {
            taskTitle: task.title,
            projectName: task.project?.name ?? 'Project',
            status: task.status,
            priority: task.priority,
            dueDate: task.dueDate,
            startDate: task.startDate,
            taskUrl: `${this.mail.getPublicAppBaseUrl()}/dashboard/tasks/${task.id}`,
            appName: this.appName(),
        };
    }

    /**
     * Run once per day (triggered by Easypanel cron) — email assignees for tasks due
     * in 3 days or tomorrow, based on the configured timezone's calendar days.
     */
    async runDaily(now: Date = new Date()): Promise<void> {
        const tz = this.reminderTimeZone();
        const todayStart = DateTime.fromJSDate(now).setZone(tz).startOf('day');
        const in3 = todayStart.plus({ days: 3 });
        const in1 = todayStart.plus({ days: 1 });

        await this.sendForDueOnZonedDate(in3, 3);
        await this.sendForDueOnZonedDate(in1, 1);
    }

    private async sendForDueOnZonedDate(
        calendarDayStart: DateTime,
        daysRemaining: 1 | 3,
    ): Promise<void> {
        const gte = calendarDayStart.toUTC().toJSDate();
        const lt = calendarDayStart.plus({ days: 1 }).toUTC().toJSDate();

        const tasks = await this.prisma.task.findMany({
            where: {
                dueDate: { gte, lt },
                status: { not: TaskStatus.COMPLETED },
            },
            include: {
                project: { select: { name: true } },
                assignedTo: { select: { id: true, name: true, email: true } },
                taskAssignees: {
                    include: {
                        user: { select: { id: true, name: true, email: true } },
                    },
                },
            },
        });

        if (tasks.length === 0) {
            return;
        }

        this.logger.log(
            `Deadline reminders (${daysRemaining}d): ${tasks.length} task(s) due on ${calendarDayStart.toISODate()} (${calendarDayStart.zoneName}).`,
        );

        for (const task of tasks) {
            const recipients = new Map<string, { name: string; email: string }>();
            if (task.assignedTo?.email) {
                recipients.set(task.assignedTo.id, {
                    name: task.assignedTo.name,
                    email: task.assignedTo.email,
                });
            }
            for (const ta of task.taskAssignees) {
                if (ta.user.email) {
                    recipients.set(ta.user.id, {
                        name: ta.user.name,
                        email: ta.user.email,
                    });
                }
            }

            if (recipients.size === 0) {
                continue;
            }

            const ctx = this.buildContext({
                id: task.id,
                title: task.title,
                status: task.status,
                priority: task.priority,
                startDate: task.startDate,
                dueDate: task.dueDate,
                project: task.project,
            });

            for (const { name, email } of recipients.values()) {
                const html = htmlDeadlineReminderEmail(name, ctx, daysRemaining);
                const subj = subjectDeadlineReminder(task.title, daysRemaining);
                const result = await this.mail.sendMailIfConfigured(email, subj, html);
                if (!result.sent && result.reason !== 'smtp_not_configured') {
                    this.logger.warn(
                        `Could not send deadline email to ${email}: ${result.reason}`,
                    );
                }
            }
        }
    }
}
