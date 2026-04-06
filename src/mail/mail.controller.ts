import { Controller, Post, UseGuards, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MailService } from './mail.service';

@Controller('mail')
export class MailController {
    constructor(
        private readonly mailService: MailService,
        private readonly config: ConfigService,
    ) {}

    /**
     * Verifies SMTP, then sends one test message so it appears in Mailtrap (verify alone does not send mail).
     */
    @Post('test')
    @UseGuards(JwtAuthGuard)
    async testSmtp(@Req() req: Request) {
        const jwtUser = req.user as { email?: string };
        const fromJwt = (jwtUser?.email ?? '').trim();
        const fromEnv = (this.config.get<string>('SMTP_TEST_TO') ?? '').trim();
        const to = fromJwt || fromEnv || 'test@example.com';
        return this.mailService.verifyAndSendTestEmail(to);
    }
}
