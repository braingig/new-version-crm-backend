import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Req,
    Res,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AttachmentsService } from './attachments.service';
import { Request, Response } from 'express';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

type AuthedRequest = Request & { user?: any };

function uploadRootAbs(): string {
    const root = process.env.UPLOAD_DIR || 'uploads';
    return path.isAbsolute(root) ? root : path.resolve(process.cwd(), root);
}

function tmpDirAbs(): string {
    return path.join(uploadRootAbs(), '_tmp');
}

function maxBytes(): number {
    const mb = Number(process.env.UPLOAD_MAX_MB || '50');
    const safeMb = Number.isFinite(mb) && mb > 0 ? mb : 50;
    return Math.floor(safeMb * 1024 * 1024);
}

async function ensureDirSyncish(dir: string) {
    // Multer destination callback is not async; do best-effort sync by using mkdirSync via fs/promises? not allowed.
    // Use a quick sync import here to avoid race conditions.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fss = require('fs') as typeof import('fs');
    fss.mkdirSync(dir, { recursive: true });
}

function uploadFileInterceptor() {
    return FileInterceptor('file', {
        storage: diskStorage({
            destination: (_req, _file, cb) => {
                const dir = path.join(tmpDirAbs(), new Date().toISOString().slice(0, 10));
                try {
                    ensureDirSyncish(dir);
                    cb(null, dir);
                } catch (e) {
                    cb(e as any, dir);
                }
            },
            filename: (_req, file, cb) => {
                const ext = path.extname(file.originalname || '').slice(0, 20);
                cb(null, `${randomUUID()}${ext || ''}`);
            },
        }),
        limits: { fileSize: maxBytes() },
    });
}

@Controller('attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentsController {
    constructor(private attachments: AttachmentsService) {}

    private userId(req: AuthedRequest): string {
        const id = req.user?.userId || req.user?.id;
        if (!id) throw new Error('Missing authenticated user id.');
        return id;
    }

    @Post('tasks')
    @UseInterceptors(uploadFileInterceptor())
    async uploadTaskAttachment(
        @Req() req: AuthedRequest,
        @UploadedFile() file: Express.Multer.File,
        @Body('taskId') taskId?: string,
        @Body('draftKey') draftKey?: string,
    ) {
        if (!file) {
            return { ok: false, message: 'No file uploaded.' };
        }
        const created = await this.attachments.createTaskAttachment({
            userId: this.userId(req),
            taskId: taskId || undefined,
            draftKey: draftKey || undefined,
            tmpAbsPath: file.path,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
        });
        return {
            ok: true,
            attachment: created,
            // URL is stable; frontend can use it inside richtext
            url: `/api/attachments/tasks/${created.id}/download`,
        };
    }

    @Post('projects')
    @UseInterceptors(uploadFileInterceptor())
    async uploadProjectAttachment(
        @Req() req: AuthedRequest,
        @UploadedFile() file: Express.Multer.File,
        @Body('projectId') projectId?: string,
        @Body('draftKey') draftKey?: string,
    ) {
        if (!file) {
            return { ok: false, message: 'No file uploaded.' };
        }
        const created = await this.attachments.createProjectAttachment({
            userId: this.userId(req),
            projectId: projectId || undefined,
            draftKey: draftKey || undefined,
            tmpAbsPath: file.path,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
        });
        return {
            ok: true,
            attachment: created,
            url: `/api/attachments/projects/${created.id}/download`,
        };
    }

    @Post('tasks/finalize')
    async finalizeTaskDraft(
        @Req() req: AuthedRequest,
        @Body() body: { draftKey: string; taskId: string },
    ) {
        const moved = await this.attachments.finalizeTaskDraft(
            this.userId(req),
            body?.draftKey,
            body?.taskId,
        );
        return { ok: true, ...moved };
    }

    @Post('projects/finalize')
    async finalizeProjectDraft(
        @Req() req: AuthedRequest,
        @Body() body: { draftKey: string; projectId: string },
    ) {
        const moved = await this.attachments.finalizeProjectDraft(
            this.userId(req),
            body?.draftKey,
            body?.projectId,
        );
        return { ok: true, ...moved };
    }

    @Get('tasks/:id/download')
    async downloadTask(@Req() req: AuthedRequest, @Param('id') id: string, @Res() res: Response) {
        const { attachment, absPath } = await this.attachments.getAttachmentForDownload(
            'task',
            id,
            this.userId(req),
        );
        res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
        // Inline by default; browser will download for unknown types
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.originalName)}"`);
        return res.sendFile(absPath);
    }

    @Get('projects/:id/download')
    async downloadProject(@Req() req: AuthedRequest, @Param('id') id: string, @Res() res: Response) {
        const { attachment, absPath } = await this.attachments.getAttachmentForDownload(
            'project',
            id,
            this.userId(req),
        );
        res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.originalName)}"`);
        return res.sendFile(absPath);
    }

    @Delete('tasks/:id')
    async deleteTaskAttachment(@Req() req: AuthedRequest, @Param('id') id: string) {
        await this.attachments.deleteAttachmentNow('task', id, this.userId(req));
        return { ok: true };
    }

    @Delete('projects/:id')
    async deleteProjectAttachment(@Req() req: AuthedRequest, @Param('id') id: string) {
        await this.attachments.deleteAttachmentNow('project', id, this.userId(req));
        return { ok: true };
    }

    /**
     * Debug / health helper: ensure temp root exists.
     * Not linked in UI; safe in prod.
     */
    @Post('_ensure')
    async ensureDirs() {
        await fs.mkdir(tmpDirAbs(), { recursive: true });
        return { ok: true };
    }
}

