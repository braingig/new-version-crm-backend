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
        try {
            // Find all active time entries (entries without end time)
            const activeEntries = await (this.prisma as any).timeEntry.findMany({
                where: {
                    endTime: null,
                },
                include: {
                    employee: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                },
            });

            const now = new Date();
            const abandonedThreshold = 2 * 60 * 60 * 1000; // 2 hours in milliseconds (increased from 30 minutes)

            for (const entry of activeEntries) {
                const startTime = new Date(entry.startTime);
                const timeSinceStart = now.getTime() - startTime.getTime();

                // Check for recent activity before stopping
                // const recentActivity = await (this.prisma as any).activityEvent.findFirst({
                //     where: {
                //         employeeId: entry.employeeId,
                //         type: 'ACTIVE',
                //         timestamp: {
                //             gte: new Date(now.getTime() - 30 * 60 * 1000), // Activity in last 30 minutes
                //         }
                //     }
                // });
                const recentActivity = await (this.prisma as any).activityEvent.findFirst({
                    where: {
                        employeeId: entry.employeeId,
                        type: 'ACTIVE',
                        createdAt: {
                            gte: new Date(now.getTime() - 30 * 60 * 1000), // last 30 minutes
                        },
                    },
                });


                // If timer has been running for more than 2 hours AND no recent activity,
                // consider it abandoned and stop it
                if (timeSinceStart > abandonedThreshold && !recentActivity) {
                    const durationSeconds = Math.floor(timeSinceStart / 1000);
                    const durationMinutes = Math.floor(durationSeconds / 60);

                    await (this.prisma as any).timeEntry.update({
                        where: { id: entry.id },
                        data: {
                            endTime: now,
                            duration: durationSeconds,
                        },
                    });

                    // Update task time spent if task is associated (task.timeSpent is in minutes)
                    if (entry.taskId) {
                        await (this.prisma as any).task.update({
                            where: { id: entry.taskId },
                            data: {
                                timeSpent: {
                                    increment: durationMinutes,
                                },
                            },
                        });
                    }

                    this.logger.log(
                        `Auto-stopped abandoned timer for employee ${entry.employee.name} (${entry.employee.email}). Duration: ${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m (no recent activity)`
                    );
                } else if (timeSinceStart > abandonedThreshold && recentActivity) {
                    this.logger.log(
                        `Timer active for employee ${entry.employee.name} (${entry.employee.email}) but has recent activity - not stopping`
                    );
                }
            }
        } catch (error) {
            this.logger.error('Error during timer cleanup:', error);
        }
    }

    // Run every hour to check for very long-running timers (more than 12 hours)
    @Cron('0 * * * *')
    async cleanupVeryLongTimers() {
        try {
            const activeEntries = await (this.prisma as any).timeEntry.findMany({
                where: {
                    endTime: null,
                },
                include: {
                    employee: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                },
            });

            const now = new Date();
            const longThreshold = 12 * 60 * 60 * 1000; // 12 hours in milliseconds

            for (const entry of activeEntries) {
                const startTime = new Date(entry.startTime);
                const timeSinceStart = now.getTime() - startTime.getTime();

                // If timer has been running for more than 12 hours, stop it
                if (timeSinceStart > longThreshold) {
                    const durationSeconds = Math.floor(timeSinceStart / 1000);
                    const durationMinutes = Math.floor(durationSeconds / 60);

                    await (this.prisma as any).timeEntry.update({
                        where: { id: entry.id },
                        data: {
                            endTime: now,
                            duration: durationSeconds,
                        },
                    });

                    // Update task time spent if task is associated (task.timeSpent is in minutes)
                    if (entry.taskId) {
                        await (this.prisma as any).task.update({
                            where: { id: entry.taskId },
                            data: {
                                timeSpent: {
                                    increment: durationMinutes,
                                },
                            },
                        });
                    }

                    this.logger.warn(
                        `Auto-stopped very long timer for employee ${entry.employee.name} (${entry.employee.email}). Duration: ${Math.floor(durationMinutes / 60)} hours ${durationMinutes % 60} minutes`
                    );
                }
            }
        } catch (error) {
            this.logger.error('Error during long timer cleanup:', error);
        }
    }
}