import {
    BadRequestException,
    ForbiddenException,
    Injectable,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TaskReviewAdminsService {
    constructor(private readonly prisma: PrismaService) {}

    assertAdmin(role: UserRole) {
        if (role !== UserRole.ADMIN) {
            throw new ForbiddenException(
                'Only administrators can manage task review recipients',
            );
        }
    }

    async listReviewerUserIds(): Promise<string[]> {
        const rows = await this.prisma.taskReviewAdmin.findMany({
            select: { userId: true },
            orderBy: { userId: 'asc' },
        });
        return rows.map((r) => r.userId);
    }

    /**
     * Replace the configured reviewer list. Empty array = notify all active admins (default).
     * Only ACTIVE users with role ADMIN may be added.
     */
    async setReviewers(
        requesterRole: UserRole,
        adminUserIds: string[],
    ): Promise<string[]> {
        this.assertAdmin(requesterRole);
        const unique = [
            ...new Set(
                adminUserIds.map((id) => id?.trim()).filter(Boolean) as string[],
            ),
        ];

        if (unique.length > 0) {
            const users = await this.prisma.user.findMany({
                where: { id: { in: unique } },
                select: { id: true, role: true, status: true },
            });
            const bad = unique.filter((id) => {
                const u = users.find((x) => x.id === id);
                return (
                    !u ||
                    u.role !== UserRole.ADMIN ||
                    u.status !== 'ACTIVE'
                );
            });
            if (bad.length > 0) {
                throw new BadRequestException(
                    'Each selected user must be an active administrator.',
                );
            }
        }

        await this.prisma.$transaction(async (tx) => {
            await tx.taskReviewAdmin.deleteMany({});
            if (unique.length > 0) {
                await tx.taskReviewAdmin.createMany({
                    data: unique.map((userId) => ({ userId })),
                });
            }
        });

        return unique;
    }

    /**
     * Admin user IDs that should receive “task ready for review” notifications.
     * If no rows in TaskReviewAdmin, all active admins are included.
     * If rows exist but none match active admins anymore, falls back to all active admins.
     */
    async resolveNotificationRecipientAdminIds(): Promise<string[]> {
        const activeAdmins = await this.prisma.user.findMany({
            where: { role: UserRole.ADMIN, status: 'ACTIVE' },
            select: { id: true },
        });
        const adminIds = new Set(activeAdmins.map((a) => a.id));

        const configured = await this.prisma.taskReviewAdmin.findMany({
            select: { userId: true },
        });

        if (configured.length === 0) {
            return [...adminIds];
        }

        const filtered = configured
            .map((c) => c.userId)
            .filter((id) => adminIds.has(id));

        if (filtered.length === 0) {
            return [...adminIds];
        }

        return filtered;
    }
}
