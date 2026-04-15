import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TaskListsService {
    constructor(private prisma: PrismaService) {}

    async findByProject(projectId: string) {
        return this.prisma.taskList.findMany({
            where: { projectId },
            orderBy: { order: 'asc' },
        });
    }

    async create(data: { projectId: string; name: string; description?: string; order?: number }) {
        return this.prisma.taskList.create({
            data: {
                projectId: data.projectId,
                name: data.name,
                description: data.description,
                order: data.order ?? 0,
            },
        });
    }

    async update(
        id: string,
        data: Partial<{ name: string; description?: string; order?: number }>,
    ) {
        return this.prisma.taskList.update({
            where: { id },
            data,
        });
    }

    async delete(id: string) {
        // Keep tasks and move them to "No folder" automatically via relation onDelete: SetNull.
        await this.prisma.taskList.delete({
            where: { id },
        });
        return true;
    }
}

