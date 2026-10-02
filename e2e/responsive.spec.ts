import { answerStage, expect, explanation, goHash, layoutProblems, openApp, question, solveToExplanation, test } from './helpers.ts'

const WIDTHS = [1440, 1024, 768, 390, 375]
const SCREENS = [
  '#/',
  '#/play',
  '#/map',
  '#/map/OF-DRV-01',
  '#/my-iq',
  '#/coach',
  '#/play/set/SET-DRIVE-HELP',
  '#/play/q/DF-OFB-03-A',
  '#/play/assignment/set/SET-DRIVE-HELP',
  '#/play/assignment/q/GI-CLK-02-B',
  '#/play/assignment/q/THIS-ID-DOES-NOT-EXIST',
]

test.describe('レスポンシブ：横スクロールなし・操作部品は高さ44px以上', () => {
  for (const width of WIDTHS)
    test(`${width}px：主な画面`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await openApp(page, SCREENS[0])
      for (const hash of SCREENS) {
        await goHash(page, hash)
        await expect(page.getByRole('main')).not.toBeEmpty()
        expect(await layoutProblems(page), `${width}px ${hash}`).toEqual([])
      }
    })

  test('375px：COACH の絞り込み・一覧・選択・URL表示', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 })
    await openApp(page, '#/coach')
    expect(await layoutProblems(page), '開いた時').toEqual([])
    await page.getByRole('group', { name: 'カテゴリー' }).getByRole('button', { name: 'ADVANTAGE', exact: true }).click()
    await page.getByRole('group', { name: '学年' }).getByRole('button', { name: '2年', exact: true }).click()
    expect(await layoutProblems(page), '絞り込み後').toEqual([])
    await page.getByRole('list', { name: 'セットの一覧' }).getByRole('button').first().click()
    expect(await layoutProblems(page), '選択後').toEqual([])
    await page.getByRole('button', { name: '課題URLを作成' }).click()
    await expect(page.getByRole('textbox', { name: /課題URL/ })).toBeVisible()
    expect(await layoutProblems(page), 'URL表示後').toEqual([])
    await page.getByRole('searchbox', { name: 'キーワード' }).fill('存在しないことば')
    expect(await layoutProblems(page), '該当なし').toEqual([])
  })

  test('375px：課題の問題を解く途中・解説・エラー画面', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 })
    const q = question('AD-2V1-01-A') // 「次の判断」がある問題
    await openApp(page, `#/play/assignment/q/${q.id}`)
    expect(await layoutProblems(page), '開いた時').toEqual([])
    await answerStage(page)
    expect(await layoutProblems(page), '見るに答えた後').toEqual([])
    await page.getByRole('button', { name: /^次へ/ }).click()
    await solveToExplanation(page, q.stages.length - 1, 0)
    await expect(explanation(page)).toBeVisible()
    expect(await layoutProblems(page), '解説').toEqual([])
    await goHash(page, '#/my-iq')
    await expect(page.getByRole('main')).toContainText(/回答した回数\s*1回/)
    expect(await layoutProblems(page), '記録のある MY IQ').toEqual([])
    await goHash(page, `#/play/assignment/set/${'X'.repeat(300)}`)
    await expect(page.getByRole('alert')).toBeVisible()
    expect(await layoutProblems(page), '長いIDのエラー画面').toEqual([])
  })
})
