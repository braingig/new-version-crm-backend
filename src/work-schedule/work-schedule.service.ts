import {
    Injectable,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { WeeklyWorkSlotInput } from './dto/work-schedule.dto';

const MANAGER_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.TEAM_LEAD, UserRole.HR];

@Injectable()
export class WorkScheduleService {
    constructor(private prisma: PrismaService) {}

    /** Normalize to UTC midnight of the calendar date (date-only semantics). */
    normalizeWeekStartDate(input: Date): Date {
        const d = new Date(input);
        if (Number.isNaN(d.getTime())) {
            throw new BadRequestException('Invalid weekStart date');
        }
        return new Date(
            Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
        );
    }

    /** Add days to a date-only value (UTC midnight in practice). */
    private addDaysUTCDateOnly(d: Date, days: number): Date {
        const out = new Date(d);
        out.setUTCDate(out.getUTCDate() + days);
        return out;
    }

    /** JS ISO day: 1=Mon ... 7=Sun */
    private isoDayFromDateOnly(d: Date): number {
        // d is expected to be date-only at UTC midnight; using UTC avoids TZ surprises.
        const day = d.getUTCDay(); // 0=Sun..6=Sat
        return day === 0 ? 7 : day;
    }

    private isWeekendBoundary(dayIso: number, isWeekend: boolean[]): boolean {
        const next = dayIso === 7 ? 1 : dayIso + 1;
        return isWeekend[dayIso] && !isWeekend[next];
    }

    assertCanViewTeam(role: UserRole) {
        if (!MANAGER_ROLES.includes(role)) {
            throw new ForbiddenException(
                'You do not have permission to view team schedules',
            );
        }
    }

    private validateWeekendDays(weekendDays: number[]) {
        if (!Array.isArray(weekendDays) || weekendDays.length === 0) {
            throw new BadRequestException(
                'weekendDays must contain at least 1 day (ISO: 1=Monday ... 7=Sunday)',
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

        // Require a single consecutive weekend block in the 7-day cycle.
        // We do this by counting "weekend end" boundaries: day is weekend but next day is not.
        // For a single consecutive block there should be exactly 1 boundary.
        const isWeekend = Array.from({ length: 8 }, () => false); // 0..7, we use 1..7
        for (const d of weekendDays) isWeekend[d] = true;

        let boundaries = 0;
        for (let dayIso = 1; dayIso <= 7; dayIso++) {
            if (this.isWeekendBoundary(dayIso, isWeekend)) boundaries += 1;
        }
        if (boundaries !== 1) {
            throw new BadRequestException(
                'weekendDays must form one consecutive block (e.g. Fri or Fri-Sat or Sat-Sun).',
            );
        }
    }

    private validateSlots(
        slots: WeeklyWorkSlotInput[],
        weekendDaySet: Set<number>,
    ) {
        const byDay = new Map<number, { start: number; end: number }[]>();
        for (const s of slots) {
            if (!Number.isInteger(s.dayOfWeek) || s.dayOfWeek < 1 || s.dayOfWeek > 7) {
                throw new BadRequestException(
                    'Each slot dayOfWeek must be 1–7 (ISO: Mon–Sun)',
                );
            }
            if (weekendDaySet.has(s.dayOfWeek)) {
                throw new BadRequestException(
                    `Cannot add working hours on weekend day ${s.dayOfWeek}`,
                );
            }
            if (
                !Number.isInteger(s.startMinutes) ||
                !Number.isInteger(s.endMinutes) ||
                s.startMinutes < 0 ||
                s.endMinutes > 1440 ||
                s.startMinutes >= s.endMinutes
            ) {
                throw new BadRequestException(
                    'Each slot needs 0 ≤ startMinutes < endMinutes ≤ 1440',
                );
            }
            if (!byDay.has(s.dayOfWeek)) byDay.set(s.dayOfWeek, []);
            byDay.get(s.dayOfWeek)!.push({ start: s.startMinutes, end: s.endMinutes });
        }
        const dayNames = [
            '',
            'Monday',
            'Tuesday',
            'Wednesday',
            'Thursday',
            'Friday',
            'Saturday',
            'Sunday',
        ];
        for (const [dayIso, intervals] of byDay) {
            intervals.sort((a, b) => a.start - b.start);
            for (let i = 1; i < intervals.length; i++) {
                if (intervals[i].start < intervals[i - 1].end) {
                    const label = dayNames[dayIso] ?? `Day ${dayIso}`;
                    throw new BadRequestException(
                        `${label}: overlapping time ranges (check AM vs PM on start/end times).`,
                    );
                }
            }
        }
    }

    async myWeeklyWorkPlan(userId: string, weekStart: Date) {
        const ws = this.normalizeWeekStartDate(weekStart);
        return this.prisma.weeklyWorkPlan.findUnique({
            where: {
                userId_weekStart: { userId, weekStart: ws },
            },
            include: {
                slots: { orderBy: [{ dayOfWeek: 'asc' }, { startMinutes: 'asc' }] },
            },
        });
    }

    async myWeeklyWorkPlanForDate(userId: string, referenceDate: Date) {
        const ref = this.normalizeWeekStartDate(referenceDate);
        const earliest = this.addDaysUTCDateOnly(ref, -6);

        const plans = await this.prisma.weeklyWorkPlan.findMany({
            where: {
                userId,
                weekStart: { gte: earliest, lte: ref },
            },
            include: {
                slots: { orderBy: [{ dayOfWeek: 'asc' }, { startMinutes: 'asc' }] },
            },
        });

        // A 7-day window: plan covers referenceDate if:
        //   plan.weekStart <= ref < plan.weekStart + 7
        const chosen =
            plans
                .map((p) => {
                    const start = p.weekStart;
                    const endExclusive = this.addDaysUTCDateOnly(start, 7);
                    return { plan: p, start, endExclusive };
                })
                .find(({ start, endExclusive }) => start.getTime() <= ref.getTime() && ref.getTime() < endExclusive.getTime())
                ?.plan ?? null;

        return chosen;
    }

    async setWeeklyWorkPlan(
        userId: string,
        weekStart: Date,
        weekendDays: number[],
        slots: WeeklyWorkSlotInput[],
    ) {
        const ws = this.normalizeWeekStartDate(weekStart);
        this.validateWeekendDays(weekendDays);
        const weekendSet = new Set(weekendDays);
        this.validateSlots(slots, weekendSet);

        return this.prisma.$transaction(async (tx) => {
            const plan = await tx.weeklyWorkPlan.upsert({
                where: { userId_weekStart: { userId, weekStart: ws } },
                create: {
                    userId,
                    weekStart: ws,
                    weekendDays,
                },
                update: {
                    weekendDays,
                },
            });

            await tx.weeklyWorkSlot.deleteMany({
                where: { weeklyWorkPlanId: plan.id },
            });

            if (slots.length > 0) {
                await tx.weeklyWorkSlot.createMany({
                    data: slots.map((s) => ({
                        weeklyWorkPlanId: plan.id,
                        dayOfWeek: s.dayOfWeek,
                        startMinutes: s.startMinutes,
                        endMinutes: s.endMinutes,
                    })),
                });
            }

            return tx.weeklyWorkPlan.findUnique({
                where: { id: plan.id },
                include: {
                    slots: {
                        orderBy: [{ dayOfWeek: 'asc' }, { startMinutes: 'asc' }],
                    },
                },
            });
        });
    }

    async deleteWeeklyWorkPlan(userId: string, weekStart: Date) {
        const ws = this.normalizeWeekStartDate(weekStart);
        await this.prisma.weeklyWorkPlan.deleteMany({
            where: { userId, weekStart: ws },
        });
        return true;
    }

    async teamWeeklySchedule(requesterRole: UserRole, weekStart: Date) {
        this.assertCanViewTeam(requesterRole);
        const ws = this.normalizeWeekStartDate(weekStart);

        const users = await this.prisma.user.findMany({
            where: { status: 'ACTIVE' },
            select: { id: true, name: true, email: true },
            orderBy: { name: 'asc' },
        });

        const plans = await this.prisma.weeklyWorkPlan.findMany({
            where: { weekStart: ws },
            include: {
                slots: {
                    orderBy: [{ dayOfWeek: 'asc' }, { startMinutes: 'asc' }],
                },
            },
        });

        const planByUser = new Map(plans.map((p) => [p.userId, p]));

        return users.map((u) => ({
            user: { id: u.id, name: u.name, email: u.email },
            plan: planByUser.get(u.id) ?? null,
        }));
    }

    async teamWeeklyScheduleForDate(
        requesterRole: UserRole,
        referenceDate: Date,
    ) {
        this.assertCanViewTeam(requesterRole);
        const ref = this.normalizeWeekStartDate(referenceDate);
        const earliest = this.addDaysUTCDateOnly(ref, -6);

        const users = await this.prisma.user.findMany({
            where: { status: 'ACTIVE' },
            select: { id: true, name: true, email: true },
            orderBy: { name: 'asc' },
        });

        const userIds = users.map((u) => u.id);
        if (userIds.length === 0) return [];

        const plans = await this.prisma.weeklyWorkPlan.findMany({
            where: {
                userId: { in: userIds },
                weekStart: { gte: earliest, lte: ref },
            },
            include: {
                slots: {
                    orderBy: [{ dayOfWeek: 'asc' }, { startMinutes: 'asc' }],
                },
            },
        });

        const plansByUser = new Map(plans.map((p) => [p.userId, p]));

        // Note: for the 7-day window, each user should have at most one matching plan.
        // We still compute the cover check to be safe.
        const planForRef = (userId: string) => {
            const candidate = plansByUser.get(userId) ?? null;
            if (!candidate) return null;
            const start = candidate.weekStart;
            const endExclusive = this.addDaysUTCDateOnly(start, 7);
            return start.getTime() <= ref.getTime() && ref.getTime() < endExclusive.getTime()
                ? candidate
                : null;
        };

        return users.map((u) => ({
            user: { id: u.id, name: u.name, email: u.email },
            plan: planForRef(u.id),
        }));
    }
}
