import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleService } from '../google/google.service';
import { NotificationsService } from '../notifications/notifications.service';

const meetingInclude = {
    project: { select: { id: true, name: true } },
    createdBy: { select: { id: true, name: true, email: true } },
    attendees: {
        include: {
            user: { select: { id: true, name: true, email: true } },
        },
    },
} as const;

type MeetingWithRelations = {
    id: string;
    title: string;
    description: string | null;
    projectId: string | null;
    startTime: Date;
    endTime: Date;
    location: string | null;
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
    project: { id: string; name: string } | null;
    createdBy: { id: string; name: string; email: string };
    attendees: { user: { id: string; name: string; email: string } }[];
};

type MeetingWriteData = {
    title: string;
    description?: string;
    projectId?: string;
    startTime: Date;
    endTime: Date;
    location?: string;
    generateMeetLink?: boolean;
    assigneeIds?: string[];
};

@Injectable()
export class MeetingsService {
    constructor(
        private prisma: PrismaService,
        private googleService: GoogleService,
        private notificationsService: NotificationsService,
    ) {}

    private mapMeeting(meeting: MeetingWithRelations) {
        const { attendees, ...rest } = meeting;
        return {
            ...rest,
            assignees: attendees.map((a) => a.user),
        };
    }

    private formatMeetingTimeRange(startTime: Date, endTime: Date): string {
        const dateOpts: Intl.DateTimeFormatOptions = {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        };
        const timeOpts: Intl.DateTimeFormatOptions = {
            hour: 'numeric',
            minute: '2-digit',
        };
        const sameDay =
            startTime.toDateString() === endTime.toDateString();
        if (sameDay) {
            return `${startTime.toLocaleDateString(undefined, dateOpts)}, ${startTime.toLocaleTimeString(undefined, timeOpts)} – ${endTime.toLocaleTimeString(undefined, timeOpts)}`;
        }
        return `${startTime.toLocaleString(undefined, { ...dateOpts, ...timeOpts })} – ${endTime.toLocaleString(undefined, { ...dateOpts, ...timeOpts })}`;
    }

    private async notifyMeetingAssignees(
        meeting: {
            id: string;
            title: string;
            startTime: Date;
            endTime: Date;
            project?: { name: string } | null;
        },
        userIds: string[],
        invitedByUserId: string,
        isUpdate: boolean,
    ) {
        if (userIds.length === 0) return;

        const inviter = await this.prisma.user.findUnique({
            where: { id: invitedByUserId },
            select: { name: true },
        });
        const inviterName = inviter?.name ?? 'Someone';
        const projectName = meeting.project?.name;
        const timeRange = this.formatMeetingTimeRange(
            meeting.startTime,
            meeting.endTime,
        );
        const projectPart = projectName ? ` (${projectName})` : '';
        const title = isUpdate ? 'Added to meeting' : 'Meeting invitation';
        const action = isUpdate
            ? `${inviterName} added you to "${meeting.title}"${projectPart}.`
            : `${inviterName} invited you to "${meeting.title}"${projectPart}.`;
        const message = `${action} ${timeRange}`;

        for (const userId of userIds) {
            if (userId === invitedByUserId) continue;
            try {
                await this.notificationsService.create(userId, {
                    title,
                    message,
                    type: NotificationType.INFO,
                    link: '/dashboard/calendar',
                });
            } catch (err) {
                console.error(
                    'Failed to send meeting notification to',
                    userId,
                    err,
                );
            }
        }
    }

    private async validateAssigneeIds(assigneeIds: string[]): Promise<string[]> {
        const uniqueIds = [...new Set(assigneeIds.filter(Boolean))];
        if (uniqueIds.length === 0) return [];

        const users = await this.prisma.user.findMany({
            where: { id: { in: uniqueIds }, status: 'ACTIVE' },
            select: { id: true },
        });
        if (users.length !== uniqueIds.length) {
            throw new BadRequestException(
                'One or more assignees were not found or are inactive',
            );
        }
        return uniqueIds;
    }

    private async syncAssignees(
        meetingId: string,
        assigneeIds: string[] | undefined,
    ): Promise<string[] | undefined> {
        if (assigneeIds === undefined) return undefined;

        const uniqueIds = await this.validateAssigneeIds(assigneeIds);

        await this.prisma.meetingAttendee.deleteMany({ where: { meetingId } });
        if (uniqueIds.length > 0) {
            await this.prisma.meetingAttendee.createMany({
                data: uniqueIds.map((userId) => ({ meetingId, userId })),
            });
        }

        return uniqueIds;
    }

    private assertValidRange(startTime: Date, endTime: Date) {
        if (!(startTime instanceof Date) || isNaN(startTime.getTime())) {
            throw new BadRequestException('Invalid start time');
        }
        if (!(endTime instanceof Date) || isNaN(endTime.getTime())) {
            throw new BadRequestException('Invalid end time');
        }
        if (endTime.getTime() <= startTime.getTime()) {
            throw new BadRequestException('End time must be after start time');
        }
    }

    private async resolveLocation(
        userId: string,
        data: MeetingWriteData,
    ): Promise<string | undefined> {
        if (data.generateMeetLink) {
            return this.googleService.createMeetLink(userId, {
                title: data.title,
                description: data.description,
                startTime: data.startTime,
                endTime: data.endTime,
            });
        }

        return data.location;
    }

    async findInRange(from: Date, to: Date, projectId?: string) {
        const meetings = await this.prisma.meeting.findMany({
            where: {
                ...(projectId ? { projectId } : {}),
                startTime: { lte: to },
                endTime: { gte: from },
            },
            include: meetingInclude,
            orderBy: { startTime: 'asc' },
        });
        return meetings.map((m) => this.mapMeeting(m));
    }

    async findOne(id: string) {
        const meeting = await this.prisma.meeting.findUnique({
            where: { id },
            include: meetingInclude,
        });
        if (!meeting) {
            throw new NotFoundException('Meeting not found');
        }
        return this.mapMeeting(meeting);
    }

    async create(userId: string, data: MeetingWriteData) {
        this.assertValidRange(data.startTime, data.endTime);

        if (data.projectId) {
            const project = await this.prisma.project.findUnique({
                where: { id: data.projectId },
            });
            if (!project) {
                throw new BadRequestException('Project not found');
            }
        }

        const location = await this.resolveLocation(userId, data);

        const meeting = await this.prisma.meeting.create({
            data: {
                title: data.title,
                description: data.description,
                projectId: data.projectId || null,
                startTime: data.startTime,
                endTime: data.endTime,
                location: location || null,
                createdById: userId,
            },
            include: meetingInclude,
        });

        const assigneeIds = await this.syncAssignees(
            meeting.id,
            data.assigneeIds ?? [],
        );

        const full = await this.findOne(meeting.id);

        if (assigneeIds && assigneeIds.length > 0) {
            await this.notifyMeetingAssignees(
                full,
                assigneeIds,
                userId,
                false,
            );
        }

        return full;
    }

    async update(id: string, userId: string, data: Partial<MeetingWriteData>) {
        const existing = await this.prisma.meeting.findUnique({
            where: { id },
            include: meetingInclude,
        });
        if (!existing) {
            throw new NotFoundException('Meeting not found');
        }

        const previousAssigneeIds = existing.attendees.map((a) => a.user.id);
        const startTime = data.startTime ?? existing.startTime;
        const endTime = data.endTime ?? existing.endTime;
        this.assertValidRange(startTime, endTime);

        if (data.projectId) {
            const project = await this.prisma.project.findUnique({
                where: { id: data.projectId },
            });
            if (!project) {
                throw new BadRequestException('Project not found');
            }
        }

        let location = data.location;
        if (data.generateMeetLink) {
            location = await this.googleService.createMeetLink(userId, {
                title: data.title ?? existing.title,
                description:
                    data.description ?? existing.description ?? undefined,
                startTime,
                endTime,
            });
        }

        await this.prisma.meeting.update({
            where: { id },
            data: {
                ...(data.title !== undefined ? { title: data.title } : {}),
                ...(data.description !== undefined
                    ? { description: data.description }
                    : {}),
                ...(data.startTime !== undefined
                    ? { startTime: data.startTime }
                    : {}),
                ...(data.endTime !== undefined ? { endTime: data.endTime } : {}),
                ...(data.projectId !== undefined
                    ? { projectId: data.projectId || null }
                    : {}),
                ...(location !== undefined ? { location: location || null } : {}),
            },
        });

        const newAssigneeIds = await this.syncAssignees(id, data.assigneeIds);
        const full = await this.findOne(id);

        if (newAssigneeIds !== undefined) {
            const addedIds = newAssigneeIds.filter(
                (uid) => !previousAssigneeIds.includes(uid),
            );
            if (addedIds.length > 0) {
                await this.notifyMeetingAssignees(full, addedIds, userId, true);
            }
        }

        return full;
    }

    async delete(id: string) {
        await this.findOne(id);
        await this.prisma.meeting.delete({ where: { id } });
        return true;
    }
}
