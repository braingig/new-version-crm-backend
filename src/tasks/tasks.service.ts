import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TaskStatus, TaskPriority } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '@prisma/client';

@Injectable()
export class TasksService {
    constructor(
        private prisma: PrismaService,
        private notificationsService: NotificationsService,
    ) {}

    async create(
        userId: string,
        data: {
            projectId: string;
            listId?: string;
            title: string;
            description?: string;
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
            this.notifyTaskAssigned(result!, userId);
            return result!;
        }
        if (assignedToId && assignedToId !== userId) {
            this.notifyTaskAssigned(task, userId);
        }
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
                this.notifyTaskAssignedToUsers(updated, newlyAssigned);
            }
        }
        if (updatedByUserId && existing) {
            const changedFields = this.getActuallyChangedFields(existing, updated, previousAssigneeIds);
            this.notifyTaskUpdated(updated, updatedByUserId, changedFields);
        }
        return updated;
    }

    /**
     * Compare previous task state with updated state and return only fields that actually changed.
     */
    private getActuallyChangedFields(
        existing: { title: string; description: string | null; status: TaskStatus; priority: TaskPriority; startDate: Date | null; dueDate: Date | null; assignedToId: string | null; taskAssignees: { userId: string }[] },
        updated: { title: string; description: string | null; status: TaskStatus; priority: TaskPriority; startDate: Date | null; dueDate: Date | null; assignedToId: string | null; taskAssignees: { user: { id: string } }[] },
        previousAssigneeIds: Set<string>,
    ): string[] {
        const labels: string[] = [];
        if (existing.title !== updated.title) labels.push('Title');
        if ((existing.description ?? '') !== (updated.description ?? '')) labels.push('Description');
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
        return this.prisma.comment.create({
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
    }

    /**
     * Notify users who were assigned to the task (excluding the person who did the assign).
     */
    private notifyTaskAssigned(
        task: { id: string; title: string; project?: { name: string } | null; assignedToId?: string | null; taskAssignees?: { user: { id: string } }[] },
        assignedByUserId: string,
    ) {
        const assigneeIds = new Set<string>();
        if (task.assignedToId) assigneeIds.add(task.assignedToId);
        task.taskAssignees?.forEach((ta) => assigneeIds.add(ta.user.id));
        assigneeIds.delete(assignedByUserId);
        this.notifyTaskAssignedToUsers(task, [...assigneeIds]);
    }

    /**
     * Send "Task assigned" notification to the given user ids.
     */
    private async notifyTaskAssignedToUsers(
        task: { id: string; title: string; project?: { name: string } | null },
        userIds: string[],
    ) {
        if (userIds.length === 0) return;
        const projectName = task.project?.name ?? 'Project';
        const message = `You were assigned to "${task.title}" in ${projectName}.`;
        const link = `/dashboard/tasks/${task.id}`;
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
