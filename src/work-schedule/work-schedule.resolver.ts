import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { WorkScheduleService } from './work-schedule.service';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
    WorkScheduleType,
    SetWorkScheduleInput,
    TeamWorkScheduleRow,
} from './dto/work-schedule.dto';
import { UserRole } from '@prisma/client';

@Resolver()
export class WorkScheduleResolver {
    constructor(private readonly workScheduleService: WorkScheduleService) {}

    @Query(() => WorkScheduleType)
    @UseGuards(GqlAuthGuard)
    async workSchedule(
        @CurrentUser() user: { userId: string; role: UserRole },
        @Args('userId', { type: () => String, nullable: true }) userId?: string,
    ) {
        const target = userId ?? user.userId;
        if (target !== user.userId) {
            this.workScheduleService.assertCanViewTeam(user.role);
        }
        return this.workScheduleService.getWorkSchedule(target);
    }

    @Query(() => [TeamWorkScheduleRow])
    @UseGuards(GqlAuthGuard)
    async teamWorkSchedules(
        @CurrentUser() user: { userId: string; role: UserRole },
    ) {
        return this.workScheduleService.teamWorkSchedules(user.role);
    }

    @Mutation(() => WorkScheduleType)
    @UseGuards(GqlAuthGuard)
    async setMyWorkSchedule(
        @CurrentUser() user: { userId: string; role: UserRole },
        @Args('input') input: SetWorkScheduleInput,
    ) {
        return this.workScheduleService.setWorkSchedule(
            user.userId,
            user.userId,
            user.role,
            input.weekendDays,
            input.intervals,
        );
    }

    @Mutation(() => WorkScheduleType)
    @UseGuards(GqlAuthGuard)
    async setUserWorkSchedule(
        @CurrentUser() user: { userId: string; role: UserRole },
        @Args('userId') userId: string,
        @Args('input') input: SetWorkScheduleInput,
    ) {
        return this.workScheduleService.setWorkSchedule(
            userId,
            user.userId,
            user.role,
            input.weekendDays,
            input.intervals,
        );
    }
}
