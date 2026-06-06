import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { MeetingsService } from './meetings.service';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
    MeetingType,
    CreateMeetingInput,
    UpdateMeetingInput,
    MeetingFiltersInput,
} from './dto/meeting.dto';

@Resolver(() => MeetingType)
export class MeetingsResolver {
    constructor(private readonly meetingsService: MeetingsService) {}

    @Query(() => [MeetingType])
    @UseGuards(GqlAuthGuard)
    async meetings(@Args('filters') filters: MeetingFiltersInput) {
        return this.meetingsService.findInRange(
            filters.from,
            filters.to,
            filters.projectId,
        );
    }

    @Query(() => MeetingType)
    @UseGuards(GqlAuthGuard)
    async meeting(@Args('id') id: string) {
        return this.meetingsService.findOne(id);
    }

    @Mutation(() => MeetingType)
    @UseGuards(GqlAuthGuard)
    async createMeeting(
        @CurrentUser() user: any,
        @Args('input') input: CreateMeetingInput,
    ) {
        return this.meetingsService.create(user.userId, input);
    }

    @Mutation(() => MeetingType)
    @UseGuards(GqlAuthGuard)
    async updateMeeting(
        @CurrentUser() user: any,
        @Args('id') id: string,
        @Args('input') input: UpdateMeetingInput,
    ) {
        return this.meetingsService.update(id, user.userId, input);
    }

    @Mutation(() => Boolean)
    @UseGuards(GqlAuthGuard)
    async deleteMeeting(@Args('id') id: string) {
        return this.meetingsService.delete(id);
    }
}
