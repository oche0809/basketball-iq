import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, goHash, layoutProblems, openApp, QUESTIONS, STORAGE_KEY, test } from './helpers.ts'
import { REVIEW_STORAGE_KEY } from '../src/storage/reviewStore.ts'
import type { CurriculumItem } from '../src/types/content.ts'

const CURRICULUM = (JSON.parse(readFileSync(join(import.meta.dirname, '..', 'data', 'curriculum.json'), 'utf8')) as { items: CurriculumItem[] }).items

const list = (page: Page, name: '問題の一覧' | 'カリキュラムの一覧') => page.getByRole('list', { name })
async function shownIds(page: Page, name: '問題の一覧' | 'カリキュラムの一覧') {
  if (!(await list(page, name).isVisible())) return []
  // 各リンクの先頭に ID が表示されている。実データの ID と照らして取り出す（長い ID を優先）
  const known = (name === '問題の一覧' ? QUESTIONS.map((q) => q.id) : CURRICULUM.map((i) => i.id)).sort((x, y) => y.length - x.length)
  return (await list(page, name).getByRole('link').allTextContents()).map((t) => known.find((id) => t.startsWith(id)) ?? `?${t}`)
}
const reviewButton = (page: Page, label: string) => page.getByRole('group', { name: 'レビュー結果' }).getByRole('button', { name: new RegExp(`^(✓ )?${label}$`) })
const storedReviews = (page: Page) =>
  page.evaluate((k) => {
    const raw = localStorage.getItem(k)
    return raw ? (JSON.parse(raw).records as { itemType: string; itemId: string; status: string; note: string }[]) : []
  }, REVIEW_STORAGE_KEY)

test.describe('教材レビュー（先生用）', () => {
  test('COACH から教材レビューへ移動。問題17件・カリキュラム76件が表示される', async ({ page }) => {
    await openApp(page, '#/coach')
    await page.getByRole('link', { name: /教材レビュー/ }).click()
    await expect(page).toHaveURL(/#\/coach\/review$/)
    await expect(page.getByRole('heading', { name: /教材レビュー/, level: 1 })).toBeVisible()
    await expect(page.getByRole('button', { name: `問題 ${QUESTIONS.length}` })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText(`問題：0 / ${QUESTIONS.length} 確認済み`)).toBeVisible()
    expect(await shownIds(page, '問題の一覧')).toEqual(QUESTIONS.map((q) => q.id))

    await page.getByRole('button', { name: `カリキュラム ${CURRICULUM.length}` }).click()
    await expect(page.getByText(`カリキュラム：0 / ${CURRICULUM.length} 確認済み`)).toBeVisible()
    await expect(list(page, 'カリキュラムの一覧').getByRole('link')).toHaveCount(CURRICULUM.length)
    expect(await shownIds(page, 'カリキュラムの一覧')).toEqual(CURRICULUM.map((i) => i.id))
    // 生徒の下部タブ・上部ナビに「教材レビュー」は増えていない
    await expect(page.getByRole('navigation', { name: 'メインメニュー' }).getByRole('link', { name: /レビュー/ })).toHaveCount(0)
  })

  test('問題を開ける：基本情報・状況とコート図・各段階・生徒が見る解説・根拠・関連練習', async ({ page }) => {
    const q = QUESTIONS.find((x) => x.id === 'DF-OFB-03-A')!
    await openApp(page, '#/coach/review')
    await list(page, '問題の一覧').getByRole('link', { name: new RegExp(q.id) }).click()
    await expect(page.getByRole('heading', { name: q.title, level: 1 })).toBeVisible()
    await expect(page.getByText('未確認', { exact: false }).first()).toBeVisible()
    await expect(page.getByRole('img', { name: /ハーフコート図/ })).toBeVisible()
    await expect(page.getByText(q.situation).first()).toBeVisible()
    for (const s of q.stages) {
      await expect(page.getByText(s.prompt, { exact: true })).toBeVisible()
      for (const o of s.options) await expect(page.getByText(o.text, { exact: true }).first()).toBeVisible()
    }
    await expect(page.locator('#explain-title')).toHaveText(q.debrief.decision_rule) // PLAY と同じ解説
    await expect(page.getByRole('region', { name: '根拠・出典' })).toContainText('【JBAルール】')
    await expect(page.getByRole('region', { name: '根拠・出典' })).toContainText('【この教材で扱う判断原則】')
    await expect(page.getByText('あなたの回答')).toHaveCount(0) // 先生のレビューでは回答欄を出さない
    for (const d of q.related_drills) await expect(page.getByText(d, { exact: true })).toBeVisible()
  })

  test('カリキュラムを開ける：学習目標・見る問い・判断の問い・この項目の問題・根拠', async ({ page }) => {
    const item = CURRICULUM.find((i) => i.id === 'DF-PNR-02')!
    await openApp(page, '#/coach/review?tab=curriculum')
    await list(page, 'カリキュラムの一覧').getByRole('link', { name: new RegExp(item.id) }).click()
    await expect(page.getByRole('heading', { name: item.title, level: 1 })).toBeVisible()
    await expect(page.getByText(item.learning_goal)).toBeVisible()
    await expect(page.getByText(item.sample_questions.recognition)).toBeVisible()
    await expect(page.getByText(item.sample_questions.decision)).toBeVisible()
    await expect(page.getByText('【JBAルールに書かれていないこと】')).toBeVisible()
    for (const t of item.related_tactics) await expect(page.getByText(t, { exact: true })).toBeVisible()
  })

  test('レビュー状態とメモを保存し、再読み込みしても残る。一覧と進み具合にも反映', async ({ page }) => {
    await openApp(page, '#/coach/review/question/AD-2V1-01-A')
    await reviewButton(page, '修正').click()
    await expect(page.getByRole('status').filter({ hasText: 'レビュー結果を「修正」にしました。' })).toBeVisible()
    await expect(reviewButton(page, '修正')).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('textbox', { name: '先生用メモ' }).fill('選択肢Bの条件を要確認')
    await expect(page.getByText('メモに保存していない変更があります。')).toBeVisible()
    await page.getByRole('button', { name: 'メモを保存' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'メモを保存しました。' })).toBeVisible()

    await page.reload()
    await expect(reviewButton(page, '修正')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('textbox', { name: '先生用メモ' })).toHaveValue('選択肢Bの条件を要確認')
    expect(await storedReviews(page)).toEqual([expect.objectContaining({ itemType: 'question', itemId: 'AD-2V1-01-A', status: 'revise', note: '選択肢Bの条件を要確認' })])

    await page.getByRole('link', { name: '一覧に戻る' }).first().click()
    await expect(page.getByText(`問題：1 / ${QUESTIONS.length} 確認済み`)).toBeVisible()
    await expect(list(page, '問題の一覧').getByRole('link', { name: /AD-2V1-01-A/ })).toContainText('レビュー：修正')
  })

  test('絞り込み：カテゴリー・難易度・学年・レビュー状態が AND で効く。表示された教材が条件を満たす', async ({ page }) => {
    await openApp(page, '#/coach/review/question/OF-DRV-01-A')
    await reviewButton(page, '採用').click()
    await expect(reviewButton(page, '採用')).toHaveAttribute('aria-pressed', 'true')
    await goHash(page, '#/coach/review')
    const group = (n: string) => page.getByRole('group', { name: n })
    await group('カテゴリー').getByRole('button', { name: 'OFFENSE', exact: true }).click()
    await expect.poll(() => shownIds(page, '問題の一覧')).toEqual(QUESTIONS.filter((q) => q.category === 'OFFENSE').map((q) => q.id))
    await group('難易度').getByRole('button', { name: '初級', exact: true }).click()
    await group('学年').getByRole('button', { name: '1年', exact: true }).click()
    const expected = QUESTIONS.filter((q) => q.category === 'OFFENSE' && q.difficulty === 'BEGINNER' && q.grade.includes(1)).map((q) => q.id)
    await expect.poll(() => shownIds(page, '問題の一覧')).toEqual(expected)
    await group('レビュー状態').getByRole('button', { name: '採用', exact: true }).click()
    await expect.poll(() => shownIds(page, '問題の一覧')).toEqual(['OF-DRV-01-A'])
    await group('レビュー状態').getByRole('button', { name: '保留', exact: true }).click()
    await expect(page.getByText('条件に合う教材はありません。')).toBeVisible()
    // 条件は URL に残る（再読み込みしても同じ一覧）
    await page.reload()
    await expect(group('レビュー状態').getByRole('button', { name: '保留', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(group('カテゴリー').getByRole('button', { name: 'OFFENSE', exact: true })).toHaveAttribute('aria-pressed', 'true')
  })

  test('未確認のみ：レビュー済みは一覧から外れ、詳細で採用にしても「次の教材」で次の未確認へ進める', async ({ page }) => {
    await openApp(page, '#/coach/review')
    await page.getByRole('button', { name: '未確認のみ表示' }).click()
    await expect(page.getByText(`未確認 ${QUESTIONS.length} / ${QUESTIONS.length}`)).toBeVisible()
    await list(page, '問題の一覧').getByRole('link', { name: new RegExp(QUESTIONS[0].id) }).click()
    await reviewButton(page, '採用').click()
    await expect(page.getByRole('status').filter({ hasText: '今の絞り込みの一覧からは外れました' })).toBeVisible()
    await page.getByRole('link', { name: '次の教材 →' }).click()
    await expect(page.getByRole('heading', { name: QUESTIONS[1].title, level: 1 })).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`#/coach/review/question/${QUESTIONS[1].id}\\?status=unreviewed$`))
    await page.getByRole('link', { name: '一覧に戻る' }).first().click()
    await expect.poll(() => shownIds(page, '問題の一覧')).toEqual(QUESTIONS.slice(1).map((q) => q.id))
    await expect(page.getByText(`未確認 ${QUESTIONS.length - 1} / ${QUESTIONS.length}`)).toBeVisible()
  })

  test('レビュー記録をすべて削除：レビューだけが消え、学習記録は消えない', async ({ page }) => {
    await openApp(page, '#/coach/review/question/GI-CLK-02-A')
    const attempts = '{"schemaVersion":1,"attempts":[{"keep":"me"}]}'
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [STORAGE_KEY, attempts])
    await reviewButton(page, '保留').click()
    await expect(reviewButton(page, '保留')).toHaveAttribute('aria-pressed', 'true')
    await goHash(page, '#/coach/review')
    await page.getByRole('button', { name: 'レビュー記録をすべて削除' }).click()
    await expect(page.getByRole('alertdialog')).toContainText('元に戻せません')
    await page.getByRole('button', { name: 'やめる' }).click()
    expect(await storedReviews(page)).toHaveLength(1)
    await page.getByRole('button', { name: 'レビュー記録をすべて削除' }).click()
    await page.getByRole('button', { name: '削除する' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'レビュー記録をすべて削除しました' })).toBeVisible()
    expect(await page.evaluate((k) => localStorage.getItem(k), REVIEW_STORAGE_KEY)).toBeNull()
    expect(await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)).toBe(attempts)
    await expect(page.getByText(`問題：0 / ${QUESTIONS.length} 確認済み`)).toBeVisible()
  })

  for (const hash of ['#/coach/review/question/THIS-ID-DOES-NOT-EXIST', '#/coach/review/curriculum/THIS-ID-DOES-NOT-EXIST', '#/coach/review/zzz/OF-DRV-01-A', '#/coach/review/question/%E0%A4%A'])
    test(`存在しないID：${hash}`, async ({ page }) => {
      await openApp(page, hash)
      await expect(page.getByRole('alert')).toContainText('指定された教材が見つかりません。')
      await expect(page.getByRole('alert')).toContainText('指定されたID：')
      await expect(page.getByRole('group', { name: 'レビュー結果' })).toHaveCount(0) // 別の教材を出さない
    })

  test('XSS：メモ・検索の文字列は文字として表示され、実行されない', async ({ page }) => {
    let dialog = false
    page.on('dialog', (d) => ((dialog = true), d.dismiss()))
    const xss = '<script>alert(1)</script><img src=x onerror="alert(2)">'
    await openApp(page, '#/coach/review/question/OF-DRV-01-B')
    await page.getByRole('textbox', { name: '先生用メモ' }).fill(xss)
    await page.getByRole('button', { name: 'メモを保存' }).click()
    await page.reload()
    await expect(page.getByRole('textbox', { name: '先生用メモ' })).toHaveValue(xss)
    await goHash(page, '#/coach/review')
    await page.getByRole('searchbox', { name: 'キーワード' }).fill(xss)
    await expect(page.getByText('条件に合う教材はありません。')).toBeVisible()
    await page.reload()
    await expect(page.getByRole('searchbox', { name: 'キーワード' })).toHaveValue(xss)
    expect(await page.locator('img[src="x"]').count()).toBe(0)
    expect(await page.evaluate(() => document.querySelectorAll('main script').length)).toBe(0)
    expect(dialog).toBe(false)
  })

  test('生徒の画面は変わらない：レビューで「保留」にしても PLAY・MAP にそのまま出る', async ({ page }) => {
    await openApp(page, '#/coach/review/question/DF-CLO-01-A')
    await reviewButton(page, '保留').click()
    await expect(reviewButton(page, '保留')).toHaveAttribute('aria-pressed', 'true')
    await goHash(page, '#/play')
    await expect(page.getByRole('link', { name: new RegExp(QUESTIONS.find((q) => q.id === 'DF-CLO-01-A')!.title) })).toBeVisible()
    await goHash(page, '#/map/DF-CLO-01')
    await expect(page.getByText('レビュー')).toHaveCount(0)
  })

  for (const width of [1440, 1024, 768, 390, 375])
    test(`${width}px：一覧・問題・カリキュラムの詳細で横スクロールなし・44px以上`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await openApp(page, '#/coach/review')
      expect(await layoutProblems(page), '問題の一覧').toEqual([])
      for (const h of ['#/coach/review?tab=curriculum', '#/coach/review/question/AD-3V2-01-A', '#/coach/review/curriculum/GI-CLK-02', '#/coach/review/question/NOPE']) {
        await goHash(page, h)
        await expect(page.getByRole('main')).not.toBeEmpty()
        expect(await layoutProblems(page), `${width}px ${h}`).toEqual([])
      }
    })
})
