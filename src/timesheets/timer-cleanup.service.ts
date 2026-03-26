import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TimerCleanupService {
    private readonly logger = new Logger(TimerCleanupService.name);

    constructor(private prisma: PrismaService) { }

    // Run every 10 minutes to clean up abandoned timers (reduced frequency)
    @Cron('*/10 * * * *')
    async cleanupAbandonedTimers() {
        // Auto-stop disabled by product requirement.
        return;
    }

    // Run every hour to check for very long-running timers (more than 12 hours)
    @Cron('0 * * * *')
    async cleanupVeryLongTimers() {
        // Auto-stop disabled by product requirement.
        return;
    }
}