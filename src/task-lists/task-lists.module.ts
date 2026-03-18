import { Module } from '@nestjs/common';
import { TaskListsService } from './task-lists.service';
import { TaskListsResolver } from './task-lists.resolver';
import { PrismaService } from '../prisma/prisma.service';

@Module({
    providers: [TaskListsService, TaskListsResolver, PrismaService],
})
export class TaskListsModule {}

