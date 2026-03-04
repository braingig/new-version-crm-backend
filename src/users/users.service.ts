import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, UserRole } from '@prisma/client';

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
        await this.prisma.user.delete({
            where: { id },
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
}
