import { Resolver, Query, Mutation } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { Field, ObjectType } from '@nestjs/graphql';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { GoogleService } from './google.service';

@ObjectType()
export class GoogleCalendarStatusType {
    @Field()
    connected: boolean;

    @Field({ nullable: true })
    googleEmail?: string;

    @Field({ nullable: true })
    connectedAt?: Date;
}

@Resolver()
export class GoogleResolver {
    constructor(private readonly googleService: GoogleService) {}

    @Query(() => GoogleCalendarStatusType)
    @UseGuards(GqlAuthGuard)
    async googleCalendarStatus(@CurrentUser() user: any) {
        return this.googleService.getConnectionStatus(user.userId);
    }

    @Mutation(() => Boolean)
    @UseGuards(GqlAuthGuard)
    async disconnectGoogleCalendar(@CurrentUser() user: any) {
        return this.googleService.disconnect(user.userId);
    }
}
