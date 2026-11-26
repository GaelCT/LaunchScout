import { createApp } from '../server/app';
import { readConfig } from '../server/config';
import { connectDatabase } from '../server/db';

// Test-only paid adapter. Never imported by the application or sent to a live provider.
const config = readConfig();
const db = connectDatabase(config.databaseUrl!);
const app = await createApp(config, {
  db,
  audit: () => {},
  provider: async ({ signal }) => {
    process.stdout.write('provider_started\n');
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 700);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new Error('Aborted'));
        },
        { once: true },
      );
    });
    return {
      markdown: '# Synthetic result',
      warnings: [],
      usage: { inputTokens: 20, outputTokens: 20 },
    };
  },
});
const address = await app.listen({ host: '127.0.0.1', port: 0 });
process.stdout.write(JSON.stringify({ address }) + '\n');
process.once('message', () => {
  void app
    .close()
    .then(() => db.end())
    .then(() => process.exit(0));
});
