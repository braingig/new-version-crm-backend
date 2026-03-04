import { ObjectType, Field, Float } from '@nestjs/graphql';
import { Employee } from './employee.entity';

@ObjectType()
export class Payroll {
  @Field()
  id: string;

  @Field()
  employeeId: string;

  @Field()
  month: Date;

  @Field(() => Float)
  baseSalary: number;

  @Field(() => Float)
  totalPaid: number;

  @Field({ nullable: true })
  hoursWorked?: number;

  @Field({ nullable: true })
  bonus?: number;

  @Field({ nullable: true })
  deductions?: number;

  @Field()
  status: string;

  @Field({ nullable: true })
  paidAt?: Date;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;

  // relation: employee
  @Field(() => Employee, { nullable: true })
  employee?: Employee;
}
