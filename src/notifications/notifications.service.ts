import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType } from '@prisma/client';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
    constructor(
        private prisma: PrismaService,
        private gateway: NotificationsGateway,
    ) {}

    async create(
        userId: string,
        data: {
            title: string;
            message: string;
            type: NotificationType;
            link?: string;
        },
    ) {
        const notification = await this.prisma.notification.create({
            data: {
                userId,
                ...data,
            },
        });
        this.gateway.sendNotification(userId, notification);
        return notification;
    }

    async findAll(userId: string) {
        return this.prisma.notification.findMany({
            where: { userId },
            orderBy: {
                createdAt: 'desc',
            },
            take: 50,
        });
    }

    async markAsRead(id: string, userId: string) {
        return this.prisma.notification.updateMany({
            where: { id, userId },
            data: { isRead: true },
        }).then((r) => {
            if (r.count === 0) return null;
            return this.prisma.notification.findUnique({ where: { id } });
        });
    }

    async markAllAsRead(userId: string) {
        await this.prisma.notification.updateMany({
            where: { userId, isRead: false },
            data: { isRead: true },
        });
        return true;
    }

    async getUnreadCount(userId: string) {
        return this.prisma.notification.count({
            where: { userId, isRead: false },
        });
    }
}
