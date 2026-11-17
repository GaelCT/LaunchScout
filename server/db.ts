import { readFile } from 'node:fs/promises';
import pg from 'pg';
import type { PoolClient } from 'pg';

export function connectDatabase(connectionString: string) {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10_000,
    options: '-c timezone=UTC -c statement_timeout=5000 -c lock_timeout=3000',
  });
  pool.on('error', () => {
    process.stderr.write('{"event":"database_connection_lost"}\n');
  });
  return pool;
}
export type Database = ReturnType<typeof connectDatabase>;

export async function transaction<T>(
  db: Database,
  action: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function migrate(db: Database) {
  await transaction(db, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(71623110)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const applied = await client.query('SELECT 1 FROM schema_migrations WHERE version = 1');
    if (applied.rowCount) return;
    await client.query(
      await readFile(new URL('./migrations/001_auth_and_ai.sql', import.meta.url), 'utf8'),
    );
    await client.query('INSERT INTO schema_migrations(version) VALUES (1)');
  });
}
