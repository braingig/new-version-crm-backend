import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TaskStatus, TaskPriority, UserRole } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '@prisma/client';
import {
    extractMentionHandlesWithCatalog,
    joinTextsForMentions,
} from '../common/mentions/mention.util';
import { MailService } from '../mail/mail.service';
import { TaskReviewAdminsService } from '../task-review-admins/task-review-admins.service';
import {
    htmlMentionEmail,
    htmlTaskAssignedEmail,
    htmlTaskReviewRequestedEmail,
    subjectMention,
    subjectTaskAssigned,
    subjectTaskReviewRequested,
} from '../mail/task-email.templates';
import { promises as fs } from 'fs';
import * as path from 'path';

@Injectable()
export class TasksService {
    constructor(
        private prisma: PrismaService,
        private config: ConfigService,
        private notificationsService: NotificationsService,
        private mail: MailService,
        private taskReviewAdminsService: TaskReviewAdminsService,
    ) {}

    private appName(): string {
        return this.mail.getAppDisplayName();
    }

    private readonly statusHistoryInclude = {
        orderBy: { startedAt: 'asc' as const },
        select: {
            id: true,
            status: true,
            startedAt: true,
            endedAt: true,
        },
    };

    private async recordInitialStatusHistory(taskId: string, status: TaskStatus, startedAt: Date) {
        await this.prisma.taskStatusHistory.create({
            data: { taskId, status, startedAt },
        });
    }

    private async transitionStatusHistory(taskId: string, newStatus: TaskStatus) {
        const now = new Date();
        await this.prisma.taskStatusHistory.updateMany({
            where: { taskId, endedAt: null },
            data: { endedAt: now },
        });
        await this.prisma.taskStatusHistory.create({
            data: { taskId, status: newStatus, startedAt: now },
        });
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
        await this.recordInitialStatusHistory(task.id, task.status, task.createdAt);
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
            const createdDesc = result!.description ?? '';
            const createdNote = result!.note ?? '';
            if (createdDesc) {
                await this.notifyUsersMentionedInTexts(
                    [createdDesc],
                    { id: result!.id, title: result!.title },
                    userId,
                    'task_field',
                    'description',
                );
            }
            if (createdNote) {
                await this.notifyUsersMentionedInTexts(
                    [createdNote],
                    { id: result!.id, title: result!.title },
                    userId,
                    'task_field',
                    'note',
                );
            }
            return result!;
        }
        if (assignedToId) {
            await this.notifyTaskAssigned(task, userId);
        }
        const desc = task.description ?? '';
        const note = task.note ?? '';
        if (desc) {
            await this.notifyUsersMentionedInTexts(
                [desc],
                { id: task.id, title: task.title },
                userId,
                'task_field',
                'description',
            );
        }
        if (note) {
            await this.notifyUsersMentionedInTexts(
                [note],
                { id: task.id, title: task.title },
                userId,
                'task_field',
                'note',
            );
        }
        return task;
    }

    private assigneeWhere(userId: string) {
        return {
            OR: [
                { assignedToId: userId },
                { taskAssignees: { some: { userId } } },
            ],
        };
    }

    private static readonly TASK_MENTION_TITLES = [
        'You were mentioned in a comment',
        'You were mentioned on a task',
    ] as const;

    private parseTaskIdFromNotificationLink(link?: string | null): string | null {
        if (!link) return null;
        const m = link.match(/\/dashboard\/tasks\/([^/?#]+)/);
        return m?.[1] ?? null;
    }

    private parseFocusHashFromNotificationLink(link?: string | null): string | null {
        if (!link) return null;
        const m = link.match(/#([a-zA-Z0-9-]+)/);
        return m?.[1] ?? null;
    }

    private parseTaskTitleFromMentionMessage(message: string): string | null {
        const m = message.match(/"([^"]+)"/);
        return m?.[1] ?? null;
    }

    private textHasResolvableMentions(
        text: string | null | undefined,
        allUsers: { name: string }[],
    ): boolean {
        if (!text?.trim()) return false;
        if (text.includes('data-type="mention"')) return true;
        const plain = this.stripHtmlForMentions(text);
        if (!plain.includes('@')) return false;
        const names = allUsers.map((u) => u.name);
        return extractMentionHandlesWithCatalog(plain, names).length > 0;
    }

    /** User ids @mentioned in the given texts (same rules as notifyUsersMentionedInTexts). */
    private async collectMentionTargetUserIds(
        texts: string[],
        allUsers?: { id: string; name: string; email: string }[],
    ): Promise<string[]> {
        const users =
            allUsers ??
            (await this.prisma.user.findMany({
                where: { status: 'ACTIVE' },
                select: { id: true, name: true, email: true },
            }));
        const htmlHandles = texts.flatMap((t) =>
            this.extractMentionHandlesFromRichHtml(t ?? ''),
        );
        const plainTexts = texts.map((t) => this.stripHtmlForMentions(t ?? ''));
        const combined = joinTextsForMentions(plainTexts);
        const names = users.map((u) => u.name);
        const plainHandles = combined.includes('@')
            ? extractMentionHandlesWithCatalog(combined, names)
            : [];
        const handles = [...new Set([...htmlHandles, ...plainHandles])];
        if (handles.length === 0) return [];
        return this.resolveMentionHandlesToUserIds(handles, users);
    }

    /** True if task description, note, or any comment still @mentions this user. */
    private async taskStillMentionsUser(
        task: {
            description: string | null;
            note: string | null;
            comments: { content: string }[];
        },
        userId: string,
        allUsers?: { id: string; name: string; email: string }[],
    ): Promise<boolean> {
        const texts = [
            task.description,
            task.note,
            ...task.comments.map((c) => c.content),
        ].filter((t): t is string => Boolean(t?.trim()));
        if (texts.length === 0) return false;
        const ids = await this.collectMentionTargetUserIds(texts, allUsers);
        return ids.includes(userId);
    }

    /** Remove task @mention notifications for users no longer mentioned on the task. */
    private async pruneStaleTaskMentionNotifications(taskId: string): Promise<void> {
        const task = await this.prisma.task.findUnique({
            where: { id: taskId },
            select: {
                description: true,
                note: true,
                comments: { select: { content: true } },
            },
        });
        if (!task) return;

        const allUsers = await this.prisma.user.findMany({
            where: { status: 'ACTIVE' },
            select: { id: true, name: true, email: true },
        });
        const texts = [
            task.description,
            task.note,
            ...task.comments.map((c) => c.content),
        ].filter((t): t is string => Boolean(t?.trim()));
        const stillMentioned = new Set(
            texts.length > 0
                ? await this.collectMentionTargetUserIds(texts, allUsers)
                : [],
        );

        const notifications = await this.prisma.notification.findMany({
            where: {
                title: { in: [...TasksService.TASK_MENTION_TITLES] },
                link: { contains: `/dashboard/tasks/${taskId}` },
            },
            select: { id: true, userId: true },
        });
        const staleIds = notifications
            .filter((n) => !stillMentioned.has(n.userId))
            .map((n) => n.id);
        if (staleIds.length === 0) return;
        await this.prisma.notification.deleteMany({ where: { id: { in: staleIds } } });
    }

    private mentionExcerptPlain(raw: string | null | undefined, max = 280): string {
        const plain = this.stripHtmlForMentions(raw ?? '');
        if (!plain) return '';
        return plain.length > max ? `${plain.slice(0, max)}…` : plain;
    }

    private resolveMentionContext(
        notification: { title: string; createdAt: Date; link?: string | null },
        task: {
            description: string | null;
            note: string | null;
            comments: { content: string; createdAt: Date }[];
        },
        allUsers: { name: string }[],
    ): {
        contextType: 'comment' | 'description' | 'note';
        excerpt: string;
        focusHash: string;
    } | null {
        const notifAt = notification.createdAt.getTime();
        const hash = this.parseFocusHashFromNotificationLink(notification.link);

        if (hash === 'task-note') {
            return {
                contextType: 'note',
                excerpt:
                    this.mentionExcerptPlain(task.note) ||
                    'Open the note to read the mention.',
                focusHash: 'task-note',
            };
        }

        if (hash === 'task-description') {
            return {
                contextType: 'description',
                excerpt:
                    this.mentionExcerptPlain(task.description) ||
                    'Open the description to read the mention.',
                focusHash: 'task-description',
            };
        }

        if (
            hash === 'task-comments' ||
            notification.title === 'You were mentioned in a comment'
        ) {
            const withMention = task.comments.filter((c) =>
                this.textHasResolvableMentions(c.content, allUsers),
            );
            const pool = withMention.length > 0 ? withMention : task.comments;
            const best =
                pool.length > 0
                    ? pool.reduce((a, b) =>
                          Math.abs(a.createdAt.getTime() - notifAt) <
                          Math.abs(b.createdAt.getTime() - notifAt)
                              ? a
                              : b,
                      )
                    : null;
            const excerpt = best
                ? this.mentionExcerptPlain(best.content)
                : '';
            return {
                contextType: 'comment',
                excerpt: excerpt || 'Open comments to read the mention.',
                focusHash: 'task-comments',
            };
        }

        if (this.textHasResolvableMentions(task.description, allUsers)) {
            return {
                contextType: 'description',
                excerpt: this.mentionExcerptPlain(task.description),
                focusHash: 'task-description',
            };
        }

        if (this.textHasResolvableMentions(task.note, allUsers)) {
            return {
                contextType: 'note',
                excerpt: this.mentionExcerptPlain(task.note),
                focusHash: 'task-note',
            };
        }

        return null;
    }

    /** @mentions on tasks that still exist (My Tasks read-only feed). */
    async findMyTaskMentions(userId: string, limit = 50) {
        const notifications = await this.prisma.notification.findMany({
            where: {
                userId,
                title: { in: [...TasksService.TASK_MENTION_TITLES] },
            },
            orderBy: { createdAt: 'desc' },
            take: limit * 3,
        });

        const taskIdByNotificationId = new Map<string, string>();
        const taskIds = new Set<string>();
        for (const n of notifications) {
            const taskId = this.parseTaskIdFromNotificationLink(n.link);
            if (!taskId) continue;
            taskIdByNotificationId.set(n.id, taskId);
            taskIds.add(taskId);
        }

        if (taskIds.size === 0) return [];

        const existingTasks = await this.prisma.task.findMany({
            where: { id: { in: [...taskIds] } },
            select: {
                id: true,
                title: true,
                description: true,
                note: true,
                comments: {
                    orderBy: { createdAt: 'desc' },
                    take: 30,
                    select: { content: true, createdAt: true },
                },
            },
        });
        const taskById = new Map(existingTasks.map((t) => [t.id, t]));
        const existingIds = new Set(existingTasks.map((t) => t.id));
        const allUsers = await this.prisma.user.findMany({
            where: { status: 'ACTIVE' },
            select: { id: true, name: true, email: true },
        });

        const out: {
            id: string;
            message: string;
            isRead: boolean;
            createdAt: Date;
            taskId: string;
            taskTitle: string;
            contextType: string;
            excerpt: string;
            focusHash: string;
        }[] = [];
        const staleNotificationIds: string[] = [];

        for (const n of notifications) {
            if (out.length >= limit) break;
            const taskId = taskIdByNotificationId.get(n.id);
            if (!taskId || !existingIds.has(taskId)) continue;
            const task = taskById.get(taskId)!;
            const stillMentions = await this.taskStillMentionsUser(task, userId, allUsers);
            if (!stillMentions) {
                staleNotificationIds.push(n.id);
                continue;
            }
            const ctx = this.resolveMentionContext(n, task, allUsers);
            if (!ctx) continue;
            out.push({
                id: n.id,
                message: n.message,
                isRead: n.isRead,
                createdAt: n.createdAt,
                taskId,
                taskTitle:
                    task.title ??
                    this.parseTaskTitleFromMentionMessage(n.message) ??
                    'Task',
                contextType: ctx.contextType,
                excerpt: ctx.excerpt,
                focusHash: ctx.focusHash,
            });
        }

        if (staleNotificationIds.length > 0) {
            await this.prisma.notification.deleteMany({
                where: { id: { in: staleNotificationIds } },
            });
        }

        return out;
    }

    async findAll(filters?: {
        projectId?: string;
        listId?: string;
        assignedToId?: string;
        assigneeId?: string;
        status?: TaskStatus;
        priority?: TaskPriority;
    }) {
        const myTasksMode = !!filters?.assigneeId;
        const assigneeUserId = filters?.assigneeId ?? filters?.assignedToId;

        return this.prisma.task.findMany({
            where: {
                ...(myTasksMode
                    ? this.assigneeWhere(filters!.assigneeId!)
                    : assigneeUserId
                      ? { ...this.assigneeWhere(assigneeUserId), parentTaskId: null }
                      : { parentTaskId: null }),
                ...(filters?.projectId && { projectId: filters.projectId }),
                ...(filters?.listId && { listId: filters.listId }),
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
                list: myTasksMode
                    ? { select: { id: true, name: true } }
                    : false,
                parentTask: myTasksMode
                    ? { select: { id: true, title: true } }
                    : false,
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
                statusHistory: this.statusHistoryInclude,
                subTasks: myTasksMode
                    ? false
                    : {
                    include: {
                        project: { select: { id: true, name: true } },
                        statusHistory: this.statusHistoryInclude,
                        assignedTo: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                            },
                        },
                        attachments: {
                            where: { deletedAt: null },
                            select: {
                                id: true,
                                originalName: true,
                                mimeType: true,
                                size: true,
                                createdAt: true,
                            },
                            orderBy: { createdAt: 'desc' },
                        },
                        subTasks: {
                            include: {
                                project: { select: { id: true, name: true } },
                                statusHistory: this.statusHistoryInclude,
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
                attachments: myTasksMode
                    ? false
                    : {
                          where: { deletedAt: null },
                          select: {
                              id: true,
                              originalName: true,
                              mimeType: true,
                              size: true,
                              createdAt: true,
                          },
                          orderBy: { createdAt: 'desc' },
                      },
            },
            orderBy: myTasksMode
                ? [{ dueDate: { sort: 'asc', nulls: 'last' } }, { priority: 'desc' }, { createdAt: 'desc' }]
                : { createdAt: 'desc' },
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
                        attachments: {
                            where: { deletedAt: null },
                            select: {
                                id: true,
                                originalName: true,
                                mimeType: true,
                                size: true,
                                createdAt: true,
                            },
                            orderBy: { createdAt: 'desc' },
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
                attachments: {
                    where: { deletedAt: null },
                    select: {
                        id: true,
                        originalName: true,
                        mimeType: true,
                        size: true,
                        createdAt: true,
                    },
                    orderBy: { createdAt: 'desc' },
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
        updatedByRole?: UserRole,
    ) {
        const { assigneeIds, ...rest } = data;
        if (rest.status === TaskStatus.COMPLETED && updatedByRole !== UserRole.ADMIN) {
            throw new ForbiddenException(
                'Only an administrator can mark a task as completed. Move the task to Review when your work is ready.',
            );
        }
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
            const newlyAssigned = [...newAssigneeIds].filter((uid) => !previousAssigneeIds.has(uid));
            if (newlyAssigned.length > 0) {
                await this.notifyTaskAssignedToUsers(
                    updated,
                    newlyAssigned,
                    updatedByUserId,
                );
            }
        }
        if (existing) {
            if (existing.status !== updated.status) {
                await this.transitionStatusHistory(id, updated.status);
            }
            if (updatedByUserId) {
            const changedFields = this.getActuallyChangedFields(existing, updated, previousAssigneeIds);
            this.notifyTaskUpdated(updated, updatedByUserId, changedFields);
            if (changedFields.includes('Status')) {
                const becameReview =
                    updated.status === TaskStatus.REVIEW && existing.status !== TaskStatus.REVIEW;
                if (becameReview) {
                    await this.notifyAdminsTaskReadyForReview(updated, updatedByUserId);
                } else {
                    this.notifyTaskStatusChangeToAdminAndAssigner(updated, updatedByUserId);
                }
            }
            if (changedFields.includes('Description')) {
                await this.notifyUsersMentionedInTexts(
                    [updated.description ?? ''],
                    { id: updated.id, title: updated.title },
                    updatedByUserId,
                    'task_field',
                    'description',
                );
            }
            if (changedFields.includes('Note')) {
                await this.notifyUsersMentionedInTexts(
                    [updated.note ?? ''],
                    { id: updated.id, title: updated.title },
                    updatedByUserId,
                    'task_field',
                    'note',
                );
            }
            }
        }
        await this.pruneStaleTaskMentionNotifications(id);
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
        const uploadRootCfg = this.config.get<string>('UPLOAD_DIR') || 'uploads';
        const uploadRoot = path.isAbsolute(uploadRootCfg)
            ? uploadRootCfg
            : path.resolve(process.cwd(), uploadRootCfg);
        const filePathsToDelete: string[] = [];

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

            // Collect attachment file paths before deleting DB rows.
            const attachments = await tx.taskAttachment.findMany({
                where: { taskId: { in: taskIds } },
                select: { relPath: true },
            });
            for (const a of attachments) {
                const abs = path.resolve(uploadRoot, a.relPath);
                // Safety guard: only delete inside upload root.
                if (abs.startsWith(uploadRoot)) {
                    filePathsToDelete.push(abs);
                }
            }

            // Explicit delete (in addition to DB cascade) to keep logic clear.
            await tx.taskAttachment.deleteMany({
                where: { taskId: { in: taskIds } },
            });

            // Remove time entries referencing these tasks
            await tx.timeEntry.deleteMany({
                where: { taskId: { in: taskIds } },
            });

            // Remove comments referencing these tasks
            await tx.comment.deleteMany({
                where: { taskId: { in: taskIds } },
            });

            // Drop in-app notifications that link to these tasks
            await tx.notification.deleteMany({
                where: {
                    link: {
                        in: taskIds.map((tid) => `/dashboard/tasks/${tid}`),
                    },
                },
            });

            // Finally delete the tasks (parent + subtasks)
            await tx.task.deleteMany({
                where: { id: { in: taskIds } },
            });
        });

        // Remove files from disk after DB transaction succeeds.
        for (const abs of filePathsToDelete) {
            try {
                await fs.unlink(abs);
            } catch {
                // Ignore missing/already-removed files.
            }
        }

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
     * My Tasks comment feed:
     * - Everyone: comments on tasks assigned to you (including your own).
     * - Admins: also comments you posted on any task (e.g. on a teammate's task).
     */
    async findMyTaskComments(
        userId: string,
        role: UserRole,
        limit = 25,
    ) {
        const onMyTasks = { task: this.assigneeWhere(userId) };
        const where =
            role === UserRole.ADMIN
                ? {
                      OR: [onMyTasks, { userId }],
                  }
                : onMyTasks;

        const rows = await this.prisma.comment.findMany({
            where,
            include: {
                user: {
                    select: { id: true, name: true, email: true },
                },
                task: {
                    select: {
                        id: true,
                        title: true,
                        project: { select: { name: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
        return rows.map((c) => ({
            id: c.id,
            taskId: c.taskId,
            content: c.content,
            createdAt: c.createdAt,
            user: c.user,
            taskTitle: c.task.title,
            projectName: c.task.project?.name ?? 'Project',
        }));
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
        const byId = new Map(users.map((u) => [u.id, u.id]));
        const byNameLower = new Map<string, string[]>();
        for (const u of users) {
            const key = u.name.toLowerCase().trim();
            if (!byNameLower.has(key)) byNameLower.set(key, []);
            byNameLower.get(key)!.push(u.id);
        }

        const ids = new Set<string>();
        for (const h of unique) {
            const hl = h.toLowerCase();
            const idHit = byId.get(h);
            if (idHit) {
                ids.add(idHit);
                continue;
            }
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

    /**
     * Rich-text descriptions store HTML; mention parsing expects plain text with @handles visible.
     */
    private stripHtmlForMentions(raw: string): string {
        if (!raw) return '';
        if (!raw.includes('<')) return raw;
        return raw
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<\/div>/gi, '\n')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * TipTap mentions may be persisted as span nodes with mention metadata.
     * Extract handles directly from mention attributes so notifications work even
     * when the visible text does not include "@Name".
     */
    private extractMentionHandlesFromRichHtml(raw: string): string[] {
        if (!raw || !raw.includes('data-type="mention"')) return [];

        const out = new Set<string>();
        const mentionNodeRe = /<span\b[^>]*data-type=["']mention["'][^>]*>([\s\S]*?)<\/span>/gi;
        let match: RegExpExecArray | null;
        while ((match = mentionNodeRe.exec(raw)) !== null) {
            const fullTag = match[0];
            const inner = (match[1] ?? '').trim();

            const labelMatch = fullTag.match(/data-label=["']([^"']+)["']/i);
            const idMatch = fullTag.match(/data-id=["']([^"']+)["']/i);
            const charMatch = fullTag.match(
                /data-mention-suggestion-char=["']([^"']+)["']/i,
            );

            const mentionChar = (charMatch?.[1] ?? '@').trim();
            const rawHandle = (labelMatch?.[1] ?? idMatch?.[1] ?? inner ?? '').trim();
            if (!rawHandle) continue;

            let handle = rawHandle;
            if (mentionChar && handle.startsWith(mentionChar)) {
                handle = handle.slice(mentionChar.length).trim();
            }
            if (handle.startsWith('@')) {
                handle = handle.slice(1).trim();
            }
            if (handle) out.add(handle);
        }

        return [...out];
    }

    private async notifyUsersMentionedInTexts(
        texts: string[],
        task: { id: string; title: string },
        authorUserId: string,
        kind: 'comment' | 'task_field',
        taskField?: 'description' | 'note',
    ): Promise<void> {
        const allUsers = await this.prisma.user.findMany({
            where: { status: 'ACTIVE' },
            select: { id: true, name: true, email: true },
        });
        const targetIds = await this.collectMentionTargetUserIds(texts, allUsers);
        if (targetIds.length === 0) return;

        const plainTexts = texts.map((t) => this.stripHtmlForMentions(t ?? ''));
        const combined = joinTextsForMentions(plainTexts);

        const author = await this.prisma.user.findUnique({
            where: { id: authorUserId },
            select: { name: true },
        });
        const authorName = author?.name ?? 'Someone';
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
                : taskField === 'note'
                  ? 'in the task note'
                  : 'in the task description';
        const excerptRaw =
            kind === 'comment' ? this.stripHtmlForMentions(texts[0] ?? '') : combined;
        const excerptShort = excerptRaw
            ? excerptRaw.slice(0, 200) + (excerptRaw.length > 200 ? '…' : '')
            : '';
        const focusHash =
            kind === 'comment'
                ? 'task-comments'
                : taskField === 'note'
                  ? 'task-note'
                  : 'task-description';
        const linkWithFocus = `/dashboard/tasks/${task.id}#${focusHash}`;

        for (const uid of targetIds) {
            if (uid === authorUserId) continue;
            try {
                await this.notificationsService.create(uid, {
                    title,
                    message: excerptShort
                        ? `${authorName} ${action} "${task.title}" — ${excerptShort}`
                        : `${authorName} ${action} "${task.title}".`,
                    type: NotificationType.INFO,
                    link: linkWithFocus,
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
                        excerpt: excerptShort,
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
            if (assignedByUserId && userId === assignedByUserId) {
                // Self-assignment should still send email, but skip in-app notification noise.
                continue;
            }
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
     * When a task moves to Review, notify every configured admin in-app and by email.
     * This includes the submitter when they are also an admin, so self-submitted
     * admin tasks still trigger the same review alerts.
     */
    private async notifyAdminsTaskReadyForReview(
        task: {
            id: string;
            title: string;
            status: TaskStatus;
            priority: TaskPriority;
            startDate: Date | null;
            dueDate: Date | null;
            project?: { name: string } | null;
        },
        submittedByUserId: string,
    ): Promise<void> {
        const recipientIds =
            await this.taskReviewAdminsService.resolveNotificationRecipientAdminIds();
        if (recipientIds.length === 0) return;

        const admins = await this.prisma.user.findMany({
            where: { id: { in: recipientIds } },
            select: { id: true, name: true, email: true },
        });
        if (admins.length === 0) return;

        const submitter = await this.prisma.user.findUnique({
            where: { id: submittedByUserId },
            select: { name: true },
        });
        const submitterName = submitter?.name?.trim() || 'A team member';

        const projectName = task.project?.name ?? 'Project';
        const link = `/dashboard/tasks/${task.id}`;
        const message = `Task "${task.title}" in ${projectName} is ready for review (submitted by ${submitterName}).`;
        const ctx = this.taskEmailContext(task);

        for (const admin of admins) {
            try {
                await this.notificationsService.create(admin.id, {
                    title: 'Task ready for review',
                    message,
                    type: NotificationType.INFO,
                    link,
                });
            } catch (err) {
                console.error('Failed to send review notification to admin', admin.id, err);
            }
        }

        for (const admin of admins) {
            if (!admin.email) {
                console.warn(`[TasksService] Skipping review email for admin ${admin.id}: no email.`);
                continue;
            }
            const isSelfSubmitted = admin.id === submittedByUserId;
            const html = htmlTaskReviewRequestedEmail(
                admin.name ?? 'there',
                ctx,
                submitterName,
                isSelfSubmitted,
            );
            const mailResult = await this.mail.sendMailIfConfigured(
                admin.email,
                subjectTaskReviewRequested(task.title),
                html,
            );
            if (!mailResult.sent) {
                console.warn(
                    `[TasksService] Review-request email not sent to ${admin.email}:`,
                    mailResult.reason ?? 'unknown',
                );
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
