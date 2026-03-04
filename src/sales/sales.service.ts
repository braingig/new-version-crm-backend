import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalesStatus } from '@prisma/client';

@Injectable()
export class SalesService {
    constructor(private prisma: PrismaService) { }

    async create(data: {
        leadName: string;
        companyName?: string;
        email?: string;
        phone?: string;
        source?: string;
        estimatedValue: number;
        assignedToId: string;
        notes?: string;
        expectedCloseDate?: Date;
    }) {
        return this.prisma.sale.create({
            data,
            include: {
                assignedTo: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });
    }

    async findAll(filters?: { assignedToId?: string; status?: SalesStatus }) {
        return this.prisma.sale.findMany({
            where: filters,
            include: {
                assignedTo: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
    }

    async update(
        id: string,
        data: Partial<{
            leadName: string;
            status: SalesStatus;
            estimatedValue: number;
            actualValue: number;
            notes: string;
        }>,
    ) {
        return this.prisma.sale.update({
            where: { id },
            data: {
                ...data,
                ...(data.status === SalesStatus.CLOSED_WON && { closedAt: new Date() }),
                ...(data.status === SalesStatus.CLOSED_LOST && { closedAt: new Date() }),
            },
        });
    }

    async getSalesStats(assignedToId?: string) {
        const where = assignedToId ? { assignedToId } : {};

        const [total, won, lost] = await Promise.all([
            this.prisma.sale.count({ where }),
            this.prisma.sale.count({ where: { ...where, status: SalesStatus.CLOSED_WON } }),
            this.prisma.sale.count({ where: { ...where, status: SalesStatus.CLOSED_LOST } }),
        ]);

        const totalRevenue = await this.prisma.sale.aggregate({
            where: { ...where, status: SalesStatus.CLOSED_WON },
            _sum: {
                actualValue: true,
            },
        });

        return {
            total,
            won,
            lost,
            revenue: totalRevenue._sum.actualValue || 0,
        };
    }
}
