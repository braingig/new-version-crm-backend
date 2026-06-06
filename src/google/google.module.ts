import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GoogleService } from './google.service';
import { GoogleController } from './google.controller';
import { GoogleResolver } from './google.resolver';

@Module({
    imports: [AuthModule],
    controllers: [GoogleController],
    providers: [GoogleService, GoogleResolver],
    exports: [GoogleService],
})
export class GoogleModule {}
