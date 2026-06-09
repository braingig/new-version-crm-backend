import { InputType, Field, ObjectType, registerEnumType } from '@nestjs/graphql';
import { IsString, IsNotEmpty, IsOptional, IsEnum, IsDate, IsNumber, IsArray } from 'class-validator';
import { TaskStatus, TaskPriority } from '@prisma/client';
import { UserBasicType } from '../../projects/dto/project.dto';

registerEnumType(TaskStatus, { name: 'TaskStatus' });
registerEnumType(TaskPriority, { name: 'TaskPriority' });

@InputType()
export class CreateTaskInput {
    @Field()
    @IsNotEmpty()
    @IsString()
    projectId: string;

    @Field({ nullable: true })
    @IsOptional()
    @IsString()
    listId?: string;

    @Field()
    @IsNotEmpty()
    @IsString()
    title: string;

    @Field({ nullable: true })
    @IsOptional()
    @IsString()
    description?: string;

    @Field({ nullable: true })
    @IsOptional()
    @IsString()
    note?: string;

    @Field(() => TaskPriority)
    @IsEnum(TaskPriority)
    priority: TaskPriority;

    @Field({ nullable: true })
    @IsOptional()
    @IsString()
    assignedToId?: string;

    @Field({ nullable: true })
    @IsOptional()
    @IsDate()
    startDate?: Date;

    @Field({ nullable: true })
    @IsOptional()
    @IsDate()
    dueDate?: Date;

    @Field({ nullable: true })
    @IsOptional()
    @IsNumber()
    estimatedTime?: number;

    @Field({ nullable: true })
    @IsOptional()
    @IsString()
    parentTaskId?: string;

    @Field(() => [String], { nullable: true })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    assigneeIds?: string[];
}

@InputType()
export class UpdateTaskInput {
    @Field({ nullable: true })
    @IsOptional()
    @IsString()
    title?: string;

    @Field({ nullable: true })
    @IsOptional()
    @IsString()
    description?: string;

    @Field({ nullable: true })
    @IsOptional()
    @IsString()
    note?: string;

    @Field(() => TaskStatus, { nullable: true })
    @IsOptional()
    @IsEnum(TaskStatus)
    status?: TaskStatus;

    @Field(() => TaskPriority, { nullable: true })
    @IsOptional()
    @IsEnum(TaskPriority)
    priority?: TaskPriority;

    @Field({ nullable: true })
    @IsOptional()
    @IsString()
    assignedToId?: string;

    @Field({ nullable: true })
    @IsOptional()
    @IsDate()
    startDate?: Date;

    @Field({ nullable: true })
    @IsOptional()
    @IsDate()
    dueDate?: Date;

    @Field({ nullable: true })
    @IsOptional()
    @IsNumber()
    timeSpent?: number;

    @Field({ nullable: true })
    @IsOptional()
    @IsNumber()
    estimatedTime?: number;

    @Field(() => [String], { nullable: true })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    assigneeIds?: string[];
}

@InputType()
export class TaskFiltersInput {
    @Field({ nullable: true })
    @IsOptional()
    @IsString()
    projectId?: string;

    @Field({ nullable: true })
    @IsOptional()
    @IsString()
    assignedToId?: string;

    /** Flat list of all tasks (including subtasks) assigned to this user via assignee or taskAssignees. */
    @Field({ nullable: true })
    @IsOptional()
    @IsString()
    assigneeId?: string;

    @Field({ nullable: true })
    @IsOptional()
    @IsString()
    listId?: string;

    @Field(() => TaskStatus, { nullable: true })
    @IsOptional()
    @IsEnum(TaskStatus)
    status?: TaskStatus;

    @Field(() => TaskPriority, { nullable: true })
    @IsOptional()
    @IsEnum(TaskPriority)
    priority?: TaskPriority;
}

@ObjectType()
export class ProjectBasicType {
    @Field()
    id: string;

    @Field()
    name: string;
}

@ObjectType()
export class ParentTaskInfoType {
    @Field()
    id: string;

    @Field()
    title: string;
}

@ObjectType()
export class TaskListBasicType {
    @Field()
    id: string;

    @Field()
    name: string;
}

@ObjectType()
export class TaskType {
    @Field()
    id: string;

    @Field()
    projectId: string;

    @Field({ nullable: true })
    listId?: string;

    @Field()
    title: string;

    @Field({ nullable: true })
    description?: string;

    @Field({ nullable: true })
    note?: string;

    @Field(() => TaskStatus)
    status: TaskStatus;

    @Field(() => TaskPriority)
    priority: TaskPriority;

    @Field({ nullable: true })
    assignedToId?: string;

    @Field({ nullable: true })
    startDate?: Date;

    @Field({ nullable: true })
    dueDate?: Date;

    @Field()
    timeSpent: number;

    @Field({ nullable: true })
    estimatedTime?: number;

    @Field({ nullable: true })
    parentTaskId?: string;

    @Field(() => [TaskType], { nullable: true })
    subTasks?: TaskType[];

    @Field(() => ProjectBasicType, { nullable: true })
    project?: ProjectBasicType;

    @Field(() => TaskListBasicType, { nullable: true })
    list?: TaskListBasicType;

    @Field(() => ParentTaskInfoType, { nullable: true })
    parentTask?: ParentTaskInfoType;

    @Field(() => UserBasicType, { nullable: true })
    assignedTo?: UserBasicType;

    @Field(() => UserBasicType, { nullable: true })
    createdBy?: UserBasicType;

    @Field(() => [UserBasicType], { nullable: true })
    assignees?: UserBasicType[];

    @Field(() => [CommentType], { nullable: true })
    comments?: CommentType[];

    @Field(() => [TaskAttachmentType], { nullable: true })
    attachments?: TaskAttachmentType[];

    @Field()
    createdAt: Date;

    @Field()
    updatedAt: Date;

    @Field(() => [TaskStatusHistoryType], { nullable: true })
    statusHistory?: TaskStatusHistoryType[];
}

@ObjectType()
export class TaskStatusHistoryType {
    @Field()
    id: string;

    @Field(() => TaskStatus)
    status: TaskStatus;

    @Field()
    startedAt: Date;

    @Field({ nullable: true })
    endedAt?: Date;
}

@ObjectType()
export class CommentType {
    @Field()
    id: string;

    @Field()
    taskId: string;

    @Field()
    content: string;

    @Field()
    createdAt: Date;

    @Field(() => UserBasicType, { nullable: true })
    user?: UserBasicType;
}

/** Task @mention for the current user (My Tasks feed; task must still exist). */
@ObjectType()
export class TaskMentionFeedType {
    @Field()
    id: string;

    @Field()
    message: string;

    @Field()
    isRead: boolean;

    @Field()
    createdAt: Date;

    @Field()
    taskId: string;

    @Field()
    taskTitle: string;

    /** Where the @mention lives: comment, description, or note. */
    @Field()
    contextType: string;

    /** Plain-text preview of the mention context. */
    @Field()
    excerpt: string;

    /** Hash on the task page to scroll to (e.g. task-comments). */
    @Field()
    focusHash: string;
}

/** Recent comment on a task assigned to the current user (My Tasks feed). */
@ObjectType()
export class TaskCommentFeedType {
    @Field()
    id: string;

    @Field()
    taskId: string;

    @Field()
    content: string;

    @Field()
    createdAt: Date;

    @Field(() => UserBasicType, { nullable: true })
    user?: UserBasicType;

    @Field()
    taskTitle: string;

    @Field()
    projectName: string;
}

@ObjectType()
export class TaskAttachmentType {
    @Field()
    id: string;

    @Field()
    originalName: string;

    @Field()
    mimeType: string;

    @Field()
    size: number;

    @Field()
    createdAt: Date;
}
