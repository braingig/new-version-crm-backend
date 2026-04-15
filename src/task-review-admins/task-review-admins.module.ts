import { Module } from '@nestjs/common';
import { TaskReviewAdminsService } from './task-review-admins.service';
import { TaskReviewAdminsResolver } from './task-review-admins.resolver';

@Module({
    providers: [TaskReviewAdminsService, TaskReviewAdminsResolver],
    exports: [TaskReviewAdminsService],
})
export class TaskReviewAdminsModule {}
