import { Module } from '@nestjs/common';
import { WorkScheduleService } from './work-schedule.service';
import { WorkScheduleResolver } from './work-schedule.resolver';

@Module({
    providers: [WorkScheduleService, WorkScheduleResolver],
    exports: [WorkScheduleService],
})
export class WorkScheduleModule {}
