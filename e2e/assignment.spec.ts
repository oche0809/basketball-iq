import { answerStage, currentStage, expect, goHash, openApp, question, set, solveToExplanation, storedAttempts, test, QUESTIONS } from './helpers.ts'

test.describe('課題URL', () => {
  test('セット課題：開いただけでは保存しない。問題ごとに解説で1件ずつ保存し、source は課題・セット・セットID', async ({ page }) => {
    const s = set('SET-DRIVE-HELP')
    await openApp(page, `#/play/assignment/set/${s.id}`)
    await expect(page.getByText(`先生からの課題：セット「${s.title}」`)).toBeVisible()
    expect(await storedAttempts(page)).toHaveLength(0)

    for (let i = 0; i < s.items.length; i++) {
      const q = question(s.items[i])
      await expect(page.getByRole('heading', { name: `問題${i + 1}／${s.items.length}　${q.title}` })).toBeVisible()
      await solveToExplanation(page, q.stages.length, i) // 通常の PLAY と同じ問題の流れ（見る→判断→なぜ→解説）
      await expect(page).toHaveURL(new RegExp(`#/play/assignment/set/${s.id}`)) // 課題のまま進む
      await page.getByRole('link', { name: i === s.items.length - 1 ? '振り返りへ ›' : '次の問題 ›' }).click()
      expect(await storedAttempts(page)).toHaveLength(i + 1)
    }
    await expect(page.getByText(`${s.items.length}問中 ${s.items.length}問 終了`)).toBeVisible()
    const list = await storedAttempts(page)
    expect(list.map((a) => a.source)).toEqual(s.items.map(() => ({ type: 'assignment', assignmentType: 'set', assignmentId: s.id })))
    expect(list.map((a) => [a.questionId, a.setId, a.questionIndex])).toEqual(s.items.map((id, i) => [id, s.id, i + 1]))
  })

  test('単独課題：該当の問題が出る。途中で離れたら保存しない。解説で1件、source は課題・問題・問題ID', async ({ page }) => {
    const q = question('OF-DRV-01-B') // セットの中の問題も、1問だけの課題にできる
    await openApp(page, `#/play/assignment/q/${q.id}`)
    await expect(page.getByText(`先生からの課題：問題「${q.title}」`)).toBeVisible()
    await expect(page.getByRole('heading', { name: q.title, level: 1 })).toBeVisible()
    await answerStage(page, 0) // 見るに答える
    await page.getByRole('button', { name: /^次へ/ }).click()
    await answerStage(page, 0) // 判断にも答える（まだ途中）
    await goHash(page, '#/') // 課題ページを開いたまま、途中で離れる
    expect(await storedAttempts(page)).toHaveLength(0)

    await goHash(page, `#/play/assignment/q/${q.id}`)
    await solveToExplanation(page, q.stages.length, 0)
    await expect(page.getByRole('link', { name: '課題はここまで。PLAY へ' })).toBeVisible()
    const [a] = await storedAttempts(page)
    expect(a.source).toEqual({ type: 'assignment', assignmentType: 'question', assignmentId: q.id })
    expect(a).toMatchObject({ questionId: q.id, setId: null, questionIndex: null })
  })

  test('課題の記録も MY IQ の集計に入る（課題だけ除いたり、別に数えたりしない）', async ({ page }) => {
    const single = question('OF-1V1-03-A')
    await openApp(page, `#/play/q/${single.id}`) // 通常の PLAY
    await solveToExplanation(page, single.stages.length, 0)
    await goHash(page, '#/play/assignment/q/GI-CLK-02-A') // 課題
    await solveToExplanation(page, question('GI-CLK-02-A').stages.length, 1)
    expect((await storedAttempts(page)).map((a) => (a.source as { type: string }).type)).toEqual(['practice', 'assignment'])

    await goHash(page, '#/my-iq')
    const main = page.getByRole('main')
    await expect(main).toContainText(/回答した回数\s*2回/)
    await expect(main).toContainText(/解いた問題\s*2問/)
    await expect(main.getByText(question('GI-CLK-02-A').title)).toBeVisible() // 最近の回答に課題の問題も出る
    await expect(main).not.toContainText('assignment')
  })

  const NOT_FOUND = [
    { hash: '#/play/assignment/q/THIS-ID-DOES-NOT-EXIST', what: 'この問題は見つかりませんでした。', id: 'THIS-ID-DOES-NOT-EXIST' },
    { hash: '#/play/assignment/set/THIS-ID-DOES-NOT-EXIST', what: 'このセットは見つかりませんでした。', id: 'THIS-ID-DOES-NOT-EXIST' },
    { hash: '#/play/assignment/xyz/OF-DRV-01-B', what: 'この課題は見つかりませんでした。', id: 'xyz/OF-DRV-01-B' },
    { hash: '#/play/assignment', what: 'この課題は見つかりませんでした。', id: '（指定なし）' },
  ]
  for (const c of NOT_FOUND)
    test(`存在しないID：${c.hash}`, async ({ page }) => {
      await openApp(page, c.hash)
      const alert = page.getByRole('alert')
      await expect(alert).toContainText(c.what)
      await expect(alert).toContainText(`指定されたID：${c.id}`)
      await expect(alert).toContainText('課題のURLが正しいか、先生に確認してください。')
      // 今日の問題やほかの教材に置き換えていない
      await expect(currentStage(page)).toHaveCount(0)
      await expect(page.getByRole('main')).not.toContainText('今日の問題')
      await expect(page.getByRole('main')).not.toContainText('undefined')
      expect(await storedAttempts(page)).toHaveLength(0)
    })

  const BROKEN = [
    { name: '記号', id: `!@$^*()_+=[]{};:'",.<>~` },
    { name: 'HTML のような文字', id: '<img src=x onerror=alert(1)>' },
    { name: '長い文字列', id: 'A'.repeat(600) },
    { name: '壊れたURLエンコード', raw: '%E0%A4%A' },
    { name: '日本語（エンコード済み）', raw: encodeURIComponent('存在しない問題') },
  ] as { name: string; id?: string; raw?: string }[]
  for (const c of BROKEN)
    test(`壊れたID（${c.name}）でも落ちずにエラー画面になる`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 740 })
      let dialog = false
      page.on('dialog', (d) => ((dialog = true), d.dismiss()))
      for (const kind of ['q', 'set']) {
        await openApp(page, `#/play/assignment/${kind}/${c.raw ?? encodeURIComponent(c.id!)}`)
        await expect(page.getByRole('alert')).toContainText(kind === 'q' ? 'この問題は見つかりませんでした。' : 'このセットは見つかりませんでした。')
        await expect(page.getByRole('alert')).toContainText('指定されたID：')
        if (c.id) await expect(page.getByRole('alert')).toContainText(c.id.slice(0, 40))
        expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), '横スクロール').toBe(false)
      }
      expect(dialog, '文字列がスクリプトとして動いていない').toBe(false)
      expect(QUESTIONS.some((q) => q.id === c.id)).toBe(false)
    })
})
