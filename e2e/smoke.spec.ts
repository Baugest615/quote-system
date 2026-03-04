/**
 * Smoke Tests — 基本頁面載入與路由驗證
 * 不依賴真實帳號，僅驗證靜態 UI 與重導向邏輯
 */
import { test, expect } from '@playwright/test'

// ===== 登入頁面 =====

test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/login')
  })

  test('renders login form with email and password inputs', async ({ page }) => {
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('has a submit button', async ({ page }) => {
    const submitBtn = page.locator('button[type="submit"]')
    await expect(submitBtn).toBeVisible()
    await expect(submitBtn).toBeEnabled()
  })

  test('shows error on empty form submit', async ({ page }) => {
    await page.locator('button[type="submit"]').click()
    // Browser HTML5 validation or custom error message should appear
    // Either the native validation tooltip or a rendered error element
    const hasError =
      (await page.locator('[role="alert"], .error, [data-error]').count()) > 0 ||
      (await page.evaluate(() =>
        document.querySelector('input[type="email"]')?.validity.valueMissing ?? false
      ))
    expect(hasError).toBe(true)
  })

  test('shows error message for invalid credentials', async ({ page }) => {
    await page.locator('input[type="email"], input[name="email"]').fill('invalid@test.example')
    await page.locator('input[type="password"]').fill('wrongpassword')
    await page.locator('button[type="submit"]').click()

    // Wait for error message — should appear within 5 seconds
    await expect(
      page.locator('text=/登入失敗|帳號或密碼|error/i').first()
    ).toBeVisible({ timeout: 5000 })
  })
})

// ===== Root 重導向 =====

test.describe('Root redirect', () => {
  test('unauthenticated root redirects to login', async ({ page }) => {
    await page.goto('/')
    // Should redirect to /auth/login since no session
    await expect(page).toHaveURL(/auth\/login/, { timeout: 5000 })
  })

  test('dashboard requires auth — redirects to login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/auth\/login/, { timeout: 5000 })
  })
})

// ===== 404 頁面 =====

test.describe('404 page', () => {
  test('unknown route returns 404 UI', async ({ page }) => {
    const response = await page.goto('/this-page-does-not-exist-abc123')
    // Either HTTP 404 or a custom Not Found page
    const status = response?.status() ?? 200
    const hasNotFoundContent =
      status === 404 ||
      (await page.locator('text=/404|not found|找不到|Not Found/i').count()) > 0
    expect(hasNotFoundContent).toBe(true)
  })
})
