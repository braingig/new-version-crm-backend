import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PayrollStatus } from '@prisma/client';

@Injectable()
export class PayrollService {
    constructor(private prisma: PrismaService) { }

    async generatePayroll(employeeId: string, month: Date) {
        const employee = await this.prisma.user.findUnique({
            where: { id: employeeId },
        });

        if (!employee) {
            throw new Error('Employee not found');
        }

        // Get time entries for the month
        const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
        const endOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0);

        let baseSalary = employee.salaryAmount;
        let hoursWorked: number | undefined;

        if (employee.salaryType === 'HOURLY') {
            const timeEntries = await this.prisma.timeEntry.findMany({
                where: {
                    employeeId,
                    startTime: {
                        gte: startOfMonth,
                        lte: endOfMonth,
                    },
                },
            });

            // TimeEntry.duration: new entries in seconds; old entries in minutes
            const totalSeconds = timeEntries.reduce((sum, entry) => {
                const d = entry.duration ?? 0;
                return sum + (d >= 60 ? d : d * 60);
            }, 0);
            hoursWorked = totalSeconds / 3600;
            baseSalary = hoursWorked * employee.salaryAmount;
        }

        const totalPaid = baseSalary;

        return this.prisma.payroll.create({
            data: {
                employeeId,
                month: startOfMonth,
                baseSalary,
                totalPaid,
                hoursWorked,
                status: PayrollStatus.PENDING,
            },
            include: {
                employee: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        salaryType: true,
                    },
                },
            },
        });
    }

    async findAll(filters?: { employeeId?: string; status?: PayrollStatus }) {
        return this.prisma.payroll.findMany({
            where: filters,
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
                month: 'desc',
            },
        });
    }

    async updatePayroll(
        id: string,
        data: Partial<{
            bonus: number;
            deductions: number;
            status: PayrollStatus;
        }>,
    ) {
        const payroll = await this.prisma.payroll.findUnique({
            where: { id },
        });

        if (!payroll) {
            throw new Error('Payroll not found');
        }

        const bonus = data.bonus ?? payroll.bonus;
        const deductions = data.deductions ?? payroll.deductions;
        const totalPaid = payroll.baseSalary + bonus - deductions;

        return this.prisma.payroll.update({
            where: { id },
            data: {
                ...data,
                totalPaid,
                ...(data.status === PayrollStatus.PAID && { paidAt: new Date() }),
            },
        });
    }
}
