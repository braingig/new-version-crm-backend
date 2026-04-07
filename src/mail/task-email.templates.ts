import { TaskPriority, TaskStatus } from '@prisma/client';

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatDate(d: Date | null | undefined, locale = 'en-US'): string {
    if (!d) return '—';
    try {
        return new Intl.DateTimeFormat(locale, {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(d);
    } catch {
        return d.toISOString();
    }
}

function formatDateOnly(d: Date | null | undefined, locale = 'en-US'): string {
    if (!d) return '—';
    try {
        return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(d);
    } catch {
        return d.toISOString().slice(0, 10);
    }
}

const priorityLabel: Record<TaskPriority, string> = {
    LOW: 'Low',
    MEDIUM: 'Medium',
    HIGH: 'High',
    URGENT: 'Urgent',
};

const statusLabel: Record<TaskStatus, string> = {
    TODO: 'To do',
    IN_PROGRESS: 'In progress',
    REVIEW: 'Review',
    COMPLETED: 'Completed',
};

function layout(inner: string, appName: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(appName)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f8;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
<tr>
<td style="background:linear-gradient(135deg,#1e3a5f 0%,#2d5a87 100%);padding:20px 28px;">
<p style="margin:0;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.85);">${escapeHtml(appName)}</p>
</td>
</tr>
<tr>
<td style="padding:28px 28px 8px;">
${inner}
</td>
</tr>
<tr>
<td style="padding:0 28px 28px;color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb;">
<p style="margin:16px 0 0;">This is an automated message. Please do not reply directly to this email.</p>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function ctaButton(href: string, label: string): string {
    return `<p style="margin:24px 0 0;">
<a href="${escapeHtml(href)}" style="display:inline-block;background:#1e3a5f;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:14px;">${escapeHtml(label)}</a>
</p>`;
}

function detailRow(label: string, value: string): string {
    return `<tr>
<td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;color:#6b7280;width:140px;vertical-align:top;">${escapeHtml(label)}</td>
<td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;color:#111827;">${value}</td>
</tr>`;
}

export interface TaskEmailContext {
    taskTitle: string;
    projectName: string;
    status: TaskStatus;
    priority: TaskPriority;
    dueDate: Date | null;
    startDate: Date | null;
    taskUrl: string;
    appName: string;
}

export function htmlTaskAssignedEmail(
    recipientName: string,
    ctx: TaskEmailContext,
    assignedByName: string | null,
): string {
    const who = assignedByName ? escapeHtml(assignedByName) : 'A team member';
    const inner = `
<p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#111827;">Hello ${escapeHtml(recipientName)},</p>
<p style="margin:0 0 16px;color:#374151;">${who} has assigned you to a task.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;margin-top:8px;">
${detailRow('Task', `<strong>${escapeHtml(ctx.taskTitle)}</strong>`)}
${detailRow('Project', escapeHtml(ctx.projectName))}
${detailRow('Status', escapeHtml(statusLabel[ctx.status]))}
${detailRow('Priority', escapeHtml(priorityLabel[ctx.priority]))}
${detailRow('Start', escapeHtml(formatDateOnly(ctx.startDate)))}
${detailRow('Due date', escapeHtml(formatDateOnly(ctx.dueDate)))}
</table>
${ctaButton(ctx.taskUrl, 'Open task in CRM')}
`;
    return layout(inner, ctx.appName);
}

export function htmlMentionEmail(
    recipientName: string,
    ctx: TaskEmailContext & { authorName: string; contextLabel: string; excerpt: string | null },
): string {
    const excerptTrim = ctx.excerpt?.trim() ?? '';
    const excerptBlock =
        excerptTrim.length > 0
            ? `<p style="margin:12px 0 0;padding:12px;background:#f9fafb;border-left:3px solid #1e3a5f;border-radius:4px;color:#374151;font-size:14px;white-space:pre-wrap;">${escapeHtml(excerptTrim.slice(0, 2000))}${excerptTrim.length > 2000 ? '…' : ''}</p>`
            : '';
    const inner = `
<p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#111827;">Hello ${escapeHtml(recipientName)},</p>
<p style="margin:0 0 8px;color:#374151;"><strong>${escapeHtml(ctx.authorName)}</strong> mentioned you ${escapeHtml(ctx.contextLabel)}.</p>
${excerptBlock}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;margin-top:16px;">
${detailRow('Task', `<strong>${escapeHtml(ctx.taskTitle)}</strong>`)}
${detailRow('Project', escapeHtml(ctx.projectName))}
${detailRow('Status', escapeHtml(statusLabel[ctx.status]))}
${detailRow('Priority', escapeHtml(priorityLabel[ctx.priority]))}
${detailRow('Due date', escapeHtml(formatDateOnly(ctx.dueDate)))}
</table>
${ctaButton(ctx.taskUrl, 'View task')}
`;
    return layout(inner, ctx.appName);
}

export function htmlDeadlineReminderEmail(
    recipientName: string,
    ctx: TaskEmailContext,
    daysRemaining: 1 | 3,
): string {
    const headline =
        daysRemaining === 1
            ? 'Your task is due tomorrow'
            : 'Your task is due in 3 days';
    const inner = `
<p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#111827;">Hello ${escapeHtml(recipientName)},</p>
<p style="margin:0 0 16px;color:#374151;">${headline}. Please review the details below and update the task status if needed.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;margin-top:8px;">
${detailRow('Task', `<strong>${escapeHtml(ctx.taskTitle)}</strong>`)}
${detailRow('Project', escapeHtml(ctx.projectName))}
${detailRow('Status', escapeHtml(statusLabel[ctx.status]))}
${detailRow('Priority', escapeHtml(priorityLabel[ctx.priority]))}
${detailRow('Due date', escapeHtml(formatDate(ctx.dueDate)))}
</table>
${ctaButton(ctx.taskUrl, 'Open task')}
`;
    return layout(inner, ctx.appName);
}

export function subjectTaskAssigned(taskTitle: string): string {
    return `Task assigned: ${taskTitle}`;
}

export function subjectMention(taskTitle: string): string {
    return `You were mentioned: ${taskTitle}`;
}

export function subjectDeadlineReminder(taskTitle: string, daysRemaining: 1 | 3): string {
    return daysRemaining === 1
        ? `Reminder: "${taskTitle}" is due tomorrow`
        : `Reminder: "${taskTitle}" is due in 3 days`;
}
