import { Module } from '@nestjs/common';
import { AttachmentsService } from './attachments.service';
import { AttachmentsController } from './attachments.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { AttachmentsCleanupService } from './attachments.cleanup.service';

@Module({
    imports: [PrismaModule, ConfigModule],
    providers: [AttachmentsService, AttachmentsCleanupService],
    controllers: [AttachmentsController],
    exports: [AttachmentsService],
})
export class AttachmentsModule {}

