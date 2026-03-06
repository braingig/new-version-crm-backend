import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { GraphQLJSON } from '../common/scalars/json.scalar';
import { UseGuards, BadRequestException } from '@nestjs/common';
import { TimesheetsService } from './timesheets.service';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TimesheetType, TimeEntryType, StartTimeEntryInput, WorkType, EmployeeType, EmployeeDailyActivityType } from './dto/timesheet.dto';

@Resolver()
export class TimesheetsResolver {
    constructor(private timesheetsService: TimesheetsService) { }

    @Mutation(() => TimesheetType)
    @UseGuards(GqlAuthGuard)
    async checkIn(@CurrentUser() user: any) {
        return this.timesheetsService.checkIn(user.userId);
    }

    @Mutation(() => TimesheetType)
    @UseGuards(GqlAuthGuard)
    async checkOut(@CurrentUser() user: any) {
        return this.timesheetsService.checkOut(user.userId);
    }

    @Mutation(() => TimeEntryType)
    @UseGuards(GqlAuthGuard)
    async startTimeEntry(
        @CurrentUser() user: any,
        @Args('input') input: StartTimeEntryInput,
    ) {
        return this.timesheetsService.startTimeEntry(
            user.userId,
            input.taskId,
            input.description,
        );
    }

    @Mutation(() => TimeEntryType)
    @UseGuards(GqlAuthGuard)
    async stopTimeEntry(
        @CurrentUser() user: any,
        @Args('effectiveDurationSeconds', { type: () => Int, nullable: true })
        effectiveDurationSeconds?: number,
    ) {
        const result = await this.timesheetsService.stopTimeEntry(user.userId, effectiveDurationSeconds);
        if (result == null) {
            throw new BadRequestException('No active timer found');
        }
        return result;
    }

    @Query(() => [TimesheetType])
    @UseGuards(GqlAuthGuard)
    async timesheets(
        @Args('employeeId', { nullable: true }) employeeId?: string,
        @Args('startDate', { nullable: true }) startDate?: Date,
        @Args('endDate', { nullable: true }) endDate?: Date,
    ) {
        return this.timesheetsService.getTimesheets(employeeId, startDate, endDate);
    }

    @Query(() => [TimeEntryType])
    @UseGuards(GqlAuthGuard)
    async timeEntries(
        @Args('employeeId', { nullable: true }) employeeId?: string,
        @Args('taskId', { nullable: true }) taskId?: string,
        @Args('taskIds', { type: () => [String], nullable: true }) taskIds?: string[],
    ) {
        return this.timesheetsService.getTimeEntries(employeeId, taskId, taskIds);
    }

    /** Employee daily activity report: total time per day, per employee, with projects. For admin view and export. No new table — from TimeEntry + Task + User. */
    @Query(() => [EmployeeDailyActivityType])
    @UseGuards(GqlAuthGuard)
    async employeeDailyActivity(
        @Args('startDate', { type: () => Date }) startDate: Date,
        @Args('endDate', { type: () => Date }) endDate: Date,
        @Args('employeeId', { nullable: true }) employeeId?: string,
    ) {
        return this.timesheetsService.getEmployeeDailyActivity(startDate, endDate, employeeId);
    }

    @Query(() => TimeEntryType, { nullable: true })
    @UseGuards(GqlAuthGuard)
    async activeTimeEntry(@CurrentUser() user: any) {
        return this.timesheetsService.getActiveTimeEntry(user.userId);
    }

    @Query(() => TimesheetType, { nullable: true })
    @UseGuards(GqlAuthGuard)
    async todayTimesheet(@CurrentUser() user: any) {
        return this.timesheetsService.getTodayTimesheet(user.userId);
    }

    @Query(() => [TimesheetType])
    @UseGuards(GqlAuthGuard)
    async todaySessions(@CurrentUser() user: any) {
        return this.timesheetsService.getTodaySessions(user.userId);
    }

    @Mutation(() => EmployeeType)
    @UseGuards(GqlAuthGuard)
    async updateEmployeeWorkType(
        @CurrentUser() user: any,
        @Args('workType') workType: string
    ) {
        // Convert string to WorkType enum
        const workTypeEnum = workType as WorkType;
        return this.timesheetsService.updateEmployeeWorkType(user.userId, workTypeEnum);
    }

    @Query(() => WorkType, { nullable: true })
    @UseGuards(GqlAuthGuard)
    async employeeWorkType(@CurrentUser() user: any) {
        return this.timesheetsService.getEmployeeWorkType(user.userId);
    }

    @Mutation(() => Boolean)
    @UseGuards(GqlAuthGuard)
    async reportActivity(
        @CurrentUser() user: any,
        @Args('type', { type: () => String }) type: string,
        @Args('metadata', { type: () => GraphQLJSON, nullable: true }) metadata?: any,
    ) {
        await this.timesheetsService.reportActivity(
            user.userId,
            type,
            metadata,
        );
        return true;
    }
}