import { InputType, Field, ObjectType, Int } from '@nestjs/graphql';
import { IsArray, IsInt, ArrayMinSize, Min, Max, ValidateNested, IsDate } from 'class-validator';
import { Type } from 'class-transformer';
import { UserBasicType } from '../../projects/dto/project.dto';

@InputType()
export class WeeklyWorkSlotInput {
    @Field(() => Int)
    @IsInt()
    @Min(1)
    @Max(7)
    dayOfWeek: number;

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
export class SetWeeklyWorkPlanInput {
    @Field()
    @IsDate()
    @Type(() => Date)
    weekStart: Date;

    @Field(() => [Int])
    @IsArray()
    @IsInt({ each: true })
    weekendDays: number[];

    @Field(() => [WeeklyWorkSlotInput])
    @ValidateNested({ each: true })
    @Type(() => WeeklyWorkSlotInput)
    slots: WeeklyWorkSlotInput[];
}

@ObjectType()
export class WeeklyWorkSlotType {
    @Field()
    id: string;

    @Field(() => Int)
    dayOfWeek: number;

    @Field(() => Int)
    startMinutes: number;

    @Field(() => Int)
    endMinutes: number;
}

@ObjectType()
export class WeeklyWorkPlanType {
    @Field()
    id: string;

    @Field()
    userId: string;

    @Field()
    weekStart: Date;

    @Field(() => [Int])
    weekendDays: number[];

    @Field(() => [WeeklyWorkSlotType])
    slots: WeeklyWorkSlotType[];

    @Field()
    createdAt: Date;

    @Field()
    updatedAt: Date;
}

@ObjectType()
export class EmployeeWeeklyScheduleRow {
    @Field(() => UserBasicType)
    user: UserBasicType;

    @Field(() => WeeklyWorkPlanType, { nullable: true })
    plan: WeeklyWorkPlanType | null;
}
