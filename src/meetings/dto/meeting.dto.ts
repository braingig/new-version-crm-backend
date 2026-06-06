import { InputType, Field, ObjectType } from '@nestjs/graphql';
import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsDate,
    IsBoolean,
} from 'class-validator';

@ObjectType()
export class MeetingProjectType {
    @Field()
    id: string;

    @Field()
    name: string;
}

@ObjectType()
export class MeetingUserType {
    @Field()
    id: string;

    @Field()
    name: string;

    @Field()
    email: string;
}

@ObjectType()
export class MeetingType {
    @Field()
    id: string;

    @Field()
    title: string;

    @Field({ nullable: true })
    description?: string;

    @Field({ nullable: true })
    projectId?: string;

    @Field()
    startTime: Date;

    @Field()
    endTime: Date;

    @Field({ nullable: true })
    location?: string;

    @Field()
    createdById: string;

    @Field()
    createdAt: Date;

    @Field()
    updatedAt: Date;

    @Field(() => MeetingProjectType, { nullable: true })
    project?: MeetingProjectType;

    @Field(() => MeetingUserType)
    createdBy: MeetingUserType;
}

@InputType()
export class CreateMeetingInput {
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
    projectId?: string;

    @Field()
    @IsDate()
    startTime: Date;

    @Field()
    @IsDate()
    endTime: Date;

    @Field({ nullable: true })
    @IsOptional()
    @IsString()
    location?: string;

    @Field({ nullable: true, defaultValue: false })
    @IsOptional()
    @IsBoolean()
    generateMeetLink?: boolean;
}

@InputType()
export class UpdateMeetingInput {
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
    projectId?: string;

    @Field({ nullable: true })
    @IsOptional()
    @IsDate()
    startTime?: Date;

    @Field({ nullable: true })
    @IsOptional()
    @IsDate()
    endTime?: Date;

    @Field({ nullable: true })
    @IsOptional()
    @IsString()
    location?: string;
}

@InputType()
export class MeetingFiltersInput {
    @Field({ nullable: true })
    @IsOptional()
    @IsString()
    projectId?: string;

    @Field()
    @IsDate()
    from: Date;

    @Field()
    @IsDate()
    to: Date;
}
