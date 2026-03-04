import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType()
export class Sale {
  @Field()
  id: string;

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

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}
