import { Module } from '@nestjs/common';
import { MeetingsService } from './meetings.service';
import { MeetingsResolver } from './meetings.resolver';
import { GoogleModule } from '../google/google.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
    imports: [GoogleModule, NotificationsModule],
    providers: [MeetingsService, MeetingsResolver],
    exports: [MeetingsService],
})
export class MeetingsModule {}
