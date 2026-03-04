import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TaskType, CreateTaskInput, UpdateTaskInput, TaskFiltersInput, CommentType } from './dto/task.dto';

@Resolver(() => TaskType)
export class TasksResolver {
    constructor(private tasksService: TasksService) { }

    @Query(() => [TaskType])
    @UseGuards(GqlAuthGuard)
    async tasks(@Args('filters', { nullable: true }) filters?: TaskFiltersInput) {
        return this.tasksService.findAll(filters);
    }

    @Query(() => [TaskType])
    @UseGuards(GqlAuthGuard)
    async tasksForSelection(@Args('filters', { nullable: true }) filters?: TaskFiltersInput) {
        return this.tasksService.findAllForSelection(filters);
    }

    @Query(() => TaskType)
    @UseGuards(GqlAuthGuard)
    async task(@Args('id') id: string) {
        return this.tasksService.findOne(id);
    }

    @Mutation(() => TaskType)
    @UseGuards(GqlAuthGuard)
    async createTask(
        @CurrentUser() user: any,
        @Args('input') input: CreateTaskInput,
    ) {
        return this.tasksService.create(user.userId, input);
    }

    @Mutation(() => TaskType)
    @UseGuards(GqlAuthGuard)
    async updateTask(
        @Args('id') id: string,
        @Args('input') input: UpdateTaskInput,
    ) {
        return this.tasksService.update(id, input);
    }

    @Mutation(() => Boolean)
    @UseGuards(GqlAuthGuard)
    async deleteTask(@Args('id') id: string) {
        return this.tasksService.delete(id);
    }

    @Mutation(() => CommentType)
    @UseGuards(GqlAuthGuard)
    async addComment(
        @Args('taskId') taskId: string,
        @Args('content') content: string,
        @CurrentUser() user: any,
    ) {
        return this.tasksService.addComment(taskId, user.userId, content);
    }
}
