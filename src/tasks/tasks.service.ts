import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TaskStatus, TaskPriority, UserRole } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '@prisma/client';
import {
    extractMentionHandlesWithCatalog,
    joinTextsForMentions,
} from '../common/mentions/mention.util';
import { MailService } from '../mail/mail.service';
import {
    htmlMentionEmail,
    htmlTaskAssignedEmail,
    subjectMention,
    subjectTaskAssigned,
} from '../mail/task-email.templates';

@Injectable()
export class TasksService {
    constructor(
        private prisma: PrismaService,
        private notificationsService: NotificationsService,
        private mail: MailService,
    ) {}

    private appName(): string {
        return this.mail.getAppDisplayName();
    }

    private taskEmailContext(task: {
        id: string;
        title: string;
        status: TaskStatus;
        priority: TaskPriority;
        startDate: Date | null;
        dueDate: Date | null;
        project?: { name: string } | null;
    }) {
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

    async create(
        userId: string,
        data: {
            projectId: string;
            listId?: string;
            title: string;
            description?: string;
            note?: string;
            priority: TaskPriority;
            assignedToId?: string;
            startDate?: Date;
            dueDate?: Date;
            estimatedTime?: number;
            parentTaskId?: string;
            assigneeIds?: string[];
        },
    ) {
        const { assigneeIds, ...rest } = data;
        const assignedToId = rest.assignedToId ?? assigneeIds?.[0];
        const task = await this.prisma.task.create({
            data: {
                ...rest,
                assignedToId,
                createdById: userId,
            },
            include: {
                project: true,
                assignedTo: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                createdBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                subTasks: {
                    include: {
                        assignedTo: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                            },
                        },
                    },
                },
                taskAssignees: {
                    include: {
                        user: { select: { id: true, name: true, email: true } },
                    },
                },
            },
        });
        if (assigneeIds?.length) {
            await this.prisma.taskAssignee.createMany({
                data: assigneeIds.map((uid) => ({ taskId: task.id, userId: uid })),
                skipDuplicates: true,
            });
            const result = await this.prisma.task.findUnique({
                where: { id: task.id },
                include: {
                    project: true,
                    assignedTo: { select: { id: true, name: true, email: true } },
                    createdBy: { select: { id: true, name: true, email: true } },
                    subTasks: {
                        include: {
                            assignedTo: { select: { id: true, name: true, email: true } },
                        },
                    },
                    taskAssignees: {
                        include: {
                            user: { select: { id: true, name: true, email: true } },
                        },
                    },
                },
            });
            await this.notifyTaskAssigned(result!, userId);
            await this.notifyUsersMentionedInTexts(
                [result!.description ?? '', result!.note ?? ''],
                { id: result!.id, title: result!.title },
                userId,
                'task_field',
            );
            return result!;
        }
        if (assignedToId && assignedToId !== userId) {
            await this.notifyTaskAssigned(task, userId);
        }
        await this.notifyUsersMentionedInTexts(
            [task.description ?? '', task.note ?? ''],
            { id: task.id, title: task.title },
            userId,
            'task_field',
        );
        return task;
    }

    async findAll(filters?: {
        projectId?: string;
        listId?: string;
        assignedToId?: string;
        status?: TaskStatus;
        priority?: TaskPriority;
    }) {
        return this.prisma.task.findMany({
            where: {
                parentTaskId: null, // Only get parent tasks
                ...(filters?.projectId && { projectId: filters.projectId }),
                ...(filters?.listId && { listId: filters.listId }),
                ...(filters?.assignedToId && { assignedToId: filters.assignedToId }),
                ...(filters?.status && { status: filters.status }),
                ...(filters?.priority && { priority: filters.priority }),
            },
            include: {
                project: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                assignedTo: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                taskAssignees: {
                    include: {
                        user: { select: { id: true, name: true, email: true } },
                    },
                },
                createdBy: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                subTasks: {
                    include: {
                        project: { select: { id: true, name: true } },
                        assignedTo: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                            },
                        },
                        subTasks: {
                            include: {
                                project: { select: { id: true, name: true } },
                                assignedTo: {
                                    select: {
                                        id: true,
                                        name: true,
                                        email: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
    }

    async findOne(id: string) {
        return this.prisma.task.findUnique({
            where: { id },
            include: {
                project: true,
                parentTask: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
                assignedTo: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                taskAssignees: {
                    include: {
                        user: { select: { id: true, name: true, email: true } },
                    },
                },
                createdBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                subTasks: {
                    include: {
                        assignedTo: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                            },
                        },
                        subTasks: {
                            include: {
                                assignedTo: {
                                    select: {
                                        id: true,
                                        name: true,
                                        email: true,
                                    },
                                },
                            },
                        },
                    },
                },
                comments: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                            },
                        },
                    },
                    orderBy: {
                        createdAt: 'desc',
                    },
                },
            },
        });
    }

    async update(
        id: string,
        data: Partial<{
            title: string;
            description: string;
            note: string;
            status: TaskStatus;
            priority: TaskPriority;
            assignedToId: string;
            startDate: Date;
            dueDate: Date;
            timeSpent: number;
            estimatedTime: number;
            assigneeIds: string[];
        }>,
        updatedByUserId?: string,
    ) {
        const { assigneeIds, ...rest } = data;
        const existing = await this.prisma.task.findUnique({
            where: { id },
            select: {
                title: true,
                description: true,
                note: true,
                status: true,
                priority: true,
                startDate: true,
                dueDate: true,
                assignedToId: true,
                taskAssignees: { select: { userId: true } },
            },
        });
        let previousAssigneeIds = new Set<string>();
        if (existing) {
            if (existing.assignedToId) previousAssigneeIds.add(existing.assignedToId);
            existing.taskAssignees?.forEach((ta) => previousAssigneeIds.add(ta.userId));
        }
        if (assigneeIds !== undefined) {
            await this.prisma.taskAssignee.deleteMany({ where: { taskId: id } });
            if (assigneeIds.length > 0) {
                await this.prisma.taskAssignee.createMany({
                    data: assigneeIds.map((userId) => ({ taskId: id, userId })),
                    skipDuplicates: true,
                });
            }
            rest.assignedToId = assigneeIds.length > 0 ? assigneeIds[0] : null;
        }
        const updated = await this.prisma.task.update({
            where: { id },
            data: rest,
            include: {
                project: true,
                createdBy: { select: { id: true } },
                assignedTo: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                taskAssignees: {
                    include: {
                        user: { select: { id: true, name: true, email: true } },
                    },
                },
                subTasks: {
                    include: {
                        assignedTo: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                            },
                        },
                        subTasks: {
                            include: {
                                assignedTo: {
                                    select: {
                                        id: true,
                                        name: true,
                                        email: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        if (assigneeIds !== undefined && updatedByUserId) {
            const newAssigneeIds = new Set(assigneeIds);
            const newlyAssigned = [...newAssigneeIds].filter((uid) => !previousAssigneeIds.has(uid) && uid !== updatedByUserId);
            if (newlyAssigned.length > 0) {
                await this.notifyTaskAssignedToUsers(
                    updated,
                    newlyAssigned,
                    updatedByUserId,
                );
            }
        }
        if (updatedByUserId && existing) {
            const changedFields = this.getActuallyChangedFields(existing, updated, previousAssigneeIds);
            this.notifyTaskUpdated(updated, updatedByUserId, changedFields);
            if (changedFields.includes('Status')) {
                this.notifyTaskStatusChangeToAdminAndAssigner(updated, updatedByUserId);
            }
            const mentionTexts: string[] = [];
            if (changedFields.includes('Description')) {
                mentionTexts.push(updated.description ?? '');
            }
            if (changedFields.includes('Note')) {
                mentionTexts.push(updated.note ?? '');
            }
            if (mentionTexts.length > 0) {
                await this.notifyUsersMentionedInTexts(
                    mentionTexts,
                    { id: updated.id, title: updated.title },
                    updatedByUserId,
                    'task_field',
                );
            }
        }
        return updated;
    }

    /**
     * Compare previous task state with updated state and return only fields that actually changed.
     */
    private getActuallyChangedFields(
        existing: { title: string; description: string | null; note: string | null; status: TaskStatus; priority: TaskPriority; startDate: Date | null; dueDate: Date | null; assignedToId: string | null; taskAssignees: { userId: string }[] },
        updated: { title: string; description: string | null; note: string | null; status: TaskStatus; priority: TaskPriority; startDate: Date | null; dueDate: Date | null; assignedToId: string | null; taskAssignees: { user: { id: string } }[] },
        previousAssigneeIds: Set<string>,
    ): string[] {
        const labels: string[] = [];
        if (existing.title !== updated.title) labels.push('Title');
        if ((existing.description ?? '') !== (updated.description ?? '')) labels.push('Description');
        if ((existing.note ?? '') !== (updated.note ?? '')) labels.push('Note');
        if (existing.status !== updated.status) labels.push('Status');
        if (existing.priority !== updated.priority) labels.push('Priority');
        const existingStart = existing.startDate?.getTime();
        const updatedStart = updated.startDate?.getTime();
        if (existingStart !== updatedStart) labels.push('Start date');
        const existingDue = existing.dueDate?.getTime();
        const updatedDue = updated.dueDate?.getTime();
        if (existingDue !== updatedDue) labels.push('Due date');
        const newAssigneeIds = new Set<string>();
        if (updated.assignedToId) newAssigneeIds.add(updated.assignedToId);
        updated.taskAssignees?.forEach((ta) => newAssigneeIds.add(ta.user.id));
        const assigneesChanged = previousAssigneeIds.size !== newAssigneeIds.size ||
            [...previousAssigneeIds].some((id) => !newAssigneeIds.has(id));
        if (assigneesChanged) labels.push('Assignees');
        return labels;
    }

    async delete(id: string) {
        // Delete task plus any related records that can block deletion
        await this.prisma.$transaction(async (tx) => {
            // Collect this task and its direct subtasks
            const tasks = await tx.task.findMany({
                where: {
                    OR: [{ id }, { parentTaskId: id }],
                },
                select: { id: true },
            });

            if (tasks.length === 0) {
                // Nothing to delete – behave as success
                return;
            }

            const taskIds = tasks.map((t) => t.id);

            // Remove time entries referencing these tasks
            await tx.timeEntry.deleteMany({
                where: { taskId: { in: taskIds } },
            });

            // Remove comments referencing these tasks
            await tx.comment.deleteMany({
                where: { taskId: { in: taskIds } },
            });

            // Finally delete the tasks (parent + subtasks)
            await tx.task.deleteMany({
                where: { id: { in: taskIds } },
            });
        });

        return true;
    }

    /**
     * Returns a flat list of tasks (parents and subtasks) for selection in time-tracker etc.
     * Does not filter by parentTaskId - includes both parent and subtask.
     */
    async findAllForSelection(filters?: {
        projectId?: string;
        assignedToId?: string;
    }) {
        return this.prisma.task.findMany({
            where: {
                ...(filters?.projectId && { projectId: filters.projectId }),
                ...(filters?.assignedToId && { assignedToId: filters.assignedToId }),
            },
            include: {
                parentTask: {
                    select: { id: true, title: true },
                },
                project: {
                    select: { id: true, name: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async addComment(taskId: string, userId: string, content: string) {
        const comment = await this.prisma.comment.create({
            data: {
                taskId,
                userId,
                content,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });
        const task = await this.prisma.task.findUnique({
            where: { id: taskId },
            select: { id: true, title: true },
        });
        if (task) {
            await this.notifyUsersMentionedInTexts(
                [content],
                task,
                userId,
                'comment',
            );
        }
        return comment;
    }

    /**
     * Resolve @handles to user ids: full email (case-insensitive) or exact full name (unique).
     */
    private async resolveMentionHandlesToUserIds(
        handles: string[],
        allUsers?: { id: string; name: string; email: string }[],
    ): Promise<string[]> {
        const unique = [...new Set(handles.map((h) => h.trim()).filter(Boolean))];
        if (unique.length === 0) return [];

        const users =
            allUsers ??
            (await this.prisma.user.findMany({
                where: { status: 'ACTIVE' },
                select: { id: true, name: true, email: true },
            }));
        const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));
        const byNameLower = new Map<string, string[]>();
        for (const u of users) {
            const key = u.name.toLowerCase().trim();
            if (!byNameLower.has(key)) byNameLower.set(key, []);
            byNameLower.get(key)!.push(u.id);
        }

        const ids = new Set<string>();
        for (const h of unique) {
            const hl = h.toLowerCase();
            if (h.includes('@') && h.includes('.')) {
                const id = byEmail.get(hl);
                if (id) ids.add(id);
                continue;
            }
            const nameMatches = byNameLower.get(hl) ?? [];
            if (nameMatches.length === 1) {
                ids.add(nameMatches[0]);
            } else if (nameMatches.length > 1) {
                console.warn(
                    `Mention "${h}" matches multiple users with the same name; skipped.`,
                );
            }
        }
        return [...ids];
    }

    private async notifyUsersMentionedInTexts(
        texts: string[],
        task: { id: string; title: string },
        authorUserId: string,
        kind: 'comment' | 'task_field',
    ): Promise<void> {
        const combined = joinTextsForMentions(texts);
        if (!combined.includes('@')) return;

        const allUsers = await this.prisma.user.findMany({
            where: { status: 'ACTIVE' },
            select: { id: true, name: true, email: true },
        });
        const names = allUsers.map((u) => u.name);
        const handles = extractMentionHandlesWithCatalog(combined, names);
        if (handles.length === 0) return;

        const targetIds = await this.resolveMentionHandlesToUserIds(handles, allUsers);
        if (targetIds.length === 0) return;

        const author = await this.prisma.user.findUnique({
            where: { id: authorUserId },
            select: { name: true },
        });
        const authorName = author?.name ?? 'Someone';
        const link = `/dashboard/tasks/${task.id}`;
        const title =
            kind === 'comment'
                ? 'You were mentioned in a comment'
                : 'You were mentioned on a task';
        const action =
            kind === 'comment'
                ? 'mentioned you in a comment on'
                : 'mentioned you on';

        const fullTask = await this.prisma.task.findUnique({
            where: { id: task.id },
            include: { project: true },
        });

        const contextLabel =
            kind === 'comment'
                ? 'in a comment on this task'
                : 'in the task description or notes';
        const excerpt =
            kind === 'comment' ? (texts[0] ?? '') : combined;

        for (const uid of targetIds) {
            if (uid === authorUserId) continue;
            try {
                await this.notificationsService.create(uid, {
                    title,
                    message: `${authorName} ${action} "${task.title}".`,
                    type: NotificationType.INFO,
                    link,
                });
            } catch (err) {
                console.error('Failed to notify mentioned user', uid, err);
            }

            if (fullTask) {
                const mentionedUser = allUsers.find((u) => u.id === uid);
                if (mentionedUser?.email) {
                    const ctx = {
                        ...this.taskEmailContext(fullTask),
                        authorName,
                        contextLabel,
                        excerpt,
                    };
                    const html = htmlMentionEmail(mentionedUser.name, ctx);
                    await this.mail.sendMailIfConfigured(
                        mentionedUser.email,
                        subjectMention(fullTask.title),
                        html,
                    );
                }
            }
        }
    }

    /**
     * Notify users who were assigned to the task (excluding the person who did the assign).
     */
    private async notifyTaskAssigned(
        task: {
            id: string;
            title: string;
            status: TaskStatus;
            priority: TaskPriority;
            startDate: Date | null;
            dueDate: Date | null;
            project?: { name: string } | null;
            assignedToId?: string | null;
            taskAssignees?: { user: { id: string } }[];
        },
        assignedByUserId: string,
    ): Promise<void> {
        const assigneeIds = new Set<string>();
        if (task.assignedToId) assigneeIds.add(task.assignedToId);
        task.taskAssignees?.forEach((ta) => assigneeIds.add(ta.user.id));
        assigneeIds.delete(assignedByUserId);
        await this.notifyTaskAssignedToUsers(task, [...assigneeIds], assignedByUserId);
    }

    /**
     * Send "Task assigned" notification to the given user ids.
     */
    private async notifyTaskAssignedToUsers(
        task: {
            id: string;
            title: string;
            status: TaskStatus;
            priority: TaskPriority;
            startDate: Date | null;
            dueDate: Date | null;
            project?: { name: string } | null;
        },
        userIds: string[],
        assignedByUserId?: string | null,
    ) {
        if (userIds.length === 0) return;
        const projectName = task.project?.name ?? 'Project';
        const message = `You were assigned to "${task.title}" in ${projectName}.`;
        const link = `/dashboard/tasks/${task.id}`;

        let assignedByName: string | null = null;
        if (assignedByUserId) {
            const assigner = await this.prisma.user.findUnique({
                where: { id: assignedByUserId },
                select: { name: true },
            });
            assignedByName = assigner?.name ?? null;
        }

        const users = await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, email: true },
        });

        for (const userId of userIds) {
            try {
                await this.notificationsService.create(userId, {
                    title: 'Task assigned',
                    message,
                    type: NotificationType.INFO,
                    link,
                });
            } catch (err) {
                console.error('Failed to send task assignment notification to', userId, err);
            }
        }

        const ctx = this.taskEmailContext(task);
        for (const u of users) {
            if (!u.email) {
                console.warn(
                    `[TasksService] Skipping assignment email for user ${u.id}: no email on record.`,
                );
                continue;
            }
            const html = htmlTaskAssignedEmail(u.name, ctx, assignedByName);
            const mailResult = await this.mail.sendMailIfConfigured(
                u.email,
                subjectTaskAssigned(task.title),
                html,
            );
            if (!mailResult.sent) {
                console.warn(
                    `[TasksService] Assignment email not sent to ${u.email}:`,
                    mailResult.reason ?? 'unknown',
                );
            }
        }
    }

    /**
     * When task status is updated by an employee, notify admin(s) and the person who
     * assigned/created the task. If admin and assigner are the same person, send only
     * one notification. Excludes the user who made the update.
     */
    private async notifyTaskStatusChangeToAdminAndAssigner(
        task: { id: string; title: string; project?: { name: string } | null; createdBy?: { id: string } | null },
        updatedByUserId: string,
    ) {
        const notifyUserIds = new Set<string>();

        const adminUsers = await this.prisma.user.findMany({
            where: { role: UserRole.ADMIN },
            select: { id: true },
        });
        adminUsers.forEach((u) => notifyUserIds.add(u.id));

        if (task.createdBy?.id) {
            notifyUserIds.add(task.createdBy.id);
        }

        notifyUserIds.delete(updatedByUserId);
        if (notifyUserIds.size === 0) return;

        const projectName = task.project?.name ?? 'Project';
        const message = `Task "${task.title}" in ${projectName} has been updated (status changed).`;
        const link = `/dashboard/tasks/${task.id}`;
        for (const userId of notifyUserIds) {
            try {
                await this.notificationsService.create(userId, {
                    title: 'Task status updated',
                    message,
                    type: NotificationType.INFO,
                    link,
                });
            } catch (err) {
                console.error('Failed to send task status change notification to', userId, err);
            }
        }
    }

    /**
     * Notify assignees that the task was updated (excluding the user who made the edit).
     * Lists only the fields that actually changed (compared before vs after).
     */
    private async notifyTaskUpdated(
        task: { id: string; title: string; project?: { name: string } | null; assignedToId?: string | null; taskAssignees?: { user: { id: string } }[] },
        updatedByUserId: string,
        changedFields: string[],
    ) {
        const assigneeIds = new Set<string>();
        if (task.assignedToId) assigneeIds.add(task.assignedToId);
        task.taskAssignees?.forEach((ta) => assigneeIds.add(ta.user.id));
        assigneeIds.delete(updatedByUserId);
        if (assigneeIds.size === 0) return;
        const projectName = task.project?.name ?? 'Project';
        const changeText = changedFields.length > 0
            ? ` was updated: ${changedFields.join(', ')}.`
            : ' was updated.';
        const message = `The task "${task.title}" in ${projectName}${changeText}`;
        const link = `/dashboard/tasks/${task.id}`;
        for (const userId of assigneeIds) {
            try {
                await this.notificationsService.create(userId, {
                    title: 'Task updated',
                    message,
                    type: NotificationType.INFO,
                    link,
                });
            } catch (err) {
                console.error('Failed to send task updated notification to', userId, err);
            }
        }
    }
}
