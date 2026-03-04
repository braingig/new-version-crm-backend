import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '@prisma/client';
import { TimesheetsService } from '../timesheets/timesheets.service';

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private config: ConfigService,
        private timesheetsService: TimesheetsService,
    ) { }

    async validateUser(email: string, password: string): Promise<User | null> {
        const user = await this.prisma.user.findUnique({
            where: { email },
        });

        if (!user) {
            return null;
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return null;
        }

        return user;
    }

    async login(email: string, password: string) {
        const user = await this.validateUser(email, password);

        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        if (user.status !== 'ACTIVE') {
            throw new UnauthorizedException('Account is not active');
        }

        const tokens = await this.generateTokens(user);

        // Update last active and refresh token
        await this.prisma.user.update({
            where: { id: user.id },
            data: {
                lastActive: new Date(),
                refreshToken: tokens.refreshToken,
            },
        });

        // Don't send password in response
        const { password: _, refreshToken: __, ...userWithoutPassword } = user;

        return {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user: userWithoutPassword,
        };
    }

    async register(data: {
        email: string;
        password: string;
        name: string;
        role: any;
        phone?: string;
        department?: string;
        skills?: string[];
        salaryType: any;
        salaryAmount: number;
        joiningDate: Date;
    }) {
        // Check if user exists
        const existingUser = await this.prisma.user.findUnique({
            where: { email: data.email },
        });

        if (existingUser) {
            throw new UnauthorizedException('User already exists');
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(data.password, 10);

        // Create user
        const user = await this.prisma.user.create({
            data: {
                ...data,
                password: hashedPassword,
            },
        });

        const tokens = await this.generateTokens(user);

        // Update refresh token
        await this.prisma.user.update({
            where: { id: user.id },
            data: { refreshToken: tokens.refreshToken },
        });

        const { password: _, refreshToken: __, ...userWithoutPassword } = user;

        return {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user: userWithoutPassword,
        };
    }

    async refreshToken(refreshToken: string) {
        try {
            const payload = this.jwtService.verify(refreshToken, {
                secret: this.config.get('JWT_REFRESH_SECRET'),
            });

            const user = await this.prisma.user.findUnique({
                where: { id: payload.sub },
            });

            if (!user || user.refreshToken !== refreshToken) {
                throw new UnauthorizedException('Invalid refresh token');
            }

            const tokens = await this.generateTokens(user);

            await this.prisma.user.update({
                where: { id: user.id },
                data: { refreshToken: tokens.refreshToken },
            });

            return tokens;
        } catch (error) {
            throw new UnauthorizedException('Invalid refresh token');
        }
    }

    async logout(userId: string) {
        // Stop any active time entries when user logs out
        try {
            await this.timesheetsService.stopTimeEntry(userId);
        } catch (error) {
            // Log error but don't fail logout if no active timer exists
            console.error('Error stopping active time entry during logout:', error);
        }

        await this.prisma.user.update({
            where: { id: userId },
            data: { refreshToken: null },
        });

        return { message: 'Logged out successfully' };
    }

    private async generateTokens(user: User) {
        const payload = { sub: user.id, email: user.email, role: user.role };

        const accessToken = this.jwtService.sign(payload, {
            secret: this.config.get('JWT_SECRET'),
            expiresIn: this.config.get('JWT_EXPIRATION') || '7d',
        });

        const refreshToken = this.jwtService.sign(payload, {
            secret: this.config.get('JWT_REFRESH_SECRET'),
            expiresIn: this.config.get('JWT_REFRESH_EXPIRATION') || '7d',
        });

        return { accessToken, refreshToken };
    }
}
