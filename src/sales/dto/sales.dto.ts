import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class CreateSaleInput {
  @Field()
  leadName: string;

  @Field({ nullable: true })
  companyName?: string;

  @Field({ nullable: true })
  email?: string;

  @Field({ nullable: true })
  phone?: string;

  @Field({ nullable: true })
  source?: string;

  @Field()
  estimatedValue: number;

  @Field()
  assignedToId: string;

  @Field({ nullable: true })
  notes?: string;

  @Field({ nullable: true })
  expectedCloseDate?: Date;
}
