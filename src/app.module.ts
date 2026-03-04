import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ScheduleModule } from '@nestjs/schedule';
import { join } from 'path';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { TimesheetsModule } from './timesheets/timesheets.module';
import { PayrollModule } from './payroll/payroll.module';
import { SalesModule } from './sales/sales.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ActivityLogsModule } from './activity-logs/activity-logs.module';
import { ActivityModule } from './activity/activity.module';

@Module({
    imports: [
        // Configuration
        ConfigModule.forRoot({
            isGlobal: true,
        }),

        // GraphQL
        GraphQLModule.forRoot<ApolloDriverConfig>({
            driver: ApolloDriver,
            autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
            sortSchema: true,
            playground: true,
            context: ({ req, res }) => ({ req, res }),
        }),

        // Scheduling for cron jobs
        ScheduleModule.forRoot(),

        // Core modules
        PrismaModule,
        AuthModule,
        UsersModule,
        ProjectsModule,
        TasksModule,
        TimesheetsModule,
        PayrollModule,
        SalesModule,
        NotificationsModule,
        ActivityLogsModule,
        ActivityModule,
    ],
})
export class AppModule { }
