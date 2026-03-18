import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { TaskListsService } from './task-lists.service';
import { CreateTaskListInput, UpdateTaskListInput, TaskListType } from './dto/task-list.dto';

@Resolver(() => TaskListType)
export class TaskListsResolver {
    constructor(private readonly taskListsService: TaskListsService) {}

    @Query(() => [TaskListType])
    @UseGuards(GqlAuthGuard)
    async taskLists(@Args('projectId') projectId: string) {
        return this.taskListsService.findByProject(projectId);
    }

    @Mutation(() => TaskListType)
    @UseGuards(GqlAuthGuard)
    async createTaskList(@Args('input') input: CreateTaskListInput) {
        return this.taskListsService.create(input);
    }

    @Mutation(() => TaskListType)
    @UseGuards(GqlAuthGuard)
    async updateTaskList(
        @Args('id') id: string,
        @Args('input') input: UpdateTaskListInput,
    ) {
        return this.taskListsService.update(id, input);
    }

    @Mutation(() => Boolean)
    @UseGuards(GqlAuthGuard)
    async deleteTaskList(@Args('id') id: string) {
        return this.taskListsService.delete(id);
    }
}

