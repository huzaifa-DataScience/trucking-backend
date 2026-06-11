import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { existsSync, readFileSync } from 'fs';
import { json, urlencoded } from 'express';
import { join } from 'path';
import * as swaggerUi from 'swagger-ui-express';
import { AppModule } from './app.module';
import 'dotenv/config';

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
  // Default Express JSON limit is 100kb; bidding bids carry a client `computed`
  // snapshot (capped at 256kb in the service), so raise the parser limit.
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );
  const swaggerSpecPath =
    process.env.SWAGGER_TEST_FILE?.trim() || join(process.cwd(), 'swagger.json');
  if (existsSync(swaggerSpecPath)) {
    try {
      const specRaw = readFileSync(swaggerSpecPath, 'utf8');
      const swaggerSpec = JSON.parse(specRaw);
      app.use('/swagger-test', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
      console.log(`Swagger test UI: http://localhost:${process.env.PORT ?? 3000}/swagger-test`);
    } catch (err) {
      console.error(`Failed to load swagger file at ${swaggerSpecPath}:`, err);
    }
  } else {
    console.warn(
      `Swagger test disabled: no file found at ${swaggerSpecPath}. Set SWAGGER_TEST_FILE or add swagger.json at project root.`,
    );
  }
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Dashboard API running at http://localhost:${port}`);
}
bootstrap();
