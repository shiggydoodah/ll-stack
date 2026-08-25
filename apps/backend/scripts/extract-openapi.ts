import 'reflect-metadata';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';

async function extractOpenApi(): Promise<void> {
  process.env['OPENAPI_EXTRACT'] = 'true';
  process.env['NODE_ENV'] ??= 'development';
  process.env['PORT'] ??= '3100';
  process.env['DATABASE_URL'] ??= 'postgresql://postgres:@localhost:5433/app_docs';
  process.env['BACKEND_API_SECRET'] ??= 'openapi-api-secret';
  process.env['ADMIN_API_KEY'] ??= 'openapi-admin-key';

  const outputPathArg = process.argv[2] ?? '/tmp/openapi.json';
  const outputPath = resolve(outputPathArg);

  const { AppModule } = await import('../src/app.module.js');
  const { buildOpenApiDocument } = await import('../src/bootstrap/configure-app.js');

  const app = await NestFactory.create(AppModule, {
    logger: false,
    abortOnError: false,
  });

  try {
    const document = buildOpenApiDocument(app);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(document, null, 2), 'utf8');
  } finally {
    await app.close();
  }
}

void extractOpenApi().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
