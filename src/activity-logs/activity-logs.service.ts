import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ActivityLogsService {
    constructor(private prisma: PrismaService) { }

    async log(
        userId: string,
        action: string,
        entityType: string,
        entityId: string,
        metadata?: any,
        ipAddress?: string,
    ) {
        return this.prisma.activityLog.create({
            data: {
                userId,
                action,
                entityType,
                entityId,
                metadata,
                ipAddress,
            },
        });
    }

    async findAll(filters?: { userId?: string; entityType?: string }) {
        return this.prisma.activityLog.findMany({
            where: filters,
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
            take: 100,
        });
    }
}
