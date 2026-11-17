import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createResumeApi } from './server/resumeApi';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const api = createResumeApi({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL });
  return {
    plugins: [
      react(),
      {
        name: 'local-resume-api',
        configureServer(server) {
          server.middlewares.use(api);
        },
        configurePreviewServer(server) {
          server.middlewares.use(api);
        },
      },
    ],
  };
});
