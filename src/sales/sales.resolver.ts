import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { SalesService } from './sales.service';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { Sale } from './entities/sale.entity';
import { CreateSaleInput } from './dto/sales.dto';

@Resolver(() => Sale)
export class SalesResolver {
    constructor(private salesService: SalesService) { }

    @Query(() => [Sale])
    @UseGuards(GqlAuthGuard)
    async sales(
        @Args('assignedToId', { nullable: true }) assignedToId?: string,
    ) {
        return this.salesService.findAll({ assignedToId });
    }

    @Mutation(() => Sale)
    @UseGuards(GqlAuthGuard)
    async createSale(
        @Args('input', { type: () => CreateSaleInput }) input: CreateSaleInput,
    ) {
        return this.salesService.create(input);
    }
}
