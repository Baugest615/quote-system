/**
 * Auth Setup — 為需要登入的 E2E 測試做身份驗證準備
 *
 * 用法：在 playwright.config.ts 的 projects 中加入 setup dependency：
 *   { name: 'setup', testMatch: /auth\.setup\.ts/ }
 *   { name: 'authenticated', dependencies: ['setup'], use: { storageState: 'e2e/.auth/user.json' } }
 *
 * 環境變數（建立 .env.test.local）：
 *   E2E_EMAIL=your-test-user@example.com
 *   E2E_PASSWORD=your-test-password
 *
 * 注意：僅在本地開發時使用測試帳號，切勿提交真實帳號到版本控制。
 */
import { test as setup, expect } from '@playwright/test'
import path from 'path'

const authFile = path.join(__dirname, '.auth/user.json')

setup('authenticate', async ({ page }) => {
  const email = process.env.E2E_EMAIL
  const password = process.env.E2E_PASSWORD

  if (!email || !password) {
    console.warn('[E2E auth setup] E2E_EMAIL / E2E_PASSWORD not set — skipping auth setup')
    return
  }

  await page.goto('/auth/login')

  await page.locator('input[type="email"], input[name="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.locator('button[type="submit"]').click()

  // 等待登入成功，跳轉到 dashboard
  await expect(page).toHaveURL(/dashboard/, { timeout: 10_000 })

  // 儲存 session 供後續測試複用
  await page.context().storageState({ path: authFile })
})
