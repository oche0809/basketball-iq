import type { Page } from '@playwright/test'
import { expect, explanation, openApp, question, solveToExplanation, test } from './helpers.ts'

const RULE = '4ファウルの時は、ブロックに跳ばない。ヘルプにまかせて、リバウンドへ。'
const teamBox = (page: Page) => page.getByRole('region', { name: '先生が決めたチームの約束', exact: true })
const urlBox = (page: Page) => page.getByRole('region', { name: '課題URL' }).locator('input[readonly]')

// 先生が教材レビューの問題ページで約束を書いて保存する
async function saveRule(page: Page, id: string, text: string) {
  await openApp(page, `#/coach/review/question/${id}`)
  await page.getByRole('textbox', { name: /^チームの約束（/ }).fill(text)
  await page.getByRole('button', { name: '約束を保存' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'チームの約束を保存しました。' })).toBeVisible()
}

test.describe('チームの約束（先生が書き、課題URLで生徒に届ける）', () => {
  test('先生が保存すると、レビュー画面の「生徒が見る解説」に出る。消すと「まだ登録されていません」に戻る', async ({ page }) => {
    await saveRule(page, 'GI-FOU-02-B', RULE)
    await expect(page.getByText('この問題で、チームが決める点')).toBeVisible()
    await expect(teamBox(page)).toContainText(RULE)
    await expect(teamBox(page)).toContainText('JBAルールや一般的な判断原則とは別のもの')

    await page.reload()
    await expect(page.getByRole('textbox', { name: /^チームの約束（/ })).toHaveValue(RULE) // 再読み込みしても残る
    await page.getByRole('button', { name: '約束を消す' }).click()
    await expect(teamBox(page)).toHaveCount(0)
    await expect(page.getByText('チームの約束はまだ登録されていません。')).toBeVisible()
  })

  test('COACH で約束入りの課題URLを作り、別の端末で開くと解説に約束が出る（セットの次の問題でも消えない）', async ({ page, browser }) => {
    await saveRule(page, 'GI-FOU-02-B', RULE)
    await page.goto('./#/coach')
    await page.getByRole('list', { name: 'セットの一覧' }).getByRole('button', { name: /自分のファウル数だけが違う/ }).click()
    const include = page.getByRole('checkbox', { name: 'チームの約束（1問分）もURLに入れる' })
    await expect(include).toBeChecked()
    await page.getByRole('button', { name: '課題URLを作成' }).click()
    const url = await urlBox(page).inputValue()
    expect(url).toMatch(/#\/play\/assignment\/set\/SET-FOULS\?team=[A-Za-z0-9_-]+$/)
    expect(url).not.toContain(encodeURIComponent('ファウル')) // 文はそのまま見える形では入らない

    // 生徒の端末：まっさら（先生の約束は保存されていない）
    const student = await (await browser.newContext()).newPage()
    await student.goto(url)
    await expect(student.getByText('先生からの課題：セット「抜かれかけた：同じ場面で、自分のファウル数だけが違う」')).toBeVisible()
    // 1問目（約束なし）
    await solveToExplanation(student, question('GI-FOU-02-A').stages.length, 0)
    await expect(student.getByText('チームの約束はまだ登録されていません。')).toBeVisible()
    // 2問目へ進んでも、URL に約束が残る
    await student.getByRole('link', { name: '次の問題 ›' }).click()
    await expect(student).toHaveURL(/\?q=GI-FOU-02-B&team=/)
    await solveToExplanation(student, question('GI-FOU-02-B').stages.length, 1)
    await expect(explanation(student)).toBeVisible()
    await expect(teamBox(student)).toContainText(RULE)
    // 生徒の端末には約束を保存しない
    expect(await student.evaluate(() => localStorage.getItem('basketball-iq:team-rules'))).toBeNull()
    await student.context().close()
  })

  test('「URLに入れる」を外すと、今までどおり ID だけの課題URLになる', async ({ page }) => {
    await saveRule(page, 'GI-FOU-02-B', RULE)
    await page.goto('./#/coach')
    await page.getByRole('list', { name: '問題の一覧' }).getByRole('button', { name: /GI-FOU-02-B/ }).click()
    await page.getByRole('button', { name: '課題URLを作成' }).click()
    expect(await urlBox(page).inputValue()).toContain('?team=')
    await page.getByRole('checkbox', { name: /もURLに入れる/ }).uncheck()
    await expect(urlBox(page)).toHaveCount(0) // 作り直しになる
    await page.getByRole('button', { name: '課題URLを作成' }).click()
    expect(new URL(await urlBox(page).inputValue()).hash).toBe('#/play/assignment/q/GI-FOU-02-B')
  })

  test('約束がない教材では、チェックボックスは出ない', async ({ page }) => {
    await openApp(page, '#/coach')
    await page.getByRole('list', { name: '問題の一覧' }).getByRole('button', { name: /GI-FOU-02-B/ }).click()
    await expect(page.getByRole('checkbox', { name: /もURLに入れる/ })).toHaveCount(0)
  })

  test('HTML のような文字も、文字のまま表示される（実行されない）。壊れた team は無視して課題は解ける', async ({ page }) => {
    const text = '<img src=x onerror="document.title=\'XSS\'"><b>太字</b>'
    await saveRule(page, 'GI-FOU-02-B', text)
    await expect(teamBox(page)).toContainText(text)
    await expect(teamBox(page).locator('img, b')).toHaveCount(0)
    expect(await page.title()).not.toBe('XSS')

    await page.goto('./#/play/assignment/q/GI-FOU-02-A?team=%22%3E%3Cscript%3E')
    await solveToExplanation(page, question('GI-FOU-02-A').stages.length, 0)
    await expect(page.getByText('チームの約束はまだ登録されていません。')).toBeVisible()
  })

  test('相手ごとの約束：相手を足して約束を書き、COACH で選ぶとその約束が URL に入る（相手の名前は入らない）。消すといつもの約束に戻る', async ({ page }) => {
    const PROFILE_RULE = '背の高い相手には、ブロックに跳ばずボックスアウト。'
    const teamOf = (url: string) => JSON.parse(Buffer.from(new URL(url.replace('#/', '')).searchParams.get('team')!, 'base64url').toString('utf8'))
    await saveRule(page, 'GI-FOU-02-B', RULE)
    await page.getByText('相手ごとの約束を足す・消す').click()
    await page.getByRole('textbox', { name: /^相手の特徴/ }).fill('背の高いチーム')
    await page.getByRole('button', { name: '相手を足す' }).click()
    await expect(page.getByRole('status').filter({ hasText: '「背の高いチーム」を足しました。' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'どの約束を書く？' })).toHaveValue(/^p-/)
    await expect(page.getByText('この相手の約束がない時は、いつもの約束を使います。')).toBeVisible()
    await expect(teamBox(page)).toContainText(RULE) // まだ相手の約束がないので、いつもの約束
    await page.getByRole('textbox', { name: /^チームの約束（/ }).fill(PROFILE_RULE)
    await page.getByRole('button', { name: '約束を保存' }).click()
    await expect(teamBox(page)).toContainText(PROFILE_RULE)

    await page.goto('./#/coach')
    await page.getByRole('list', { name: 'セットの一覧' }).getByRole('button', { name: /自分のファウル数だけが違う/ }).click()
    await page.getByRole('combobox', { name: '入れる約束' }).selectOption({ label: '相手ごと：背の高いチーム' })
    await page.getByRole('button', { name: '課題URLを作成' }).click()
    const url = await urlBox(page).inputValue()
    expect(teamOf(url)).toEqual({ v: 1, r: { 'GI-FOU-02-B': PROFILE_RULE } })
    expect(JSON.stringify(teamOf(url))).not.toContain('背の高いチーム')
    await page.getByRole('combobox', { name: '入れる約束' }).selectOption({ label: 'いつもの約束' })
    await page.getByRole('button', { name: '課題URLを作成' }).click()
    expect(teamOf(await urlBox(page).inputValue())).toEqual({ v: 1, r: { 'GI-FOU-02-B': RULE } })

    // 相手を消すと、その相手の約束も消え、いつもの約束に戻る
    await page.goto('./#/coach/review/question/GI-FOU-02-B')
    await page.getByRole('combobox', { name: 'どの約束を書く？' }).selectOption({ label: '相手ごと：背の高いチーム' })
    await page.getByText('相手ごとの約束を足す・消す').click()
    await page.getByRole('button', { name: /「背の高いチーム」を消す/ }).click()
    await page.getByRole('button', { name: '本当に消す' }).click()
    await expect(page.getByRole('combobox', { name: 'どの約束を書く？' })).toHaveValue('')
    await expect(page.getByRole('option', { name: '相手ごと：背の高いチーム' })).toHaveCount(0)
    await expect(teamBox(page)).toContainText(RULE)
  })
})
