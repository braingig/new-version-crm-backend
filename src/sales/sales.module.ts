import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesResolver } from './sales.resolver';

@Module({
    providers: [SalesService, SalesResolver],
    exports: [SalesService],
})
export class SalesModule { }
