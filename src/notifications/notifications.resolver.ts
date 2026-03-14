import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationType } from '@prisma/client';
import { NotificationDto, CreateNotificationInput } from './dto/notification.dto';

@Resolver(() => NotificationDto)
export class NotificationsResolver {
    constructor(private notificationsService: NotificationsService) {}

    @Mutation(() => NotificationDto)
    @UseGuards(GqlAuthGuard)
    async createNotification(
        @CurrentUser() user: { userId: string },
        @Args('input') input: CreateNotificationInput,
    ) {
        return this.notificationsService.create(user.userId, {
            ...input,
            type: input.type ?? NotificationType.INFO,
        });
    }

    @Query(() => [NotificationDto])
    @UseGuards(GqlAuthGuard)
    async notifications(@CurrentUser() user: { userId: string }) {
        return this.notificationsService.findAll(user.userId);
    }

    @Query(() => Number)
    @UseGuards(GqlAuthGuard)
    async notificationUnreadCount(@CurrentUser() user: { userId: string }) {
        return this.notificationsService.getUnreadCount(user.userId);
    }

    @Mutation(() => NotificationDto, { nullable: true })
    @UseGuards(GqlAuthGuard)
    async markNotificationAsRead(
        @Args('id') id: string,
        @CurrentUser() user: { userId: string },
    ) {
        return this.notificationsService.markAsRead(id, user.userId);
    }

    @Mutation(() => Boolean)
    @UseGuards(GqlAuthGuard)
    async markAllNotificationsAsRead(@CurrentUser() user: { userId: string }) {
        return this.notificationsService.markAllAsRead(user.userId);
    }
}
