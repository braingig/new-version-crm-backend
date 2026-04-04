import {
    Injectable,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { WorkIntervalInput } from './dto/work-schedule.dto';

const MANAGER_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.TEAM_LEAD, UserRole.HR];

@Injectable()
export class WorkScheduleService {
    constructor(private prisma: PrismaService) {}

    assertCanViewTeam(role: UserRole) {
        if (!MANAGER_ROLES.includes(role)) {
            throw new ForbiddenException(
                'You do not have permission to view team schedules',
            );
        }
    }

    assertCanManageOthersSchedule(role: UserRole) {
        if (!MANAGER_ROLES.includes(role)) {
            throw new ForbiddenException(
                'You do not have permission to edit other users’ schedules',
            );
        }
    }

    /** Previous ISO day (Mon=1 … Sun=7); wraps so Monday follows Sunday. */
    private prevIsoDay(iso: number): number {
        return iso === 1 ? 7 : iso - 1;
    }

    /**
     * Weekend days must be one contiguous arc on the week circle (Mon→…→Sun→Mon).
     * Examples: Fri only; Fri–Sat; Fri–Sat–Sun; Sat–Sun; Sun only; Sat–Sun–Mon.
     * Invalid: Fri+Sun without Sat (two separate runs), or all 7 days.
     *
     * We count how many times we switch from a working day to a weekend day when
     * walking Mon→Tue→…→Sun→Mon — that must be exactly once.
     */
    private validateWeekendDays(weekendDays: number[]) {
        if (!Array.isArray(weekendDays) || weekendDays.length === 0) {
            throw new BadRequestException(
                'weekendDays must contain at least 1 day (ISO: 1=Monday … 7=Sunday)',
            );
        }

        const set = new Set<number>();
        for (const d of weekendDays) {
            if (!Number.isInteger(d) || d < 1 || d > 7) {
                throw new BadRequestException(
                    'weekendDays must be integers from 1 (Monday) through 7 (Sunday)',
                );
            }
            set.add(d);
        }
        if (set.size !== weekendDays.length) {
            throw new BadRequestException('weekendDays must not contain duplicates');
        }

        if (weekendDays.length >= 7) {
            throw new BadRequestException(
                'At least one weekday is required; weekend cannot cover all 7 days.',
            );
        }

        const isWeekend = Array.from({ length: 8 }, () => false);
        for (const d of weekendDays) isWeekend[d] = true;

        let weekendStarts = 0;
        for (let i = 1; i <= 7; i++) {
            const prev = this.prevIsoDay(i);
            if (!isWeekend[prev] && isWeekend[i]) weekendStarts += 1;
        }

        if (weekendStarts !== 1) {
            throw new BadRequestException(
                'Weekend must be one uninterrupted run of days on the week, including across Sun→Mon (e.g. Fri; Fri–Sat; Fri–Sat–Sun; Sat–Sun; Sun; Sat–Sun–Mon). Gaps like Fri+Sun without Sat are not allowed.',
            );
        }
    }

    /** Same intervals every working day; no overlaps after sorting by start. */
    private validateIntervals(intervals: WorkIntervalInput[]) {
        const list = [...intervals];
        for (const s of list) {
            if (
                !Number.isInteger(s.startMinutes) ||
                !Number.isInteger(s.endMinutes) ||
                s.startMinutes < 0 ||
                s.endMinutes > 1440 ||
                s.startMinutes >= s.endMinutes
            ) {
                throw new BadRequestException(
                    'Each interval needs 0 ≤ startMinutes < endMinutes ≤ 1440',
                );
            }
        }
        list.sort((a, b) => a.startMinutes - b.startMinutes);
        for (let i = 1; i < list.length; i++) {
            if (list[i].startMinutes < list[i - 1].endMinutes) {
                throw new BadRequestException(
                    'Intervals must not overlap (check AM vs PM on start/end times).',
                );
            }
        }
    }

    async getWorkSchedule(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                weekendDays: true,
                updatedAt: true,
                workIntervals: {
                    orderBy: [{ startMinutes: 'asc' }],
                },
            },
        });
        if (!user) {
            throw new BadRequestException('User not found');
        }
        return {
            userId: user.id,
            weekendDays: user.weekendDays,
            intervals: user.workIntervals,
            updatedAt: user.updatedAt,
        };
    }

    async setWorkSchedule(
        targetUserId: string,
        requesterId: string,
        requesterRole: UserRole,
        weekendDays: number[],
        intervals: WorkIntervalInput[],
    ) {
        if (targetUserId !== requesterId) {
            this.assertCanManageOthersSchedule(requesterRole);
        }

        this.validateWeekendDays(weekendDays);
        this.validateIntervals(intervals);

        return this.prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: targetUserId },
                data: { weekendDays },
            });

            await tx.userWorkInterval.deleteMany({ where: { userId: targetUserId } });

            if (intervals.length > 0) {
                await tx.userWorkInterval.createMany({
                    data: intervals.map((s) => ({
                        userId: targetUserId,
                        startMinutes: s.startMinutes,
                        endMinutes: s.endMinutes,
                    })),
                });
            }

            const user = await tx.user.findUnique({
                where: { id: targetUserId },
                select: {
                    id: true,
                    weekendDays: true,
                    updatedAt: true,
                    workIntervals: {
                        orderBy: [{ startMinutes: 'asc' }],
                    },
                },
            });

            return {
                userId: user!.id,
                weekendDays: user!.weekendDays,
                intervals: user!.workIntervals,
                updatedAt: user!.updatedAt,
            };
        });
    }

    async teamWorkSchedules(requesterRole: UserRole) {
        this.assertCanViewTeam(requesterRole);

        const users = await this.prisma.user.findMany({
            where: { status: 'ACTIVE' },
            select: { id: true, name: true, email: true },
            orderBy: { name: 'asc' },
        });

        const ids = users.map((u) => u.id);
        if (ids.length === 0) return [];

        const withData = await this.prisma.user.findMany({
            where: { id: { in: ids } },
            select: {
                id: true,
                weekendDays: true,
                updatedAt: true,
                workIntervals: {
                    orderBy: [{ startMinutes: 'asc' }],
                },
            },
        });

        const byId = new Map(withData.map((u) => [u.id, u]));

        return users.map((u) => {
            const row = byId.get(u.id)!;
            return {
                user: { id: u.id, name: u.name, email: u.email },
                schedule: {
                    userId: row.id,
                    weekendDays: row.weekendDays,
                    intervals: row.workIntervals,
                    updatedAt: row.updatedAt,
                },
            };
        });
    }
}
