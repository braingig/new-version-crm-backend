import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TaskReviewAdminsService } from './task-review-admins.service';
import { UserBasicType } from '../projects/dto/project.dto';
import { PrismaService } from '../prisma/prisma.service';

@Resolver()
export class TaskReviewAdminsResolver {
    constructor(
        private readonly taskReviewAdminsService: TaskReviewAdminsService,
        private readonly prisma: PrismaService,
    ) {}

    @Query(() => [UserBasicType])
    @UseGuards(GqlAuthGuard)
    async taskReviewAdmins(@CurrentUser() user: { role: UserRole }) {
        this.taskReviewAdminsService.assertAdmin(user.role);
        const ids = await this.taskReviewAdminsService.listReviewerUserIds();
        if (ids.length === 0) {
            return [];
        }
        return this.prisma.user.findMany({
            where: {
                id: { in: ids },
                role: UserRole.ADMIN,
                status: 'ACTIVE',
            },
            select: { id: true, name: true, email: true },
            orderBy: { name: 'asc' },
        });
    }

    @Mutation(() => [UserBasicType])
    @UseGuards(GqlAuthGuard)
    async setTaskReviewAdmins(
        @CurrentUser() user: { role: UserRole },
        @Args('userIds', { type: () => [String] }) userIds: string[],
    ) {
        const ids = await this.taskReviewAdminsService.setReviewers(
            user.role,
            userIds ?? [],
        );
        if (ids.length === 0) {
            return [];
        }
        return this.prisma.user.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true, email: true },
            orderBy: { name: 'asc' },
        });
    }
}
