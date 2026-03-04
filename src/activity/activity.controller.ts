import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TimesheetsService } from '../timesheets/timesheets.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface ActivityData {
    type: string;
    metadata?: any;
    timestamp?: string;
    keystrokes?: number;
    mouseClicks?: number;
    mouseMovements?: number;
    currentApp?: string;
    isTimerActive?: boolean;
}

@Controller()
export class ActivityController {
    constructor(
        private timesheetsService: TimesheetsService,
        private prisma: PrismaService
    ) {}

    @Post('activity')
    @UseGuards(JwtAuthGuard)
    async recordActivity(@Req() req: Request, @Body() activityData: ActivityData) {
        try {
            const user = req.user as any;
            console.log('JWT User payload:', user);
            
            // Verify user exists before recording activity
            let existingUser = await this.prisma.user.findUnique({
                where: { id: user.userId }
            });
            
            if (!existingUser) {
                console.warn('User not found in database, checking if this is a valid authenticated user:', user.userId);
                // For now, we'll skip activity recording for unknown users
                // In a production environment, you might want to create the user or sync with an auth provider
                return { success: false, message: 'User not found in database', userId: user.userId };
            }
            
            await this.timesheetsService.reportActivity(
                user.userId,
                activityData.type,
                {
                    ...activityData.metadata,
                    timestamp: activityData.timestamp || new Date().toISOString(),
                    keystrokes: activityData.keystrokes || 0,
                    mouseClicks: activityData.mouseClicks || 0,
                    mouseMovements: activityData.mouseMovements || 0,
                    currentApp: activityData.currentApp || 'Unknown',
                    isTimerActive: activityData.isTimerActive || false,
                }
            );

            return { success: true, message: 'Activity recorded successfully' };
        } catch (error) {
            console.error('Error recording activity:', error);
            return { success: false, message: 'Failed to record activity', error: error.message };
        }
    }
}