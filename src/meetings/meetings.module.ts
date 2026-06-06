import { Module } from '@nestjs/common';
import { MeetingsService } from './meetings.service';
import { MeetingsResolver } from './meetings.resolver';
import { GoogleModule } from '../google/google.module';

@Module({
    imports: [GoogleModule],
    providers: [MeetingsService, MeetingsResolver],
    exports: [MeetingsService],
})
export class MeetingsModule {}
