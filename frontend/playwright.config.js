// End-to-end tests. Start the stack first (start-demo / npm start in backend), then:
//   npx playwright install chromium   (first time only)
//   npm run test:e2e
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

// A fake microphone that "speaks" a recorded emergency call, for the voice tests
const VOICE = fileURLToPath(new URL('./e2e/fixtures/voice_sos.wav', import.meta.url));

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:4000',
    viewport: { width: 1400, height: 900 },
    permissions: ['microphone'],
    launchOptions: {
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${VOICE}`],
    },
  },
});
