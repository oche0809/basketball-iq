import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { expect, openApp, QUESTIONS, SETS, test } from './helpers.ts'
import { BASE_URL } from '../playwright.config.ts'
import type { Cue, Question } from '../src/types/content.ts'

const cues = (JSON.parse(readFileSync(join(import.meta.dirname, '..', 'data', 'cues.json'), 'utf8')) as { cues: Cue[] }).cues
const cueName = (id: string) => cues.find((c) => c.id === id)?.name ?? ''
const norm = (s: string) => s.normalize('NFKC').toLowerCase()

// 期待値は、画面のコードを使わずに教材データから直接求める
type F = { q?: string; cat?: string; diff?: string; grade?: number }
function expectedQuestion(q: Question, f: F) {
  if (f.cat && q.category !== f.cat) return false
  if (f.diff && q.difficulty !== f.diff) return false
  if (f.grade && !q.grade.includes(f.grade)) return false
  if (f.q) {
    const text = norm([q.id, q.title, q.situation, ...q.cues.map(cueName)].join(' '))
    if (!norm(f.q).split(/\s+/).filter(Boolean).every((t) => text.includes(t))) return false
  }
  return true
}
// セット：条件をすべて満たす問題が1問以上入っているセット
const expectedSets = (f: F) => SETS.filter((s) => s.items.some((id) => expectedQuestion(QUESTIONS.find((q) => q.id === id)!, f))).map((s) => s.id)
const expectedQuestions = (f: F) => QUESTIONS.filter((q) => expectedQuestion(q, f)).map((q) => q.id)

const setList = (page: Page) => page.getByRole('list', { name: 'セットの一覧' })
const questionList = (page: Page) => page.getByRole('list', { name: '問題の一覧' })
// 一覧に表示されている教材のID（各ボタンの中にIDが表示されている）
async function shownQuestionIds(page: Page) {
  if (!(await questionList(page).isVisible())) return []
  const texts = await questionList(page).getByRole('button').allTextContents()
  return texts.map((t) => t.match(/[A-Z]{2}-[A-Z0-9]+-\d+-[A-Z]/)![0])
}
async function shownSetIds(page: Page) {
  if (!(await setList(page).isVisible())) return []
  const texts = await setList(page).getByRole('button').allTextContents()
  return texts.map((t) => t.match(/SET-[A-Z0-9-]+?(?=　|出題順)/)![0])
}
const press = (page: Page, group: string, name: string) => page.getByRole('group', { name: group }).getByRole('button', { name, exact: true }).click()
const urlBox = (page: Page): Locator => page.getByRole('textbox', { name: /課題URL/ })

test.describe('COACH', () => {
  test('PC：上部ナビに COACH があり、開ける。スマホの下部タブには COACH がない', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await openApp(page, '#/')
    const topNav = page.getByRole('navigation', { name: 'メインメニュー' }).filter({ visible: true })
    await expect(topNav).toHaveCount(1)
    await topNav.getByRole('link', { name: /COACH/ }).click()
    await expect(page.getByRole('heading', { name: /COACH/, level: 1 })).toBeVisible()

    await page.setViewportSize({ width: 375, height: 740 })
    const bottom = page.getByRole('navigation', { name: 'メインメニュー' }).filter({ visible: true })
    await expect(bottom).toHaveCount(1)
    await expect(bottom.getByRole('link')).toHaveText(['HOME', 'PLAY', 'MAP', 'MY IQ'])
    await expect(bottom.getByRole('link', { name: /COACH/ })).toHaveCount(0)
  })

  test('一覧：セットと「問題（1問だけ出す）」が実データどおりに出る（セットの中の問題も含む）', async ({ page }) => {
    await openApp(page, '#/coach')
    await expect(page.getByRole('heading', { name: `セット（${SETS.length}）` })).toBeVisible()
    await expect(page.getByRole('heading', { name: `問題（1問だけ出す）（${QUESTIONS.length}）` })).toBeVisible()
    expect(await shownSetIds(page)).toEqual(SETS.map((s) => s.id))
    expect(await shownQuestionIds(page)).toEqual(QUESTIONS.map((q) => q.id))
    const inSet = QUESTIONS.find((q) => q.set_id)!
    await expect(questionList(page).getByRole('button', { name: new RegExp(inSet.id) })).toContainText(`セット「${SETS.find((s) => s.id === inSet.set_id)!.title}」の問題`)
  })

  test('絞り込み：カテゴリー・難易度・学年・キーワード。表示された教材が条件を満たし、AND で減る', async ({ page }) => {
    await openApp(page, '#/coach')
    const check = async (f: F) => {
      await expect.poll(() => shownQuestionIds(page)).toEqual(expectedQuestions(f))
      await expect.poll(() => shownSetIds(page)).toEqual(expectedSets(f))
    }
    await press(page, 'カテゴリー', 'OFFENSE')
    await check({ cat: 'OFFENSE' })
    const offense = expectedQuestions({ cat: 'OFFENSE' }).length
    await press(page, '難易度', '初級')
    await check({ cat: 'OFFENSE', diff: 'BEGINNER' })
    await press(page, '学年', '1年')
    await check({ cat: 'OFFENSE', diff: 'BEGINNER', grade: 1 })
    const and = expectedQuestions({ cat: 'OFFENSE', diff: 'BEGINNER', grade: 1 }).length
    expect(and).toBeGreaterThan(0)
    expect(and).toBeLessThan(offense)
    // 表示されている問題が、3つの条件をすべて満たしている
    for (const id of await shownQuestionIds(page)) {
      const q = QUESTIONS.find((x) => x.id === id)!
      expect(q.category === 'OFFENSE' && q.difficulty === 'BEGINNER' && q.grade.includes(1), id).toBe(true)
    }
    // ほかの値でも
    await press(page, 'カテゴリー', 'すべて')
    await press(page, '難易度', '上級')
    await press(page, '学年', '3年')
    await check({ diff: 'ADVANCED', grade: 3 })
    await press(page, '難易度', 'すべて')
    await press(page, '学年', 'すべて')
    await press(page, 'カテゴリー', 'TRANSITION')
    await check({ cat: 'TRANSITION' })
    await press(page, 'カテゴリー', 'すべて')
    // キーワード（全角・半角を区別しない）
    await page.getByRole('searchbox', { name: 'キーワード' }).fill('２対１')
    await check({ q: '２対１' })
    expect(expectedQuestions({ q: '２対１' })).toEqual(expectedQuestions({ q: '2対1' }))
    expect(expectedQuestions({ q: '２対１' }).length).toBeGreaterThan(0)
    // 当てはまるものがない時
    await page.getByRole('searchbox', { name: 'キーワード' }).fill('存在しないことば')
    await expect(page.getByText('条件に合うセットはありません。')).toBeVisible()
    await expect(page.getByText('条件に合う問題はありません。')).toBeVisible()
  })

  test('課題URL：選ぶまで作成できない。セット・問題のURLは教材のIDだけ（? 以降を持ち込まない）', async ({ page }) => {
    await page.goto('./?from=test#/coach') // ? 以降があっても、課題URLには入らないこと
    const create = page.getByRole('button', { name: '課題URLを作成' })
    await expect(create).toBeDisabled()
    await expect(page.getByText('セットか問題を1つ選んでください。')).toBeVisible()

    await setList(page).getByRole('button', { name: /ドライブ：DFの反応が3通り/ }).click()
    await expect(setList(page).getByRole('button', { name: /ドライブ：DFの反応が3通り/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('選択中：セット「ドライブ：DFの反応が3通り」')).toBeVisible()
    await create.click()
    await expect(urlBox(page)).toHaveValue(`${BASE_URL}#/play/assignment/set/SET-DRIVE-HELP`)

    // 選び直すと作り直しになる
    await questionList(page).getByRole('button', { name: /GI-CLK-02-B/ }).click()
    await expect(urlBox(page)).toHaveCount(0)
    await page.getByRole('button', { name: '課題URLを作成' }).click()
    const url = await urlBox(page).inputValue()
    expect(url).toBe(`${BASE_URL}#/play/assignment/q/GI-CLK-02-B`)
    expect(url).not.toContain('from=test')
    expect(new URL(url).search).toBe('')
  })

  test('コピー：成功した時の表示・できなかった時の案内（クリップボードはテストで差し替え）', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __copied: string[]; __copyFails: boolean }
      w.__copied = []
      w.__copyFails = false
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: (t: string) => (w.__copyFails ? Promise.reject(new DOMException('denied', 'NotAllowedError')) : (w.__copied.push(t), Promise.resolve())) },
      })
    })
    await openApp(page, '#/coach')
    await setList(page).getByRole('button', { name: /2対1：DFが来る／来ない/ }).click()
    await page.getByRole('button', { name: '課題URLを作成' }).click()
    const url = await urlBox(page).inputValue()

    await page.getByRole('button', { name: '課題URLをコピー' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'コピーしました' })).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied)).toEqual([url])

    await page.evaluate(() => ((window as unknown as { __copyFails: boolean }).__copyFails = true))
    await page.getByRole('button', { name: '課題URLをコピー' }).click()
    await expect(page.getByRole('status').filter({ hasText: '自動でコピーできませんでした' })).toBeVisible()
    await expect(urlBox(page)).toHaveValue(url) // URL は表示されたまま（手でコピーできる）
  })

  test('作ったURLを開くと、セット課題が始まる', async ({ page }) => {
    await openApp(page, '#/coach')
    await setList(page).getByRole('button', { name: /ドライブ：DFの反応が3通り/ }).click()
    await page.getByRole('button', { name: '課題URLを作成' }).click()
    const url = await urlBox(page).inputValue()
    await page.goto(url)
    await expect(page.getByText('先生からの課題：セット「ドライブ：DFの反応が3通り」')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'まず、何を見る？' })).toBeVisible()
  })
})
