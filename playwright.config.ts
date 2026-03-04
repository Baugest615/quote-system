import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E 測試配置
 *
 * 執行方式：
 *   npx playwright test          — 所有測試
 *   npx playwright test --ui     — 互動模式
 *   npm run test:e2e             — 同上（headless）
 *   npm run test:e2e:ui          — UI 模式
 *
 * 注意：E2E 測試需要本地 Next.js dev server 或已 build 的服務在 3000 port 運行。
 *       CI 模式下 webServer 會自動啟動；本地可先 npm run dev 再跑測試。
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* 本地開發時自動啟動 dev server（CI 環境由 pipeline 管理） */
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 120_000,
      },
})
