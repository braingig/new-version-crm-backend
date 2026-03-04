import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectStatus } from '@prisma/client';

@Injectable()
export class ProjectsService {
    constructor(private prisma: PrismaService) { }

    async create(
        userId: string,
        data: {
            name: string;
            description?: string;
            budget: number;
            hourlyRate?: number;
            startDate: Date;
            endDate?: Date;
            clientName?: string;
        },
    ) {
        return this.prisma.project.create({
            data: {
                ...data,
                createdById: userId,
            },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });
    }

    async findAll(filters?: { status?: ProjectStatus }) {
        return this.prisma.project.findMany({
            where: {
                ...(filters?.status && { status: filters.status }),
            },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                tasks: {
                    select: {
                        id: true,
                        title: true,
                        status: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
    }

    async findOne(id: string) {
        return this.prisma.project.findUnique({
            where: { id },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                    },
                },
                tasks: {
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

    async update(
        id: string,
        data: Partial<{
            name: string;
            description: string;
            budget: number;
            hourlyRate: number;
            status: ProjectStatus;
            startDate: Date;
            endDate: Date;
            clientName: string;
        }>,
    ) {
        return this.prisma.project.update({
            where: { id },
            data,
            include: {
                createdBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });
    }

    async delete(id: string) {
        await this.prisma.project.delete({
            where: { id },
        });
        return true;
    }

    async getProjectStats() {
        const [total, active] = await Promise.all([
            this.prisma.project.count(),
            this.prisma.project.count({ where: { status: ProjectStatus.ACTIVE } }),
        ]);
        return { total, active };
    }
}
