import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsResolver } from './projects.resolver';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../mail/mail.module';

@Module({
    imports: [NotificationsModule, MailModule],
    providers: [ProjectsService, ProjectsResolver],
    exports: [ProjectsService],
})
export class ProjectsModule { }
