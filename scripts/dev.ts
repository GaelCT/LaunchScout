import { createServer } from 'vite';
import { startApi } from '../server/start';

const api = await startApi();
const frontend = await createServer();
await frontend.listen();
frontend.printUrls();
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void Promise.allSettled([api.close(), frontend.close()]).then(() => process.exit(0));
  });
