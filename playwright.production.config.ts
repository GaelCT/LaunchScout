import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

process.env.PLAYWRIGHT_PRODUCTION = '1';

const baseURL = 'http://127.0.0.1:5174';

export default defineConfig({
  ...baseConfig,
  use: { ...baseConfig.use, baseURL },
  webServer: {
    command: 'npm run preview -- --port 5174 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
