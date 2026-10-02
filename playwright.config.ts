import { defineConfig, devices } from '@playwright/test'

// ブラウザの自動テスト（npm run test:e2e）。ユニットテスト（npm test・Vitest）とは別。
// 公開と同じ形（ビルド → /basketball-iq/ のプレビュー）で動かす。サーバーは Playwright が起動・停止する。
const PORT = 4174
export const BASE_URL = `http://localhost:${PORT}/basketball-iq/`

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    locale: 'ja-JP',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
