import {
    Controller,
    Get,
    Query,
    Req,
    Res,
    UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { GoogleService } from './google.service';

@Controller('auth/google')
export class GoogleController {
    constructor(private readonly googleService: GoogleService) {}

    @Get('connect')
    connect(
        @Req() req: Request,
        @Query('access_token') accessTokenQuery: string | undefined,
        @Res() res: Response,
    ) {
        const headerToken = req.headers.authorization
            ?.replace(/^Bearer\s+/i, '')
            .trim();
        const accessToken = headerToken || accessTokenQuery?.trim();

        if (!accessToken) {
            throw new UnauthorizedException('Missing access token');
        }

        const userId = this.googleService.verifyAccessToken(accessToken);
        const url = this.googleService.getAuthorizationUrl(userId);
        return res.redirect(url);
    }

    @Get('callback')
    async callback(
        @Query('code') code: string | undefined,
        @Query('state') state: string | undefined,
        @Query('error') error: string | undefined,
        @Res() res: Response,
    ) {
        if (error) {
            return res.redirect(
                this.googleService.getSettingsRedirectUrl(
                    'error',
                    error === 'access_denied'
                        ? 'Google access was denied.'
                        : error,
                ),
            );
        }

        if (!code || !state) {
            return res.redirect(
                this.googleService.getSettingsRedirectUrl(
                    'error',
                    'Missing authorization code from Google.',
                ),
            );
        }

        try {
            const userId = this.googleService.verifyOAuthState(state);
            await this.googleService.exchangeCodeAndSave(userId, code);
            return res.redirect(
                this.googleService.getSettingsRedirectUrl('connected'),
            );
        } catch (err) {
            const message =
                err instanceof Error ? err.message : 'Google connection failed';
            return res.redirect(
                this.googleService.getSettingsRedirectUrl('error', message),
            );
        }
    }
}
