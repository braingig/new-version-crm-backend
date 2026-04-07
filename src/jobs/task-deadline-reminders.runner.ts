import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { TaskDeadlineRemindersService } from '../tasks/task-deadline-reminders.service';

async function main() {
    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['log', 'warn', 'error'],
    });
    try {
        const svc = app.get(TaskDeadlineRemindersService);
        await svc.runDaily();
    } finally {
        await app.close();
    }
}

main().catch((err) => {
    // Ensure non-zero exit code so Easypanel marks the job as failed.
    console.error('[job] task-deadline-reminders failed:', err);
    process.exitCode = 1;
});

