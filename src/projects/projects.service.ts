import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType, ProjectStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import {
    extractMentionHandlesWithCatalog,
    joinTextsForMentions,
} from '../common/mentions/mention.util';
import { MailService } from '../mail/mail.service';

@Injectable()
export class ProjectsService {
    constructor(
        private prisma: PrismaService,
        private notificationsService: NotificationsService,
        private mail: MailService,
    ) {}

    async create(
        userId: string,
        data: {
            name: string;
            description?: string;
            note?: string;
            budget?: number;
            hourlyRate?: number;
            startDate?: Date;
            endDate?: Date;
            clientName?: string;
        },
    ) {
        const created = await this.prisma.project.create({
            data: {
                ...data,
                budget: data.budget ?? 0,
                startDate: data.startDate ?? new Date(),
                createdById: userId,
            },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });

        await this.notifyUsersMentionedInTexts(
            [created.description ?? '', created.note ?? ''],
            { id: created.id, name: created.name },
            userId,
        );

        return created;
    }

    async findAll(filters?: { status?: ProjectStatus }) {
        return this.prisma.project.findMany({
            where: {
                ...(filters?.status && { status: filters.status }),
            },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                tasks: {
                    select: {
                        id: true,
                        title: true,
                        status: true,
                    },
                },
                attachments: {
                    where: { deletedAt: null },
                    select: {
                        id: true,
                        originalName: true,
                        mimeType: true,
                        size: true,
                        createdAt: true,
                    },
                    orderBy: { createdAt: 'desc' },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
    }

    async findOne(id: string) {
        return this.prisma.project.findUnique({
            where: { id },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                    },
                },
                tasks: {
                    include: {
                        assignedTo: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                            },
                        },
                    },
                },
                attachments: {
                    where: { deletedAt: null },
                    select: {
                        id: true,
                        originalName: true,
                        mimeType: true,
                        size: true,
                        createdAt: true,
                    },
                    orderBy: { createdAt: 'desc' },
                },
            },
        });
    }

    async update(
        id: string,
        data: Partial<{
            name: string;
            description: string;
            note: string;
            budget: number;
            hourlyRate: number;
            status: ProjectStatus;
            startDate: Date;
            endDate: Date;
            clientName: string;
        }>,
        updatedByUserId?: string,
    ) {
        const existing = await this.prisma.project.findUnique({
            where: { id },
            select: { description: true, note: true },
        });

        const updated = await this.prisma.project.update({
            where: { id },
            data,
            include: {
                createdBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });

        if (updatedByUserId && existing) {
            const mentionTexts: string[] = [];
            if ((existing.description ?? '') !== (updated.description ?? '')) {
                mentionTexts.push(updated.description ?? '');
            }
            if ((existing.note ?? '') !== (updated.note ?? '')) {
                mentionTexts.push(updated.note ?? '');
            }
            if (mentionTexts.length > 0) {
                await this.notifyUsersMentionedInTexts(
                    mentionTexts,
                    { id: updated.id, name: updated.name },
                    updatedByUserId,
                );
            }
        }

        return updated;
    }

    async delete(id: string) {
        await this.prisma.project.delete({
            where: { id },
        });
        return true;
    }

    async getProjectStats() {
        const [total, active] = await Promise.all([
            this.prisma.project.count(),
            this.prisma.project.count({ where: { status: ProjectStatus.ACTIVE } }),
        ]);
        return { total, active };
    }

    private stripHtmlForMentions(raw: string): string {
        if (!raw) return '';
        if (!raw.includes('<')) return raw;
        return raw
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<\/div>/gi, '\n')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/\s+/g, ' ')
            .trim();
    }

    private extractMentionHandlesFromRichHtml(raw: string): string[] {
        if (!raw || !raw.includes('data-type="mention"')) return [];
        const out = new Set<string>();
        const mentionNodeRe = /<span\b[^>]*data-type=["']mention["'][^>]*>([\s\S]*?)<\/span>/gi;
        let match: RegExpExecArray | null;
        while ((match = mentionNodeRe.exec(raw)) !== null) {
            const fullTag = match[0];
            const inner = (match[1] ?? '').trim();
            const labelMatch = fullTag.match(/data-label=["']([^"']+)["']/i);
            const idMatch = fullTag.match(/data-id=["']([^"']+)["']/i);
            const charMatch = fullTag.match(
                /data-mention-suggestion-char=["']([^"']+)["']/i,
            );
            const mentionChar = (charMatch?.[1] ?? '@').trim();
            const rawHandle = (labelMatch?.[1] ?? idMatch?.[1] ?? inner ?? '').trim();
            if (!rawHandle) continue;
            let handle = rawHandle;
            if (mentionChar && handle.startsWith(mentionChar)) {
                handle = handle.slice(mentionChar.length).trim();
            }
            if (handle.startsWith('@')) {
                handle = handle.slice(1).trim();
            }
            if (handle) out.add(handle);
        }
        return [...out];
    }

    private async resolveMentionHandlesToUserIds(
        handles: string[],
        allUsers?: { id: string; name: string; email: string }[],
    ): Promise<string[]> {
        const unique = [...new Set(handles.map((h) => h.trim()).filter(Boolean))];
        if (unique.length === 0) return [];

        const users =
            allUsers ??
            (await this.prisma.user.findMany({
                where: { status: 'ACTIVE' },
                select: { id: true, name: true, email: true },
            }));
        const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));
        const byId = new Map(users.map((u) => [u.id, u.id]));
        const byNameLower = new Map<string, string[]>();
        for (const u of users) {
            const key = u.name.toLowerCase().trim();
            if (!byNameLower.has(key)) byNameLower.set(key, []);
            byNameLower.get(key)!.push(u.id);
        }

        const ids = new Set<string>();
        for (const h of unique) {
            const hl = h.toLowerCase();
            const idHit = byId.get(h);
            if (idHit) {
                ids.add(idHit);
                continue;
            }
            if (h.includes('@') && h.includes('.')) {
                const id = byEmail.get(hl);
                if (id) ids.add(id);
                continue;
            }
            const nameMatches = byNameLower.get(hl) ?? [];
            if (nameMatches.length === 1) {
                ids.add(nameMatches[0]);
            }
        }
        return [...ids];
    }

    private async notifyUsersMentionedInTexts(
        texts: string[],
        project: { id: string; name: string },
        authorUserId: string,
    ): Promise<void> {
        const htmlHandles = texts.flatMap((t) =>
            this.extractMentionHandlesFromRichHtml(t ?? ''),
        );
        const plainTexts = texts.map((t) => this.stripHtmlForMentions(t ?? ''));
        const combined = joinTextsForMentions(plainTexts);

        const allUsers = await this.prisma.user.findMany({
            where: { status: 'ACTIVE' },
            select: { id: true, name: true, email: true },
        });
        const names = allUsers.map((u) => u.name);
        const plainHandles = combined.includes('@')
            ? extractMentionHandlesWithCatalog(combined, names)
            : [];
        const handles = [...new Set([...htmlHandles, ...plainHandles])];
        if (handles.length === 0) return;

        const targetIds = await this.resolveMentionHandlesToUserIds(handles, allUsers);
        if (targetIds.length === 0) return;

        const author = await this.prisma.user.findUnique({
            where: { id: authorUserId },
            select: { name: true },
        });
        const authorName = author?.name ?? 'Someone';
        const link = `/dashboard/projects/${project.id}`;
        const excerpt = combined.trim();

        for (const uid of targetIds) {
            if (uid === authorUserId) continue;
            try {
                await this.notificationsService.create(uid, {
                    title: 'You were mentioned on a project',
                    message: `${authorName} mentioned you on "${project.name}".`,
                    type: NotificationType.INFO,
                    link,
                });
            } catch (err) {
                console.error('Failed to notify mentioned project user', uid, err);
            }

            const mentionedUser = allUsers.find((u) => u.id === uid);
            if (mentionedUser?.email) {
                const appName = this.mail.getAppDisplayName();
                const url = `${this.mail.getPublicAppBaseUrl()}${link}`;
                const safeExcerpt = excerpt
                    .slice(0, 2000)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;');
                const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:24px;background:#f4f6f8;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#1e3a5f 0%,#2d5a87 100%);padding:16px 20px;color:#fff;font-size:12px;letter-spacing:.08em;text-transform:uppercase;">${appName}</div>
    <div style="padding:24px 20px;">
      <p style="margin:0 0 10px;font-size:18px;font-weight:600;">Hello ${mentionedUser.name},</p>
      <p style="margin:0 0 12px;color:#374151;"><strong>${authorName}</strong> mentioned you in a project update.</p>
      <p style="margin:0 0 6px;color:#6b7280;font-size:13px;">Project</p>
      <p style="margin:0 0 12px;font-weight:600;">${project.name}</p>
      ${safeExcerpt ? `<p style="margin:0 0 14px;padding:12px;background:#f9fafb;border-left:3px solid #1e3a5f;border-radius:4px;color:#374151;white-space:pre-wrap;">${safeExcerpt}</p>` : ''}
      <a href="${url}" style="display:inline-block;background:#1e3a5f;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600;font-size:14px;">Open project</a>
    </div>
  </div>
</body>
</html>`;
                await this.mail.sendMailIfConfigured(
                    mentionedUser.email,
                    `You were mentioned: ${project.name}`,
                    html,
                );
            }
        }
    }
}
