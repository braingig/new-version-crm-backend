import { Module } from '@nestjs/common';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import { NotificationsResolver } from './notifications.resolver';

@Module({
    providers: [NotificationsGateway, NotificationsService, NotificationsResolver],
    exports: [NotificationsService],
})
export class NotificationsModule {}
