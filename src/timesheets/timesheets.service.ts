import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkType } from './dto/timesheet.dto';

@Injectable()
export class TimesheetsService {
    constructor(private prisma: PrismaService) { }

    async checkIn(employeeId: string) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Get employee to check work type
        const employee = await (this.prisma as any).user.findUnique({
            where: { id: employeeId },
            select: { workType: true }
        });

        if (!employee) {
            throw new Error('Employee not found');
        }

        if (employee.workType === WorkType.ONSITE) {
            // Onsite employees can only check in once per day
            const existing = await (this.prisma as any).timesheet.findFirst({
                where: {
                    employeeId,
                    date: today,
                    checkIn: { not: null }
                }
            });

            if (existing) {
                throw new Error('Onsite employees can only check in once per day');
            }

            return (this.prisma as any).timesheet.create({
                data: {
                    employeeId,
                    date: today,
                    checkIn: new Date(),
                    sessionNumber: 1
                },
                include: {
                    employee: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            workType: true
                        },
                    },
                },
            });
        } else {
            // Remote employees can check in multiple times per day
            // Find the last session number for today
            const lastSession = await (this.prisma as any).timesheet.findFirst({
                where: {
                    employeeId,
                    date: today
                },
                orderBy: { sessionNumber: 'desc' }
            });

            const sessionNumber = lastSession ? lastSession.sessionNumber + 1 : 1;

            // Check if there's an active session (checked in but not checked out)
            const activeSession = await (this.prisma as any).timesheet.findFirst({
                where: {
                    employeeId,
                    date: today,
                    checkIn: { not: null },
                    checkOut: null
                }
            });

            if (activeSession) {
                throw new Error('Please check out from your current session before checking in again');
            }

            return (this.prisma as any).timesheet.create({
                data: {
                    employeeId,
                    date: today,
                    checkIn: new Date(),
                    sessionNumber
                },
                include: {
                    employee: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            workType: true
                        },
                    },
                },
            });
        }
    }

    async checkOut(employeeId: string) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Find the most recent active session (checked in but not checked out)
        const activeSession = await (this.prisma as any).timesheet.findFirst({
            where: {
                employeeId,
                date: today,
                checkIn: { not: null },
                checkOut: null
            },
            orderBy: { sessionNumber: 'desc' }
        });

        if (!activeSession) {
            throw new Error('No active check-in found for today');
        }

        const checkOut = new Date();
        const totalHours =
            (checkOut.getTime() - activeSession.checkIn.getTime()) / (1000 * 60 * 60);

        return (this.prisma as any).timesheet.update({
            where: {
                id: activeSession.id
            },
            data: {
                checkOut,
                totalHours: Number(totalHours.toFixed(2)),
            },
            include: {
                employee: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        workType: true
                    },
                },
            },
        });
    }

    async startTimeEntry(employeeId: string, taskId?: string, description?: string) {
        // Check if there's already an active time entry
        const activeEntry = await (this.prisma as any).timeEntry.findFirst({
            where: {
                employeeId,
                endTime: null,
            },
        });

        if (activeEntry) {
            throw new Error('You already have an active timer running');
        }

        return (this.prisma as any).timeEntry.create({
            data: {
                employeeId,
                taskId,
                description,
                startTime: new Date(),
            },
            include: {
                task: {
                    select: {
                        id: true,
                        title: true,
                        project: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
            },
        });
    }

    async stopTimeEntry(employeeId: string, effectiveDurationSeconds?: number) {
        const activeEntry = await this.prisma.timeEntry.findFirst({
            where: {
                employeeId,
                endTime: null,
            },
        });

        if (!activeEntry) {
            return null;
        }

        const endTime = new Date();

        // Store duration in SECONDS so we can show "2m 16s" (not just "2m 0s").
        let durationSeconds: number;
        if (typeof effectiveDurationSeconds === 'number' && effectiveDurationSeconds >= 0) {
            durationSeconds = Math.floor(effectiveDurationSeconds);
        } else {
            durationSeconds = Math.floor(
                (endTime.getTime() - activeEntry.startTime.getTime()) / 1000,
            );
        }

        const updatedEntry = await this.prisma.timeEntry.update({
            where: { id: activeEntry.id },
            data: {
                endTime,
                duration: durationSeconds,
            },
        });

        // Task.timeSpent is in minutes; increment by seconds / 60
        if (activeEntry.taskId) {
            try {
                await this.prisma.task.update({
                    where: { id: activeEntry.taskId },
                    data: {
                        timeSpent: { increment: Math.floor(durationSeconds / 60) },
                    },
                });
            } catch (e) {
                // Log but don't fail: task may have been deleted or other issue
                console.warn('stopTimeEntry: could not update task timeSpent', activeEntry.taskId, e);
            }
        }

        return updatedEntry;
    }

    async getTimesheets(employeeId?: string, startDate?: Date, endDate?: Date) {
        return (this.prisma as any).timesheet.findMany({
            where: {
                ...(employeeId && { employeeId }),
                ...(startDate && endDate && {
                    date: {
                        gte: startDate,
                        lte: endDate,
                    },
                }),
            },
            include: {
                employee: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        department: true,
                    },
                },
            },
            orderBy: {
                date: 'desc',
            },
        });
    }

    async getTimeEntries(employeeId?: string, taskId?: string, taskIds?: string[]) {
        return (this.prisma as any).timeEntry.findMany({
            where: {
                ...(employeeId && { employeeId }),
                ...(taskIds?.length ? { taskId: { in: taskIds } } : taskId && { taskId }),
            },
            include: {
                employee: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                task: {
                    select: {
                        id: true,
                        title: true,
                        project: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                startTime: 'desc',
            },
        });
    }

    async getActiveTimeEntry(employeeId: string) {
        return (this.prisma as any).timeEntry.findFirst({
            where: {
                employeeId,
                endTime: null,
            },
            include: {
                task: {
                    include: {
                        project: true,
                    },
                },
            },
        });
    }

    async getTodayTimesheet(employeeId: string) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return (this.prisma as any).timesheet.findFirst({
            where: {
                employeeId,
                date: today,
            },
            include: {
                employee: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        workType: true
                    },
                },
            },
        });
    }

    async getTodaySessions(employeeId: string) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return (this.prisma as any).timesheet.findMany({
            where: {
                employeeId,
                date: today,
            },
            include: {
                employee: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        workType: true
                    },
                },
            },
            orderBy: {
                sessionNumber: 'asc'
            }
        });
    }

    async updateEmployeeWorkType(employeeId: string, workType: WorkType) {
        return (this.prisma as any).user.update({
            where: { id: employeeId },
            data: { workType },
            select: {
                id: true,
                name: true,
                email: true,
                workType: true
            }
        });
    }

    /**
     * Report: total time per employee per day, with projects worked on.
     * Uses existing TimeEntry + Task + User — no new table. For admin view and export.
     */
    async getEmployeeDailyActivity(
        startDate: Date,
        endDate: Date,
        employeeId?: string,
    ): Promise<
        Array<{
            employeeId: string;
            employeeName: string;
            email: string | null;
            date: Date;
            totalSeconds: number;
            projects: Array<{ projectId: string; projectName: string; seconds: number }>;
        }>
    > {
        const startOfStart = new Date(startDate);
        startOfStart.setHours(0, 0, 0, 0);
        const endOfEnd = new Date(endDate);
        endOfEnd.setHours(23, 59, 59, 999);

        const entries = await (this.prisma as any).timeEntry.findMany({
            where: {
                ...(employeeId && { employeeId }),
                startTime: { gte: startOfStart, lte: endOfEnd },
            },
            include: {
                employee: {
                    select: { id: true, name: true, email: true },
                },
                task: {
                    select: {
                        projectId: true,
                        project: { select: { id: true, name: true } },
                    },
                },
            },
        });

        const byEmployeeDay = new Map<
            string,
            {
                employeeId: string;
                employeeName: string;
                email: string | null;
                date: Date;
                totalSeconds: number;
                byProject: Map<string, { projectName: string; seconds: number }>;
            }
        >();

        for (const e of entries) {
            const day = new Date(e.startTime);
            day.setHours(0, 0, 0, 0);
            const key = `${e.employeeId}|${day.getTime()}`;
            const durationSeconds = typeof e.duration === 'number' ? e.duration : 0;
            const projectId = e.task?.projectId ?? 'no-project';
            const projectName = e.task?.project?.name ?? 'No project';

            if (!byEmployeeDay.has(key)) {
                byEmployeeDay.set(key, {
                    employeeId: e.employeeId,
                    employeeName: e.employee?.name ?? 'Unknown',
                    email: e.employee?.email ?? null,
                    date: day,
                    totalSeconds: 0,
                    byProject: new Map(),
                });
            }
            const row = byEmployeeDay.get(key)!;
            row.totalSeconds += durationSeconds;
            const proj = row.byProject.get(projectId);
            if (proj) proj.seconds += durationSeconds;
            else row.byProject.set(projectId, { projectName, seconds: durationSeconds });
        }

        return Array.from(byEmployeeDay.values()).map((row) => ({
            employeeId: row.employeeId,
            employeeName: row.employeeName,
            email: row.email,
            date: row.date,
            totalSeconds: row.totalSeconds,
            projects: Array.from(row.byProject.entries()).map(([projectId, p]) => ({
                projectId,
                projectName: p.projectName,
                seconds: p.seconds,
            })),
        }));
    }

    async getEmployeeWorkType(employeeId: string) {
        const employee = await (this.prisma as any).user.findUnique({
            where: { id: employeeId },
            select: { workType: true }
        });
        return employee?.workType;
    }

    async reportActivity(employeeId: string, type: string, metadata?: any) {
        // Log the activity event
        await this.prisma.activityEvent.create({
            data: { 
                employeeId, 
                type, 
                metadata: {
                    ...metadata,
                    timestamp: new Date().toISOString()
                }
            },
        });

        const activeEntry = await this.prisma.timeEntry.findFirst({
            where: { employeeId, endTime: null },
        });

        if (!activeEntry) return;

        switch (type) {
            case 'IDLE':
            case 'LOCK':
                // User went idle - only stop if idle for more than 5 minutes to avoid interfering with manual control
                if (metadata?.idleDuration && metadata.idleDuration > 5 * 60 * 1000) { // 5 minutes
                    console.log(`User ${employeeId} idle for ${Math.floor(metadata.idleDuration / 60000)} minutes, stopping timer`);
                    await this.stopTimeEntry(employeeId);
                } else {
                    console.log(`User ${employeeId} went idle briefly (${Math.floor((metadata?.idleDuration || 0) / 1000)}s), not stopping timer`);
                }
                break;

            case 'ACTIVE':
                // User became active again - just log it since manual restart gives user control
                console.log(`User ${employeeId} became active again`);
                break;

            case 'TRACKING_STARTED':
                // Activity tracking started
                console.log(`Activity tracking started for user ${employeeId}`);
                break;

            case 'TRACKING_STOPPED':
                // Activity tracking stopped
                console.log(`Activity tracking stopped for user ${employeeId}`);
                break;

            default:
                console.log(`Unknown activity type: ${type} for user ${employeeId}`);
                break;
        }
    }

}
