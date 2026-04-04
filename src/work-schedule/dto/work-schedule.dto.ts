import { InputType, Field, ObjectType, Int } from '@nestjs/graphql';
import {
    IsArray,
    IsInt,
    ArrayMinSize,
    Min,
    Max,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UserBasicType } from '../../projects/dto/project.dto';

/** One time range; applies to every working day (non-weekend) the same way. */
@InputType()
export class WorkIntervalInput {
    @Field(() => Int)
    @IsInt()
    @Min(0)
    @Max(1440)
    startMinutes: number;

    @Field(() => Int)
    @IsInt()
    @Min(0)
    @Max(1440)
    endMinutes: number;
}

@InputType()
export class SetWorkScheduleInput {
    @Field(() => [Int])
    @IsArray()
    @ArrayMinSize(1)
    @IsInt({ each: true })
    weekendDays: number[];

    @Field(() => [WorkIntervalInput])
    @ValidateNested({ each: true })
    @Type(() => WorkIntervalInput)
    intervals: WorkIntervalInput[];
}

@ObjectType()
export class WorkIntervalType {
    @Field()
    id: string;

    @Field(() => Int)
    startMinutes: number;

    @Field(() => Int)
    endMinutes: number;
}

@ObjectType()
export class WorkScheduleType {
    @Field()
    userId: string;

    @Field(() => [Int])
    weekendDays: number[];

    @Field(() => [WorkIntervalType])
    intervals: WorkIntervalType[];

    @Field()
    updatedAt: Date;
}

@ObjectType()
export class TeamWorkScheduleRow {
    @Field(() => UserBasicType)
    user: UserBasicType;

    @Field(() => WorkScheduleType)
    schedule: WorkScheduleType;
}
