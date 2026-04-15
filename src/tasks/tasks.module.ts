import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksResolver } from './tasks.resolver';
import { TaskDeadlineRemindersService } from './task-deadline-reminders.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../mail/mail.module';
import { TaskReviewAdminsModule } from '../task-review-admins/task-review-admins.module';

@Module({
    imports: [NotificationsModule, MailModule, TaskReviewAdminsModule],
    providers: [TasksService, TasksResolver, TaskDeadlineRemindersService],
    exports: [TasksService],
})
export class TasksModule {}
