import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService) { }

    async findAll(filters?: { role?: UserRole; status?: string; department?: string }) {
        return this.prisma.user.findMany({
            where: {
                ...(filters?.role && { role: filters.role }),
                ...(filters?.status && { status: filters.status }),
                ...(filters?.department && { department: filters.department }),
            },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                phone: true,
                department: true,
                skills: true,
                salaryType: true,
                salaryAmount: true,
                joiningDate: true,
                status: true,
                lastActive: true,
                createdAt: true,
                updatedAt: true,
            },
        });
    }

    async findOne(id: string) {
        return this.prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                phone: true,
                department: true,
                skills: true,
                salaryType: true,
                salaryAmount: true,
                joiningDate: true,
                status: true,
                lastActive: true,
                createdAt: true,
                updatedAt: true,
            },
        });
    }

    async update(
        id: string,
        data: Partial<{
            name: string;
            email: string;
            phone: string;
            department: string;
            skills: string[];
            salaryType: any;
            salaryAmount: number;
            status: string;
        }>,
    ) {
        if (data.email !== undefined) {
            const existing = await this.prisma.user.findFirst({
                where: { email: data.email, id: { not: id } },
            });
            if (existing) {
                throw new ConflictException('Email is already in use by another user');
            }
        }
        return this.prisma.user.update({
            where: { id },
            data,
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                phone: true,
                department: true,
                skills: true,
                salaryType: true,
                salaryAmount: true,
                joiningDate: true,
                status: true,
                lastActive: true,
                createdAt: true,
                updatedAt: true,
            },
        });
    }

    async delete(id: string) {
        const fallbackUser = await this.prisma.user.findFirst({
            where: { id: { not: id } },
            select: { id: true },
        });
        if (!fallbackUser) {
            throw new BadRequestException(
                'Cannot delete the only user. At least one user must remain.',
            );
        }
        const fallbackId = fallbackUser.id;

        await this.prisma.$transaction(async (tx) => {
            await tx.project.updateMany({ where: { createdById: id }, data: { createdById: fallbackId } });
            await tx.task.updateMany({ where: { createdById: id }, data: { createdById: fallbackId } });
            await tx.sale.updateMany({ where: { assignedToId: id }, data: { assignedToId: fallbackId } });
            await tx.user.delete({ where: { id } });
        });
        return true;
    }

    async getActiveUsers() {
        return this.prisma.user.count({
            where: { status: 'ACTIVE' },
        });
    }

    async updateLastActive(id: string) {
        await this.prisma.user.update({
            where: { id },
            data: { lastActive: new Date() },
        });
    }

    async changePassword(id: string, newPassword: string) {
        const hashed = await bcrypt.hash(newPassword, 10);
        await this.prisma.user.update({
            where: { id },
            data: { password: hashed },
        });
        return true;
    }
}
