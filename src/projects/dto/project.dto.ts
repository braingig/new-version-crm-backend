import { InputType, Field, ObjectType, registerEnumType } from '@nestjs/graphql';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsEnum, IsDate } from 'class-validator';
import { ProjectStatus } from '@prisma/client';

registerEnumType(ProjectStatus, { name: 'ProjectStatus' });

@InputType()
export class CreateProjectInput {
    @Field()
    @IsNotEmpty()
    @IsString()
    name: string;

    @Field({ nullable: true })
    @IsOptional()
    @IsString()
    description?: string;

    @Field()
    @IsNumber()
    budget: number;

    @Field({ nullable: true })
    @IsOptional()
    @IsNumber()
    hourlyRate?: number;

    @Field()
    @IsDate()
    startDate: Date;

    @Field({ nullable: true })
    @IsOptional()
    @IsDate()
    endDate?: Date;

    @Field({ nullable: true })
    @IsOptional()
    @IsString()
    clientName?: string;

    @Field(() => ProjectStatus, { nullable: true })
    @IsOptional()
    @IsEnum(ProjectStatus)
    status?: ProjectStatus;
}

@InputType()
export class UpdateProjectInput {
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
    @IsNumber()
    budget?: number;

    @Field({ nullable: true })
    @IsOptional()
    @IsNumber()
    hourlyRate?: number;

    @Field(() => ProjectStatus, { nullable: true })
    @IsOptional()
    @IsEnum(ProjectStatus)
    status?: ProjectStatus;

    @Field({ nullable: true })
    @IsOptional()
    @IsDate()
    startDate?: Date;

    @Field({ nullable: true })
    @IsOptional()
    @IsDate()
    endDate?: Date;

    @Field({ nullable: true })
    @IsOptional()
    @IsString()
    clientName?: string;
}

@InputType()
export class ProjectFiltersInput {
    @Field(() => ProjectStatus, { nullable: true })
    @IsOptional()
    @IsEnum(ProjectStatus)
    status?: ProjectStatus;
}

@ObjectType()
export class UserBasicType {
    @Field()
    id: string;

    @Field()
    name: string;

    @Field()
    email: string;
}

@ObjectType()
export class ProjectType {
    @Field()
    id: string;

    @Field()
    name: string;

    @Field({ nullable: true })
    description?: string;

    @Field()
    budget: number;

    @Field({ nullable: true })
    hourlyRate?: number;

    @Field(() => ProjectStatus)
    status: ProjectStatus;

    @Field()
    startDate: Date;

    @Field({ nullable: true })
    endDate?: Date;

    @Field({ nullable: true })
    clientName?: string;

    @Field(() => UserBasicType)
    createdBy: UserBasicType;

    @Field()
    createdAt: Date;

    @Field()
    updatedAt: Date;
}
