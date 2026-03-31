import { InputType, Field, ObjectType, registerEnumType } from '@nestjs/graphql';
import { IsString, IsOptional } from 'class-validator';

// Define enums locally since Prisma client generation is blocked
export enum TimesheetStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

export enum WorkType {
  REMOTE = 'REMOTE',
  ONSITE = 'ONSITE'
}

export enum TimeEntryStatus {
  STARTED = 'STARTED',
  PAUSED = 'PAUSED',
  RESUMED = 'RESUMED',
  STOPPED = 'STOPPED'
}

registerEnumType(TimesheetStatus, { name: 'TimesheetStatus' });

registerEnumType(WorkType, {
  name: 'WorkType',
  description: 'Employee work type classification',
  valuesMap: {
    REMOTE: {
      description: 'Remote employee with flexible work hours',
    },
    ONSITE: {
      description: 'Onsite employee with fixed work hours',
    },
  },
});

registerEnumType(TimeEntryStatus, {
  name: 'TimeEntryStatus',
  description: 'Time entry status classification',
});

@ObjectType()
export class EmployeeType {
    @Field()
    id: string;

    @Field()
    name: string;

    @Field()
    email: string;

    @Field(() => WorkType, { nullable: true })
    workType?: WorkType;
}

@InputType()
export class StartTimeEntryInput {
    @Field({ nullable: true })
    @IsOptional()
    @IsString()
    taskId?: string;

    @Field({ nullable: true })
    @IsOptional()
    @IsString()
    description?: string;
}

@ObjectType()
export class TimesheetType {
    @Field()
    id: string;

    @Field()
    employeeId: string;

    @Field()
    date: Date;

    @Field({ nullable: true })
    checkIn?: Date;

    @Field({ nullable: true })
    checkOut?: Date;

    @Field()
    totalHours: number;

    @Field(() => TimesheetStatus)
    status: TimesheetStatus;

    @Field({ nullable: true })
    notes?: string;

    @Field()
    sessionNumber: number;

    @Field()
    createdAt: Date;

    @Field()
    updatedAt: Date;

    @Field(() => EmployeeType, { nullable: true })
    employee?: EmployeeType;
}

@ObjectType()
export class TimeEntryType {
    @Field()
    id: string;

    @Field()
    employeeId: string;

    @Field({ nullable: true })
    taskId?: string;

    @Field()
    startTime: Date;

    @Field({ nullable: true })
    endTime?: Date;

    @Field()
    duration: number;

    @Field({ nullable: true })
    description?: string;

    @Field()
    isManual: boolean;

    @Field(() => TimeEntryStatus)
    status: TimeEntryStatus;

    @Field()
    createdAt: Date;

    @Field(() => EmployeeType, { nullable: true })
    employee?: EmployeeType;
}

@ObjectType()
export class ProjectTimeSummaryType {
    @Field()
    projectId: string;

    @Field()
    projectName: string;

    @Field()
    seconds: number;
}

/** One row per user with a timer currently running (no end time). For dashboard presence. */
@ObjectType()
export class ActiveTimerRowType {
    @Field()
    entryId: string;

    @Field()
    employeeId: string;

    @Field()
    employeeName: string;

    @Field({ nullable: true })
    taskId?: string;

    @Field({ nullable: true })
    taskTitle?: string;

    @Field()
    startTime: Date;
}

@ObjectType()
export class EmployeeDailyActivityType {
    @Field()
    employeeId: string;

    @Field()
    employeeName: string;

    @Field({ nullable: true })
    email?: string;

    @Field()
    date: Date;

    @Field()
    totalSeconds: number;

    @Field(() => [ProjectTimeSummaryType])
    projects: ProjectTimeSummaryType[];
}
