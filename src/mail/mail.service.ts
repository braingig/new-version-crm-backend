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
        'SMTP_USER and SMTP_PASS are missing or empty. Add them to the backend .env (Mailtrap inbox credentials) and restart the server.';

    constructor(private readonly config: ConfigService) {
        const port = Number(this.config.get('SMTP_PORT')) || 2525;
        const user = (this.config.get<string>('SMTP_USER') ?? '').trim();
        const pass = (this.config.get<string>('SMTP_PASS') ?? '').trim();

        this.fromAddress =
            this.config.get<string>('MAIL_FROM') || '"CRM" <noreply@example.com>';

        // Empty auth triggers nodemailer: "Missing credentials for PLAIN"
        if (!user || !pass) {
            this.transporter = null;
        } else {
            this.transporter = nodemailer.createTransport({
                host: this.config.get<string>('SMTP_HOST', 'sandbox.smtp.mailtrap.io'),
                port,
                auth: { user, pass },
            });
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

    /** Check SMTP connectivity and credentials (does not send a message). */
    async verifyConnection(): Promise<{ ok: true } | { ok: false; message: string }> {
        if (!this.transporter) {
            return { ok: false, message: MailService.missingCredsMessage };
        }
        try {
            await this.transporter.verify();
            return { ok: true };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            return { ok: false, message };
        }
    }

    /**
     * Verifies SMTP, then sends one test message (shows up in Mailtrap / your inbox).
     */
    async verifyAndSendTestEmail(
        to: string,
    ): Promise<
        | { ok: true; sentTo: string; messageId?: string }
        | { ok: false; message: string }
    > {
        if (!this.transporter) {
            return { ok: false, message: MailService.missingCredsMessage };
        }
        try {
            await this.transporter.verify();
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            return { ok: false, message };
        }
        try {
            const info = await this.transporter.sendMail({
                from: this.fromAddress,
                to,
                subject: 'CRM — SMTP test',
                text: [
                    'This is a test email from the CRM backend.',
                    `Time: ${new Date().toISOString()}`,
                    `To: ${to}`,
                ].join('\n'),
            });
            return { ok: true, sentTo: to, messageId: info.messageId };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            return { ok: false, message };
        }
    }
}
