import { Module } from '@nestjs/common';
import { ActivityController } from './activity.controller';
import { TimesheetsModule } from '../timesheets/timesheets.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [TimesheetsModule, PrismaModule],
    controllers: [ActivityController],
})
export class ActivityModule {}