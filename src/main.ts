import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// Keep the process (and DB connection) alive when unhandled rejections occur.
process.on('unhandledRejection', (reason, promise) => {
  console.error('[unhandledRejection]', reason);
});

// Log uncaught exceptions; exit after a short delay so logs are written (process state may be inconsistent).
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  setTimeout(() => process.exit(1), 1000);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Dashboard API running at http://localhost:${port}`);
}
bootstrap();
