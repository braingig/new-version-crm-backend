import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType()
export class Employee {
  @Field()
  id: string;

  @Field()
  name: string;

  @Field()
  email: string;

  @Field({ nullable: true })
  salaryType?: string;

  @Field({ nullable: true })
  department?: string;
}
