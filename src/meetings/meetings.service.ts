import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleService } from '../google/google.service';

const meetingInclude = {
    project: { select: { id: true, name: true } },
    createdBy: { select: { id: true, name: true, email: true } },
} as const;

type MeetingWriteData = {
    title: string;
    description?: string;
    projectId?: string;
    startTime: Date;
    endTime: Date;
    location?: string;
    generateMeetLink?: boolean;
};

@Injectable()
export class MeetingsService {
    constructor(
        private prisma: PrismaService,
        private googleService: GoogleService,
    ) {}

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
        return this.prisma.meeting.findMany({
            where: {
                ...(projectId ? { projectId } : {}),
                startTime: { lte: to },
                endTime: { gte: from },
            },
            include: meetingInclude,
            orderBy: { startTime: 'asc' },
        });
    }

    async findOne(id: string) {
        const meeting = await this.prisma.meeting.findUnique({
            where: { id },
            include: meetingInclude,
        });
        if (!meeting) {
            throw new NotFoundException('Meeting not found');
        }
        return meeting;
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

        return this.prisma.meeting.create({
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
    }

    async update(id: string, userId: string, data: Partial<MeetingWriteData>) {
        const existing = await this.findOne(id);
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
                description: data.description ?? existing.description ?? undefined,
                startTime,
                endTime,
            });
        }

        return this.prisma.meeting.update({
            where: { id },
            data: {
                ...(data.title !== undefined ? { title: data.title } : {}),
                ...(data.description !== undefined
                    ? { description: data.description }
                    : {}),
                ...(data.startTime !== undefined ? { startTime: data.startTime } : {}),
                ...(data.endTime !== undefined ? { endTime: data.endTime } : {}),
                ...(data.projectId !== undefined
                    ? { projectId: data.projectId || null }
                    : {}),
                ...(location !== undefined ? { location: location || null } : {}),
            },
            include: meetingInclude,
        });
    }

    async delete(id: string) {
        await this.findOne(id);
        await this.prisma.meeting.delete({ where: { id } });
        return true;
    }
}
