import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface SendMailOptions {
    /** When true, `body` is sent as HTML; otherwise plain text. */
    html?: boolean;
}

@Injectable()
export class MailService {
    private readonly transporter: Transporter | null;
    private readonly fromAddress: string;
    private static readonly missingCredsMessage =
        'SMTP_HOST, SMTP_USER and SMTP_PASS must be set in the backend .env (non-empty) to send email.';

    constructor(private readonly config: ConfigService) {
        const port = Number(this.config.get('SMTP_PORT')) || 465;
        const host = (this.config.get<string>('SMTP_HOST') ?? '').trim();
        const user = (this.config.get<string>('SMTP_USER') ?? '').trim();
        const pass = (this.config.get<string>('SMTP_PASS') ?? '').trim();

        this.fromAddress =
            this.config.get<string>('MAIL_FROM') || '"CRM" <noreply@example.com>';

        if (!host || !user || !pass) {
            this.transporter = null;
        } else {
            const secureOverride = (
                this.config.get<string>('SMTP_SECURE') ?? ''
            )
                .trim()
                .toLowerCase();
            // Port 465 uses implicit TLS; 587 uses STARTTLS (secure: false). Hostinger docs use both.
            const secure =
                secureOverride === 'true' || secureOverride === '1'
                    ? true
                    : secureOverride === 'false' || secureOverride === '0'
                      ? false
                      : port === 465;

            this.transporter = nodemailer.createTransport({
                host,
                port,
                secure,
                auth: { user, pass },
                ...(port === 587 ? { requireTLS: true } : {}),
            });
        }
    }

    /**
     * Base URL for links in emails (task detail, etc.). Set PUBLIC_APP_URL or reuse CORS_ORIGIN.
     */
    getPublicAppBaseUrl(): string {
        const raw =
            (this.config.get<string>('PUBLIC_APP_URL') ?? '').trim() ||
            (this.config.get<string>('CORS_ORIGIN') ?? '').trim() ||
            'http://localhost:3000';
        const firstOrigin = raw
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean)[0] ?? 'http://localhost:3000';
        return firstOrigin.replace(/^"+|"+$/g, '').replace(/\/$/, '');
    }

    /**
     * Display name for email header branding.
     * Prefers APP_NAME; falls back to the name part from MAIL_FROM.
     */
    getAppDisplayName(): string {
        const app = (this.config.get<string>('APP_NAME') ?? '').trim();
        if (app) return app;

        const from = (this.config.get<string>('MAIL_FROM') ?? '').trim();
        const match = from.match(/^\s*"?([^"<]+?)"?\s*</);
        if (match?.[1]?.trim()) return match[1].trim();
        return 'CRM';
    }

    /**
     * Send HTML email when SMTP is configured; otherwise no-op. Does not throw on failure.
     */
    async sendMailIfConfigured(
        to: string,
        subject: string,
        html: string,
    ): Promise<{ sent: boolean; reason?: string }> {
        if (!this.transporter) {
            return { sent: false, reason: 'smtp_not_configured' };
        }
        const addr = (to ?? '').trim();
        if (!addr) {
            return { sent: false, reason: 'empty_recipient' };
        }
        try {
            await this.transporter.sendMail({
                from: this.fromAddress,
                to: addr,
                subject,
                html,
            });
            return { sent: true };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            console.error('[MailService] sendMailIfConfigured failed:', message);
            return { sent: false, reason: message };
        }
    }

    /**
     * Send an email. `to`, `subject`, and `body` are required; use `options.html` for HTML body.
     */
    async sendMail(
        to: string,
        subject: string,
        body: string,
        options?: SendMailOptions,
    ) {
        if (!this.transporter) {
            throw new Error(MailService.missingCredsMessage);
        }
        return this.transporter.sendMail({
            from: this.fromAddress,
            to,
            subject,
            ...(options?.html ? { html: body } : { text: body }),
        });
    }
}
