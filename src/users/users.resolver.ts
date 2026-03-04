import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { UserType } from '../auth/dto/auth.dto';
import { UpdateUserInput, UserFiltersInput } from './dto/user.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Resolver(() => UserType)
export class UsersResolver {
    constructor(private usersService: UsersService) { }

    @Query(() => [UserType])
    @UseGuards(GqlAuthGuard)
    async users(@Args('filters', { nullable: true }) filters?: UserFiltersInput) {
        return this.usersService.findAll(filters);
    }

    @Query(() => UserType)
    @UseGuards(GqlAuthGuard)
    async user(@Args('id') id: string) {
        return this.usersService.findOne(id);
    }

    @Query(() => UserType)
    @UseGuards(GqlAuthGuard)
    async me(@CurrentUser() user: any) {
        return this.usersService.findOne(user.userId);
    }

    @Mutation(() => UserType)
    @UseGuards(GqlAuthGuard)
    async updateUser(
        @Args('id') id: string,
        @Args('input') input: UpdateUserInput,
    ) {
        return this.usersService.update(id, input);
    }

    @Mutation(() => Boolean)
    @UseGuards(GqlAuthGuard)
    async deleteUser(@Args('id') id: string) {
        return this.usersService.delete(id);
    }
}
