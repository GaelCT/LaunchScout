import { existsSync } from 'node:fs';
import { readConfig } from './config';
import { connectDatabase } from './db';
import { createApp } from './app';

export async function startApi() {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local');
  const config = readConfig();
  const db = config.databaseUrl ? connectDatabase(config.databaseUrl) : undefined;
  if (db) await db.query('SELECT version FROM schema_migrations WHERE version=1');
  const app = await createApp(config, { db });
  app.addHook('onClose', async () => {
    await db?.end();
  });
  await app.listen({
    port: Number(process.env.API_PORT ?? 3001),
    host: process.env.API_HOST ?? '127.0.0.1',
  });
  return app;
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/server/start.ts')) {
  const app = await startApi().catch(() => {
    process.stderr.write('API startup failed. Check server configuration and migrations.\n');
    process.exit(1);
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      void app.close();
    });
}
