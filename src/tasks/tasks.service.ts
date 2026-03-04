import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TaskStatus, TaskPriority } from '@prisma/client';

@Injectable()
export class TasksService {
    constructor(private prisma: PrismaService) { }

    async create(
        userId: string,
        data: {
            projectId: string;
            title: string;
            description?: string;
            priority: TaskPriority;
            assignedToId?: string;
            startDate?: Date;
            dueDate?: Date;
            estimatedTime?: number;
            parentTaskId?: string;
        },
    ) {
        return this.prisma.task.create({
            data: {
                ...data,
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
            },
        });
    }

    async findAll(filters?: {
        projectId?: string;
        assignedToId?: string;
        status?: TaskStatus;
        priority?: TaskPriority;
    }) {
        return this.prisma.task.findMany({
            where: {
                parentTaskId: null, // Only get parent tasks
                ...(filters?.projectId && { projectId: filters.projectId }),
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
        }>,
    ) {
        return this.prisma.task.update({
            where: { id },
            data,
            include: {
                project: true,
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
    }

    async delete(id: string) {
        await this.prisma.task.delete({
            where: { id },
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
}
