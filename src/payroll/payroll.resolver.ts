import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { Payroll } from './entities/payroll.entity';

@Resolver()
export class PayrollResolver {
    constructor(private payrollService: PayrollService) { }

    @Mutation(() => Boolean)
    @UseGuards(GqlAuthGuard)
    async generatePayroll(
        @Args('employeeId') employeeId: string,
        @Args('month') month: Date,
    ) {
        await this.payrollService.generatePayroll(employeeId, month);
        return true;
    }

    @Query(() => [Payroll])
    @UseGuards(GqlAuthGuard)
    async payrolls(
        @Args('employeeId', { nullable: true }) employeeId?: string,
    ) {
        return this.payrollService.findAll({ employeeId });
    }
}
