import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * CI コンテナなど、Playwright が同梱を期待するビルドと違う Chromium しか
 * 置かれていない環境向けのフォールバック。ローカルでは通常どおり
 * `npx playwright install` で入ったブラウザが使われる。
 */
const PREINSTALLED_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const launchOptions = existsSync(PREINSTALLED_CHROME)
  ? { executablePath: PREINSTALLED_CHROME }
  : {};

/**
 * E2E は必ずダミー認識器（?recognizer=dummy）で回す。
 * 認識精度という不確実要素を排除して、ゲームループ・UI・端末間通信だけを検証する。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8787',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions } }],
  webServer: {
    // 本番ビルドを server から配信して、実際の配信構成のまま検証する
    command: 'npm run build --workspace @mojimoji/web && npm run start --workspace @mojimoji/server',
    url: 'http://localhost:8787/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
