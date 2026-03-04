import { Module } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { PayrollResolver } from './payroll.resolver';

@Module({
    providers: [PayrollService, PayrollResolver],
    exports: [PayrollService],
})
export class PayrollModule { }
