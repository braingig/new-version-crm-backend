import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { WorkScheduleService } from './work-schedule.service';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
    WeeklyWorkPlanType,
    SetWeeklyWorkPlanInput,
    EmployeeWeeklyScheduleRow,
} from './dto/work-schedule.dto';
import { UserRole } from '@prisma/client';

@Resolver()
export class WorkScheduleResolver {
    constructor(private readonly workScheduleService: WorkScheduleService) {}

    @Query(() => WeeklyWorkPlanType, { nullable: true })
    @UseGuards(GqlAuthGuard)
    async myWeeklyWorkPlan(
        @CurrentUser() user: { userId: string },
        @Args('weekStart') weekStart: Date,
    ) {
        return this.workScheduleService.myWeeklyWorkPlan(user.userId, weekStart);
    }

    @Query(() => WeeklyWorkPlanType, { nullable: true })
    @UseGuards(GqlAuthGuard)
    async myWeeklyWorkPlanForDate(
        @CurrentUser() user: { userId: string },
        @Args('referenceDate') referenceDate: Date,
    ) {
        return this.workScheduleService.myWeeklyWorkPlanForDate(
            user.userId,
            referenceDate,
        );
    }

    @Query(() => [EmployeeWeeklyScheduleRow])
    @UseGuards(GqlAuthGuard)
    async teamWeeklySchedule(
        @CurrentUser() user: { userId: string; role: UserRole },
        @Args('weekStart') weekStart: Date,
    ) {
        return this.workScheduleService.teamWeeklySchedule(user.role, weekStart);
    }

    @Query(() => [EmployeeWeeklyScheduleRow])
    @UseGuards(GqlAuthGuard)
    async teamWeeklyScheduleForDate(
        @CurrentUser() user: { userId: string; role: UserRole },
        @Args('referenceDate') referenceDate: Date,
    ) {
        return this.workScheduleService.teamWeeklyScheduleForDate(
            user.role,
            referenceDate,
        );
    }

    @Mutation(() => WeeklyWorkPlanType)
    @UseGuards(GqlAuthGuard)
    async setWeeklyWorkPlan(
        @CurrentUser() user: { userId: string },
        @Args('input') input: SetWeeklyWorkPlanInput,
    ) {
        const result = await this.workScheduleService.setWeeklyWorkPlan(
            user.userId,
            input.weekStart,
            input.weekendDays,
            input.slots,
        );
        return result!;
    }

    @Mutation(() => Boolean)
    @UseGuards(GqlAuthGuard)
    async deleteWeeklyWorkPlan(
        @CurrentUser() user: { userId: string },
        @Args('weekStart') weekStart: Date,
    ) {
        return this.workScheduleService.deleteWeeklyWorkPlan(
            user.userId,
            weekStart,
        );
    }
}
