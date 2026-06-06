import {
    BadRequestException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GOOGLE_CALENDAR_EVENTS_URL =
    'https://www.googleapis.com/calendar/v3/calendars/primary/events';

const GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/userinfo.email',
];

@Injectable()
export class GoogleService {
    constructor(
        private prisma: PrismaService,
        private config: ConfigService,
        private jwtService: JwtService,
    ) {}

    private get clientId(): string {
        return this.config.get<string>('GOOGLE_CLIENT_ID') || '';
    }

    private get clientSecret(): string {
        return this.config.get<string>('GOOGLE_CLIENT_SECRET') || '';
    }

    private get redirectUri(): string {
        return (
            this.config.get<string>('GOOGLE_REDIRECT_URI') ||
            'http://localhost:4000/api/auth/google/callback'
        );
    }

    private get appUrl(): string {
        return (
            this.config.get<string>('PUBLIC_APP_URL') ||
            this.config.get<string>('CORS_ORIGIN')?.split(',')[0]?.trim() ||
            'http://localhost:3000'
        );
    }

    assertConfigured() {
        if (!this.clientId || !this.clientSecret) {
            throw new BadRequestException(
                'Google OAuth is not configured on the server.',
            );
        }
    }

    createOAuthState(userId: string): string {
        return this.jwtService.sign(
            { sub: userId, purpose: 'google_calendar_connect' },
            { expiresIn: '10m' },
        );
    }

    verifyOAuthState(state: string): string {
        try {
            const payload = this.jwtService.verify(state) as {
                sub?: string;
                purpose?: string;
            };
            if (payload.purpose !== 'google_calendar_connect' || !payload.sub) {
                throw new UnauthorizedException('Invalid OAuth state');
            }
            return payload.sub;
        } catch {
            throw new UnauthorizedException('Invalid or expired OAuth state');
        }
    }

    getAuthorizationUrl(userId: string): string {
        this.assertConfigured();

        const params = new URLSearchParams({
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            response_type: 'code',
            scope: GOOGLE_SCOPES.join(' '),
            access_type: 'offline',
            prompt: 'consent',
            include_granted_scopes: 'true',
            state: this.createOAuthState(userId),
        });

        return `${GOOGLE_AUTH_URL}?${params.toString()}`;
    }

    verifyAccessToken(accessToken: string): string {
        try {
            const payload = this.jwtService.verify(accessToken) as { sub?: string };
            if (!payload.sub) {
                throw new UnauthorizedException('Invalid access token');
            }
            return payload.sub;
        } catch {
            throw new UnauthorizedException('Invalid or expired access token');
        }
    }

    async exchangeCodeAndSave(userId: string, code: string) {
        this.assertConfigured();

        const body = new URLSearchParams({
            code,
            client_id: this.clientId,
            client_secret: this.clientSecret,
            redirect_uri: this.redirectUri,
            grant_type: 'authorization_code',
        });

        const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });

        const tokenData = (await tokenRes.json()) as {
            refresh_token?: string;
            access_token?: string;
            error?: string;
            error_description?: string;
        };

        if (!tokenRes.ok || tokenData.error) {
            throw new BadRequestException(
                tokenData.error_description ||
                    tokenData.error ||
                    'Failed to exchange Google authorization code',
            );
        }

        if (!tokenData.refresh_token) {
            throw new BadRequestException(
                'Google did not return a refresh token. Revoke app access in your Google account and try again with prompt=consent.',
            );
        }

        let googleEmail: string | undefined;
        if (tokenData.access_token) {
            const profileRes = await fetch(GOOGLE_USERINFO_URL, {
                headers: { Authorization: `Bearer ${tokenData.access_token}` },
            });
            if (profileRes.ok) {
                const profile = (await profileRes.json()) as { email?: string };
                googleEmail = profile.email;
            }
        }

        await this.prisma.user.update({
            where: { id: userId },
            data: {
                googleRefreshToken: tokenData.refresh_token,
                googleEmail: googleEmail ?? null,
                googleConnectedAt: new Date(),
            },
        });

        return { googleEmail };
    }

    async getConnectionStatus(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                googleRefreshToken: true,
                googleEmail: true,
                googleConnectedAt: true,
            },
        });

        return {
            connected: Boolean(user?.googleRefreshToken),
            googleEmail: user?.googleEmail ?? null,
            connectedAt: user?.googleConnectedAt ?? null,
        };
    }

    async disconnect(userId: string) {
        await this.prisma.user.update({
            where: { id: userId },
            data: {
                googleRefreshToken: null,
                googleEmail: null,
                googleConnectedAt: null,
            },
        });
        return true;
    }

    getSettingsRedirectUrl(result: 'connected' | 'error', message?: string): string {
        const url = new URL('/dashboard/settings', this.appUrl);
        url.searchParams.set('google', result);
        if (message) {
            url.searchParams.set('message', message);
        }
        return url.toString();
    }

    private get calendarTimeZone(): string {
        return this.config.get<string>('REMINDER_TIMEZONE') || 'UTC';
    }

    private async getGoogleAccessToken(userId: string): Promise<string> {
        this.assertConfigured();

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { googleRefreshToken: true },
        });

        if (!user?.googleRefreshToken) {
            throw new BadRequestException(
                'Google Calendar is not connected. Connect it in Settings first.',
            );
        }

        const body = new URLSearchParams({
            client_id: this.clientId,
            client_secret: this.clientSecret,
            refresh_token: user.googleRefreshToken,
            grant_type: 'refresh_token',
        });

        const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });

        const tokenData = (await tokenRes.json()) as {
            access_token?: string;
            error?: string;
            error_description?: string;
        };

        if (!tokenRes.ok || tokenData.error || !tokenData.access_token) {
            if (tokenData.error === 'invalid_grant') {
                await this.disconnect(userId);
            }
            throw new BadRequestException(
                tokenData.error_description ||
                    tokenData.error ||
                    'Failed to refresh Google access token. Reconnect Google Calendar in Settings.',
            );
        }

        return tokenData.access_token;
    }

    private extractMeetLink(calendarEvent: {
        hangoutLink?: string;
        conferenceData?: {
            entryPoints?: { entryPointType?: string; uri?: string }[];
        };
    }): string | null {
        if (calendarEvent.hangoutLink) {
            return calendarEvent.hangoutLink;
        }

        const videoEntry = calendarEvent.conferenceData?.entryPoints?.find(
            (entry) => entry.entryPointType === 'video' && entry.uri,
        );

        return videoEntry?.uri ?? null;
    }

    async createMeetLink(
        userId: string,
        params: {
            title: string;
            description?: string;
            startTime: Date;
            endTime: Date;
        },
    ): Promise<string> {
        const accessToken = await this.getGoogleAccessToken(userId);
        const timeZone = this.calendarTimeZone;

        const eventBody = {
            summary: params.title,
            description: params.description || undefined,
            start: {
                dateTime: params.startTime.toISOString(),
                timeZone,
            },
            end: {
                dateTime: params.endTime.toISOString(),
                timeZone,
            },
            conferenceData: {
                createRequest: {
                    requestId: randomUUID(),
                    conferenceSolutionKey: { type: 'hangoutsMeet' },
                },
            },
        };

        const url = new URL(GOOGLE_CALENDAR_EVENTS_URL);
        url.searchParams.set('conferenceDataVersion', '1');

        const eventRes = await fetch(url.toString(), {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(eventBody),
        });

        const eventData = (await eventRes.json()) as {
            hangoutLink?: string;
            conferenceData?: {
                entryPoints?: { entryPointType?: string; uri?: string }[];
            };
            error?: { message?: string };
        };

        if (!eventRes.ok) {
            const message =
                eventData.error?.message ||
                'Failed to create Google Calendar event with Meet link.';

            if (/insufficient authentication scopes/i.test(message)) {
                await this.disconnect(userId);
                throw new BadRequestException(
                    'Google Calendar permission is missing or outdated. In Settings, disconnect Google Calendar, then connect again and approve calendar access.',
                );
            }

            throw new BadRequestException(message);
        }

        const meetLink = this.extractMeetLink(eventData);
        if (!meetLink) {
            throw new BadRequestException(
                'Google Calendar event was created but no Meet link was returned.',
            );
        }

        return meetLink;
    }
}
