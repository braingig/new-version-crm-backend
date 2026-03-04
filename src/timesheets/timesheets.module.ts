import { Module } from '@nestjs/common';
import { TimesheetsService } from './timesheets.service';
import { TimesheetsResolver } from './timesheets.resolver';
import { TimerCleanupService } from './timer-cleanup.service';

@Module({
    providers: [TimesheetsService, TimesheetsResolver, TimerCleanupService],
    exports: [TimesheetsService],
})
export class TimesheetsModule { }
