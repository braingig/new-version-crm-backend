import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { AttachmentKind } from './attachments.types';

const SAFE_NAME_RE = /[^a-zA-Z0-9._-]+/g;

function sanitizeFileName(name: string): string {
    const base = (name || 'file').trim().replace(SAFE_NAME_RE, '_');
    // Avoid empty or dot-only names
    const cleaned = base.replace(/^_+/, '').replace(/^\.{1,}$/, 'file');
    return cleaned.length > 0 ? cleaned.slice(0, 180) : 'file';
}

async function ensureDir(dir: string) {
    await fs.mkdir(dir, { recursive: true });
}

async function fileExists(p: string): Promise<boolean> {
    try {
        await fs.stat(p);
        return true;
    } catch {
        return false;
    }
}

async function removeDirIfEmpty(dir: string) {
    try {
        const entries = await fs.readdir(dir);
        if (entries.length === 0) {
            await fs.rmdir(dir);
        }
    } catch {}
}

@Injectable()
export class AttachmentsService {
    constructor(
        private prisma: PrismaService,
        private config: ConfigService,
    ) {}

    uploadRootAbs(): string {
        const root = this.config.get<string>('UPLOAD_DIR') || 'uploads';
        return path.isAbsolute(root) ? root : path.resolve(process.cwd(), root);
    }

    maxBytes(): number {
        const mb = Number(this.config.get<string>('UPLOAD_MAX_MB') || '50');
        const safeMb = Number.isFinite(mb) && mb > 0 ? mb : 50;
        return Math.floor(safeMb * 1024 * 1024);
    }

    deleteGraceDays(): number {
        const days = Number(this.config.get<string>('ATTACHMENT_DELETE_GRACE_DAYS') || '7');
        const safe = Number.isFinite(days) && days >= 0 ? days : 7;
        return Math.floor(safe);
    }

    draftMaxAgeHours(): number {
        const h = Number(this.config.get<string>('ATTACHMENT_DRAFT_MAX_AGE_HOURS') || '48');
        const safe = Number.isFinite(h) && h >= 1 ? h : 48;
        return Math.floor(safe);
    }

    private kindDir(kind: AttachmentKind): string {
        return kind === 'task' ? 'tasks' : 'projects';
    }

    private ownerRelDir(kind: AttachmentKind, ownerId: string, draftKey?: string): string {
        if (draftKey) return path.join('drafts', this.kindDir(kind), draftKey);
        return path.join(this.kindDir(kind), ownerId);
    }

    private attachmentAbsPath(relPath: string): string {
        // relPath must never be absolute or traverse outside root.
        const root = this.uploadRootAbs();
        const abs = path.resolve(root, relPath);
        if (!abs.startsWith(root)) {
            throw new BadRequestException('Invalid attachment path.');
        }
        return abs;
    }

    private stripAttachmentLinkFromRichText(html: string | null | undefined, attachmentId: string): string | null {
        const input = html ?? '';
        if (!input) return html ?? null;
        const escapedId = attachmentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(
            `<p>\\s*<a[^>]*data-attachment-id=["']${escapedId}["'][^>]*>[\\s\\S]*?<\\/a>\\s*<\\/p>`,
            'gi',
        );
        const cleaned = input.replace(pattern, '');
        return cleaned;
    }

    async createTaskAttachment(params: {
        userId: string;
        taskId?: string;
        draftKey?: string;
        tmpAbsPath: string;
        originalName: string;
        mimeType: string;
        size: number;
    }) {
        const { userId, taskId, draftKey } = params;
        if (!taskId && !draftKey) {
            throw new BadRequestException('taskId or draftKey is required.');
        }
        if (taskId && draftKey) {
            throw new BadRequestException('Provide only one of taskId or draftKey.');
        }
        if (taskId) {
            const t = await this.prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
            if (!t) throw new NotFoundException('Task not found.');
        }

        const root = this.uploadRootAbs();
        const safeOrig = sanitizeFileName(params.originalName);
        const ext = path.extname(safeOrig).slice(0, 20);
        const storedName = `${randomUUID()}${ext || ''}`;
        const relDir = this.ownerRelDir('task', taskId || 'x', draftKey);
        const finalDirAbs = path.join(root, relDir);
        await ensureDir(finalDirAbs);

        const finalAbsPath = path.join(finalDirAbs, storedName);
        const relPath = path.join(relDir, storedName);

        // Move temp file -> final location
        await fs.rename(params.tmpAbsPath, finalAbsPath);

        const created = await this.prisma.taskAttachment.create({
            data: {
                taskId: taskId ?? null,
                draftKey: draftKey ?? null,
                originalName: params.originalName,
                storedName,
                mimeType: params.mimeType || 'application/octet-stream',
                size: params.size,
                relPath: relPath.replace(/\\/g, '/'),
                createdById: userId,
            },
        });

        return created;
    }

    async createProjectAttachment(params: {
        userId: string;
        projectId?: string;
        draftKey?: string;
        tmpAbsPath: string;
        originalName: string;
        mimeType: string;
        size: number;
    }) {
        const { userId, projectId, draftKey } = params;
        if (!projectId && !draftKey) {
            throw new BadRequestException('projectId or draftKey is required.');
        }
        if (projectId && draftKey) {
            throw new BadRequestException('Provide only one of projectId or draftKey.');
        }
        if (projectId) {
            const p = await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
            if (!p) throw new NotFoundException('Project not found.');
        }

        const root = this.uploadRootAbs();
        const safeOrig = sanitizeFileName(params.originalName);
        const ext = path.extname(safeOrig).slice(0, 20);
        const storedName = `${randomUUID()}${ext || ''}`;
        const relDir = this.ownerRelDir('project', projectId || 'x', draftKey);
        const finalDirAbs = path.join(root, relDir);
        await ensureDir(finalDirAbs);

        const finalAbsPath = path.join(finalDirAbs, storedName);
        const relPath = path.join(relDir, storedName);
        await fs.rename(params.tmpAbsPath, finalAbsPath);

        const created = await this.prisma.projectAttachment.create({
            data: {
                projectId: projectId ?? null,
                draftKey: draftKey ?? null,
                originalName: params.originalName,
                storedName,
                mimeType: params.mimeType || 'application/octet-stream',
                size: params.size,
                relPath: relPath.replace(/\\/g, '/'),
                createdById: userId,
            },
        });

        return created;
    }

    async finalizeTaskDraft(userId: string, draftKey: string, taskId: string) {
        if (!draftKey?.trim()) throw new BadRequestException('draftKey is required.');
        const task = await this.prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
        if (!task) throw new NotFoundException('Task not found.');

        // Only the creator of draft attachments can finalize them
        const drafts = await this.prisma.taskAttachment.findMany({
            where: { draftKey, taskId: null, createdById: userId, deletedAt: null },
        });
        if (drafts.length === 0) return { moved: 0 };

        const root = this.uploadRootAbs();
        const fromDirRel = this.ownerRelDir('task', 'x', draftKey);
        const toDirRel = this.ownerRelDir('task', taskId, undefined);
        const fromDirAbs = path.join(root, fromDirRel);
        const toDirAbs = path.join(root, toDirRel);
        await ensureDir(toDirAbs);

        let moved = 0;
        for (const a of drafts) {
            const fromAbs = this.attachmentAbsPath(a.relPath);
            const toAbs = path.join(toDirAbs, a.storedName);
            const nextRel = path.join(toDirRel, a.storedName).replace(/\\/g, '/');
            if (await fileExists(fromAbs)) {
                await fs.rename(fromAbs, toAbs);
                await this.prisma.taskAttachment.update({
                    where: { id: a.id },
                    data: { taskId, draftKey: null, relPath: nextRel },
                });
                moved += 1;
            } else {
                // File missing: mark deleted so it won't show
                await this.prisma.taskAttachment.update({
                    where: { id: a.id },
                    data: { deletedAt: new Date(), taskId: null },
                });
            }
        }

        // Best-effort: remove empty draft dir
        try {
            const left = await fs.readdir(fromDirAbs);
            if (left.length === 0) await fs.rmdir(fromDirAbs);
        } catch {}

        return { moved };
    }

    async finalizeProjectDraft(userId: string, draftKey: string, projectId: string) {
        if (!draftKey?.trim()) throw new BadRequestException('draftKey is required.');
        const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
        if (!project) throw new NotFoundException('Project not found.');

        const drafts = await this.prisma.projectAttachment.findMany({
            where: { draftKey, projectId: null, createdById: userId, deletedAt: null },
        });
        if (drafts.length === 0) return { moved: 0 };

        const root = this.uploadRootAbs();
        const fromDirRel = this.ownerRelDir('project', 'x', draftKey);
        const toDirRel = this.ownerRelDir('project', projectId, undefined);
        const fromDirAbs = path.join(root, fromDirRel);
        const toDirAbs = path.join(root, toDirRel);
        await ensureDir(toDirAbs);

        let moved = 0;
        for (const a of drafts) {
            const fromAbs = this.attachmentAbsPath(a.relPath);
            const toAbs = path.join(toDirAbs, a.storedName);
            const nextRel = path.join(toDirRel, a.storedName).replace(/\\/g, '/');
            if (await fileExists(fromAbs)) {
                await fs.rename(fromAbs, toAbs);
                await this.prisma.projectAttachment.update({
                    where: { id: a.id },
                    data: { projectId, draftKey: null, relPath: nextRel },
                });
                moved += 1;
            } else {
                await this.prisma.projectAttachment.update({
                    where: { id: a.id },
                    data: { deletedAt: new Date(), projectId: null },
                });
            }
        }

        try {
            const left = await fs.readdir(fromDirAbs);
            if (left.length === 0) await fs.rmdir(fromDirAbs);
        } catch {}

        return { moved };
    }

    private async assertCanAccessAttachment(
        kind: AttachmentKind,
        attachmentId: string,
        userId: string,
    ) {
        if (kind === 'task') {
            const a = await this.prisma.taskAttachment.findUnique({ where: { id: attachmentId } });
            if (!a || a.deletedAt) throw new NotFoundException('Attachment not found.');
            if (!a.taskId && a.createdById !== userId) {
                throw new ForbiddenException('Access denied.');
            }
            return { kind, attachment: a };
        }
        const a = await this.prisma.projectAttachment.findUnique({ where: { id: attachmentId } });
        if (!a || a.deletedAt) throw new NotFoundException('Attachment not found.');
        if (!a.projectId && a.createdById !== userId) {
            throw new ForbiddenException('Access denied.');
        }
        return { kind, attachment: a };
    }

    async getAttachmentForDownload(kind: AttachmentKind, attachmentId: string, userId: string) {
        const { attachment } = await this.assertCanAccessAttachment(kind, attachmentId, userId);
        const abs = this.attachmentAbsPath(attachment.relPath);
        if (!(await fileExists(abs))) {
            throw new NotFoundException('File not found on disk.');
        }
        return { attachment, absPath: abs };
    }

    async deleteAttachmentNow(kind: AttachmentKind, attachmentId: string, userId: string) {
        const access = await this.assertCanAccessAttachment(kind, attachmentId, userId);
        const attachment = access.attachment;

        // Delete file from disk first (best effort), then hard-delete DB row.
        const absPath = this.attachmentAbsPath(attachment.relPath);
        try {
            await fs.unlink(absPath);
        } catch {
            // If file is already missing, still remove DB row.
        }

        if (kind === 'task') {
            const taskAttachment = attachment as Awaited<
                ReturnType<PrismaService['taskAttachment']['findUnique']>
            >;
            if (taskAttachment?.taskId) {
                const task = await this.prisma.task.findUnique({
                    where: { id: taskAttachment.taskId },
                    select: { description: true, note: true },
                });
                if (task) {
                    const nextDescription = this.stripAttachmentLinkFromRichText(
                        task.description,
                        taskAttachment.id,
                    );
                    const nextNote = this.stripAttachmentLinkFromRichText(
                        task.note,
                        taskAttachment.id,
                    );
                    if (nextDescription !== task.description || nextNote !== task.note) {
                        await this.prisma.task.update({
                            where: { id: taskAttachment.taskId },
                            data: {
                                description: nextDescription,
                                note: nextNote,
                            },
                        });
                    }
                }
            }
            await this.prisma.taskAttachment.delete({
                where: { id: taskAttachment!.id },
            });
        } else {
            const projectAttachment = attachment as Awaited<
                ReturnType<PrismaService['projectAttachment']['findUnique']>
            >;
            if (projectAttachment?.projectId) {
                const project = await this.prisma.project.findUnique({
                    where: { id: projectAttachment.projectId },
                    select: { description: true, note: true },
                });
                if (project) {
                    const nextDescription = this.stripAttachmentLinkFromRichText(
                        project.description,
                        projectAttachment.id,
                    );
                    const nextNote = this.stripAttachmentLinkFromRichText(
                        project.note,
                        projectAttachment.id,
                    );
                    if (nextDescription !== project.description || nextNote !== project.note) {
                        await this.prisma.project.update({
                            where: { id: projectAttachment.projectId },
                            data: {
                                description: nextDescription,
                                note: nextNote,
                            },
                        });
                    }
                }
            }
            await this.prisma.projectAttachment.delete({
                where: { id: projectAttachment!.id },
            });
        }

        // Best-effort: cleanup now-empty leaf directories.
        const parent = path.dirname(absPath);
        await removeDirIfEmpty(parent);
        await removeDirIfEmpty(path.dirname(parent));
        return true;
    }

    async purgeStaleDrafts() {
        const cutoff = new Date(Date.now() - this.draftMaxAgeHours() * 60 * 60 * 1000);

        const [staleTaskDrafts, staleProjectDrafts] = await Promise.all([
            this.prisma.taskAttachment.findMany({
                where: {
                    taskId: null,
                    draftKey: { not: null },
                    createdAt: { lt: cutoff },
                },
                select: { id: true, relPath: true },
            }),
            this.prisma.projectAttachment.findMany({
                where: {
                    projectId: null,
                    draftKey: { not: null },
                    createdAt: { lt: cutoff },
                },
                select: { id: true, relPath: true },
            }),
        ]);

        for (const a of staleTaskDrafts) {
            const abs = this.attachmentAbsPath(a.relPath);
            try {
                await fs.unlink(abs);
            } catch {}
            await this.prisma.taskAttachment.delete({ where: { id: a.id } }).catch(() => undefined);
            await removeDirIfEmpty(path.dirname(abs));
        }

        for (const a of staleProjectDrafts) {
            const abs = this.attachmentAbsPath(a.relPath);
            try {
                await fs.unlink(abs);
            } catch {}
            await this.prisma.projectAttachment.delete({ where: { id: a.id } }).catch(() => undefined);
            await removeDirIfEmpty(path.dirname(abs));
        }

        return {
            taskDraftsPurged: staleTaskDrafts.length,
            projectDraftsPurged: staleProjectDrafts.length,
        };
    }
}

