import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import EmbeddedPostgres from 'embedded-postgres';
import { connectDatabase, migrate } from '../server/db';
import { opaque } from '../server/security';

export async function testDatabase() {
  if (process.env.TEST_DATABASE_URL) {
    const db = connectDatabase(process.env.TEST_DATABASE_URL);
    await migrate(db);
    return { db, url: process.env.TEST_DATABASE_URL, stop: () => db.end() };
  }
  await mkdir('tmp', { recursive: true });
  const directory = await mkdtemp(resolve('tmp/security-postgres-'));
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port.');
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  const password = opaque();
  const cluster = new EmbeddedPostgres({
    databaseDir: directory,
    port,
    user: 'launchscout_test',
    password,
    authMethod: 'scram-sha-256',
    persistent: true,
    createPostgresUser: false,
    postgresFlags: ['-h', '127.0.0.1', '-c', 'max_connections=40'],
    onLog: () => {},
    onError: () => {},
  });
  await cluster.initialise();
  await cluster.start();
  const url = `postgresql://launchscout_test:${password}@127.0.0.1:${port}/postgres`;
  const db = connectDatabase(url);
  await migrate(db);
  return {
    db,
    url,
    stop: async () => {
      await db.end();
      await cluster.stop();
    },
  };
}
