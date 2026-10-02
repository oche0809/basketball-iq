// ブラウザテストの共通部品。選択は role・名前・ラベルを優先し、固定時間の待ちは使わない。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test as base, expect, type Page } from '@playwright/test'
import { STORAGE_KEY } from '../src/storage/attemptStore.ts'
import type { Question, QuestionSet } from '../src/types/content.ts'

// 実際の教材データ（data/sample_questions.json）をそのまま使う
const data = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'data', 'sample_questions.json'), 'utf8')) as {
  questions: Question[]
  question_sets: QuestionSet[]
}
export const QUESTIONS = data.questions
export const SETS = data.question_sets
export const question = (id: string) => QUESTIONS.find((q) => q.id === id)!
export const set = (id: string) => SETS.find((s) => s.id === id)!
export { STORAGE_KEY }

// すべてのテストで、ページのエラー・コンソールのエラーがないことを最後に確かめる
export const test = base.extend<{ noErrors: void }>({
  noErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
      page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
      await use()
      expect(errors, 'ページ・コンソールのエラー').toEqual([])
    },
    { auto: true },
  ],
})
export { expect }

// 最初にアプリを開く（Playwright はテストごとに新しいブラウザ環境なので、localStorage は空から始まる）
export async function openApp(page: Page, hash = '#/') {
  await page.goto(`./${hash}`)
  await expect(page.getByRole('main')).toBeVisible()
}

// 同じページの中で画面を移る（リンクを押すのと同じ。ページの再読み込みはしない）
export async function goHash(page: Page, hash: string) {
  await page.evaluate((h) => (window.location.hash = h), hash)
  await expect(page).toHaveURL(new RegExp(`${hash.replace(/[?]/g, '\\?')}$`))
}

// 保存されている学習記録（localStorage の中身をそのまま読む）
export async function storedAttempts(page: Page): Promise<Record<string, unknown>[]> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw).attempts as Record<string, unknown>[]) : []
  }, STORAGE_KEY)
}
export async function storedEnvelope(page: Page): Promise<{ schemaVersion: number; attempts: Record<string, unknown>[] } | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  }, STORAGE_KEY)
}

// 今表示している段階（「まず、何を見る？」などの見出しを持つ区画）
const STAGE_HEADINGS = /^(まず、何を見る？|この状況なら、どうする？|なぜ、そう判断した？|相手が動いた。次は？)$/
export const currentStage = (page: Page) => page.getByRole('region', { name: STAGE_HEADINGS })
export const explanation = (page: Page) => page.locator('#explain-title')

// 今の段階に答える（並び順の先頭の選択肢を選んで「決定」）。保存件数が変わらないことも確かめる
export async function answerStage(page: Page, expectStored?: number) {
  const stage = currentStage(page)
  await expect(stage).toBeVisible()
  await stage.getByRole('button').first().click()
  await page.getByRole('button', { name: '決定' }).click()
  await expect(page.getByRole('button', { name: /^(次へ|解説を見る)/ })).toBeVisible()
  if (expectStored !== undefined) expect(await storedAttempts(page)).toHaveLength(expectStored)
}

// 今の問題を、すべての段階に答えて解説まで進める。段階の途中では保存件数が before のまま、解説に入ったら before+1 になることを確かめる
export async function solveToExplanation(page: Page, stages: number, before: number) {
  for (let i = 0; i < stages; i++) {
    await answerStage(page, before)
    await page.getByRole('button', { name: /^(次へ|解説を見る)/ }).click()
    if (i < stages - 1) {
      await expect(currentStage(page)).toBeVisible()
      expect(await storedAttempts(page), `段階${i + 2}へ進んだ時点`).toHaveLength(before)
    }
  }
  await expect(explanation(page)).toBeVisible()
  await expect.poll(async () => (await storedAttempts(page)).length).toBe(before + 1)
}

// 横スクロールがないこと・見えている操作部品の高さが 44px 以上であること
export async function layoutProblems(page: Page, { minTarget = true } = {}) {
  return page.evaluate((checkSize) => {
    const problems: string[] = []
    if (document.documentElement.scrollWidth > window.innerWidth) problems.push(`横スクロール ${document.documentElement.scrollWidth}>${window.innerWidth}`)
    if (checkSize) {
      for (const el of document.querySelectorAll<HTMLElement>('a, button, input, select, textarea')) {
        const r = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        if (r.width === 0 || r.height === 0 || style.visibility === 'hidden' || el.getAttribute('aria-hidden') === 'true') continue
        if (el.classList.contains('sr-only')) continue
        if (r.height < 44) problems.push(`高さ${Math.round(r.height)}px：${(el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 20)}`)
      }
    }
    return problems
  }, minTarget)
}
