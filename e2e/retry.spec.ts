import type { Page } from '@playwright/test'
import { currentStage, expect, explanation, goHash, openApp, test } from './helpers.ts'

// GI-FOU-02-B（4ファウルで抜かれかけた）を、選ぶ選択肢の文を指定して解く
async function solveWith(page: Page, look: string, decision: string, reason: string) {
  for (const text of [look, decision, reason]) {
    await currentStage(page).getByRole('button', { name: text }).click()
    await page.getByRole('button', { name: '決定' }).click()
    await page.getByRole('button', { name: /^(次へ|解説を見る)/ }).click()
  }
  await expect(explanation(page)).toBeVisible()
}
const LOOK_KEY = '自分のファウル数'
const LOW = '横から手を出して、ボールをはたきにいく'
const PRIORITY = 'ヘルプの味方にまかせ、リバウンドの位置に入る'
const REASON_KEY = '4ファウルで、次のファウルは退場'
const retryList = (page: Page) => page.getByRole('list', { name: 'もう一度解いてみる問題の一覧' })

test.describe('MY IQ：もう一度解いてみる問題', () => {
  test('記録がない時は案内だけ。〈優先度が低い〉を選ぶと出て、解き直して〈優先〉を選ぶと外れる', async ({ page }) => {
    await openApp(page, '#/my-iq')
    await expect(page.getByText('まだ学習記録がありません')).toBeVisible()

    await goHash(page, '#/play/q/GI-FOU-02-B')
    await solveWith(page, LOOK_KEY, LOW, REASON_KEY)
    await goHash(page, '#/my-iq')
    await expect(page.getByRole('heading', { name: 'もう一度解いてみる問題（1）' })).toBeVisible()
    const item = retryList(page).getByRole('link')
    await expect(item).toHaveCount(1)
    await expect(item).toContainText('ファウル数②：4ファウルで抜かれかけた')
    await expect(item).toContainText('前回、判断で〈この状況では優先度が低い〉を選んでいた')
    await expect(item).not.toContainText('見る問い') // 見るは決め手を選んだので当たらない
    await expect(page.getByText('「間違い」という意味ではありません')).toBeVisible()
    await expect(page.getByRole('region', { name: /^もう一度解いてみる問題/ })).not.toContainText(/苦手|不正解|点数/)

    // 一覧から開いて解き直す
    await item.click()
    await expect(page).toHaveURL(/#\/play\/q\/GI-FOU-02-B$/)
    await solveWith(page, LOOK_KEY, PRIORITY, REASON_KEY)
    await goHash(page, '#/my-iq')
    await expect(page.getByRole('heading', { name: 'もう一度解いてみる問題（0）' })).toBeVisible()
    await expect(page.getByText('今は、当たる問題はありません。')).toBeVisible()
  })
})
