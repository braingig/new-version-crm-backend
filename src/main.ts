import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { NextFunction, Request, Response } from 'express';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    const configService = app.get(ConfigService);

    // Enable CORS: set CORS_ORIGIN in .env or in your platform's env (e.g. Easypanel)
    app.enableCors({
        origin: process.env.CORS_ORIGIN,
        // origin: 'http://localhost:3000',
        // origin: 'https://portal.braingig.com',
        credentials: true,
    });

    // Global validation pipe
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );

    // Handle root route specifically before setting global prefix
    const router = app.getHttpAdapter().getInstance();
    router.get('/', (req: Request, res: Response) => {
        res.send('backend is running 1.0.0');
    });

    // Global prefix
    app.setGlobalPrefix('api');

    const port = configService.get('PORT') || 4000;
    await app.listen(port);

    console.log(`🚀 Application is running on: http://localhost:${port}`);
    console.log(`📊 GraphQL Playground: http://localhost:${port}/api/graphql`);
}

bootstrap();
