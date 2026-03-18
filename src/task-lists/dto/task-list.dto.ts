import { Field, InputType, ObjectType } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsString, IsInt } from 'class-validator';

@InputType()
export class CreateTaskListInput {
    @Field()
    @IsNotEmpty()
    @IsString()
    projectId: string;

    @Field()
    @IsNotEmpty()
    @IsString()
    name: string;

    @Field({ nullable: true })
    @IsOptional()
    @IsString()
    description?: string;

    @Field({ nullable: true })
    @IsOptional()
    @IsInt()
    order?: number;
}

@InputType()
export class UpdateTaskListInput {
    @Field({ nullable: true })
    @IsOptional()
    @IsString()
    name?: string;

    @Field({ nullable: true })
    @IsOptional()
    @IsString()
    description?: string;

    @Field({ nullable: true })
    @IsOptional()
    @IsInt()
    order?: number;
}

@ObjectType()
export class TaskListType {
    @Field()
    id: string;

    @Field()
    projectId: string;

    @Field()
    name: string;

    @Field({ nullable: true })
    description?: string;

    @Field()
    order: number;

    @Field()
    createdAt: Date;

    @Field()
    updatedAt: Date;
}

