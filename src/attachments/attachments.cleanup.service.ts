import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AttachmentsService } from './attachments.service';
import { promises as fs } from 'fs';
import * as path from 'path';

async function safeUnlink(p: string) {
    try {
        await fs.unlink(p);
    } catch {}
}

async function safeRmdirIfEmpty(dir: string) {
    try {
        const left = await fs.readdir(dir);
        if (left.length === 0) await fs.rmdir(dir);
    } catch {}
}

async function walkDeleteOldFiles(root: string, olderThanMs: number) {
    let entries: Array<{ name: string; isDir: boolean }> = [];
    try {
        const dirents = await fs.readdir(root, { withFileTypes: true });
        entries = dirents.map((d) => ({ name: d.name, isDir: d.isDirectory() }));
    } catch {
        return;
    }

    for (const e of entries) {
        const abs = path.join(root, e.name);
        if (e.isDir) {
            await walkDeleteOldFiles(abs, olderThanMs);
            await safeRmdirIfEmpty(abs);
        } else {
            try {
                const st = await fs.stat(abs);
                const age = Date.now() - st.mtimeMs;
                if (age > olderThanMs) {
                    await safeUnlink(abs);
                }
            } catch {}
        }
    }
}

@Injectable()
export class AttachmentsCleanupService {
    constructor(
        private prisma: PrismaService,
        private attachments: AttachmentsService,
    ) {}

    /**
     * Runs daily at 03:30 server time.
     * - Permanently deletes attachments that were soft-deleted beyond the grace period.
     * - Cleans temp uploads older than 2 days.
     * - Cleans stale draft uploads (unfinalized create forms) older than ATTACHMENT_DRAFT_MAX_AGE_HOURS.
     */
    @Cron('0 30 3 * * *')
    async cleanup() {
        const graceDays = this.attachments.deleteGraceDays();
        const cutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000);

        const [taskGone, projectGone] = await Promise.all([
            this.prisma.taskAttachment.findMany({
                where: { deletedAt: { not: null, lt: cutoff } },
                select: { id: true, relPath: true },
            }),
            this.prisma.projectAttachment.findMany({
                where: { deletedAt: { not: null, lt: cutoff } },
                select: { id: true, relPath: true },
            }),
        ]);

        for (const a of taskGone) {
            const abs = path.resolve(this.attachments.uploadRootAbs(), a.relPath);
            await safeUnlink(abs);
            await this.prisma.taskAttachment.delete({ where: { id: a.id } }).catch(() => undefined);
        }
        for (const a of projectGone) {
            const abs = path.resolve(this.attachments.uploadRootAbs(), a.relPath);
            await safeUnlink(abs);
            await this.prisma.projectAttachment.delete({ where: { id: a.id } }).catch(() => undefined);
        }

        // Temp cleanup
        const tmpRoot = path.join(this.attachments.uploadRootAbs(), '_tmp');
        await walkDeleteOldFiles(tmpRoot, 2 * 24 * 60 * 60 * 1000);

        // Stale draft cleanup
        await this.attachments.purgeStaleDrafts();
    }
}

