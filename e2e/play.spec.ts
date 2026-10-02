import { answerStage, currentStage, expect, explanation, goHash, openApp, question, SETS, set, solveToExplanation, storedAttempts, test, QUESTIONS } from './helpers.ts'

const SINGLE = 'OF-1V1-03-A' // セットに入っていない問題（データの set_id が null）

test.describe('通常の PLAY', () => {
  test('A-1：PLAY の一覧から問題を開始でき、問題文が表示される', async ({ page }) => {
    await openApp(page, '#/play')
    await expect(page.getByRole('heading', { name: `問題セット（${SETS.length}）` })).toBeVisible()
    const singles = QUESTIONS.filter((q) => !q.set_id)
    await expect(page.getByRole('heading', { name: `単独の問題（${singles.length}）` })).toBeVisible()
    for (const s of SETS) await expect(page.getByText(s.title, { exact: true })).toBeVisible()

    await page.getByRole('link', { name: new RegExp(question(SINGLE).title) }).click()
    await expect(page.getByRole('heading', { name: question(SINGLE).title, level: 1 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'まず、何を見る？' })).toBeVisible()
    await expect(page.getByText(question(SINGLE).stages[0].prompt)).toBeVisible()
    await expect(currentStage(page).getByRole('button')).toHaveCount(question(SINGLE).stages[0].options.length)
  })

  test('A-2：開いただけ・回答の途中・途中で離れた時は保存しない。解説に入った時に1件だけ保存', async ({ page }) => {
    const q = question(SINGLE)
    await openApp(page, `#/play/q/${q.id}`)
    expect(await storedAttempts(page)).toHaveLength(0) // 開いただけ

    await answerStage(page, 0) // 見るに答えた
    await goHash(page, '#/play') // 途中で離れる
    expect(await storedAttempts(page)).toHaveLength(0)

    await goHash(page, `#/play/q/${q.id}`)
    await solveToExplanation(page, q.stages.length, 0) // 各段階で 0 件、解説で 1 件
    await expect(page.getByText('この回答を学習記録に保存しました')).toBeVisible()
    const [a] = await storedAttempts(page)
    expect(a).toMatchObject({ questionId: q.id, setId: null, questionIndex: null, source: { type: 'practice' } })
  })

  test('二重保存の防止：解説 → 戻る → もう一度解説 でも1件。開き直して解き直すと別の記録', async ({ page }) => {
    const q = question(SINGLE)
    await openApp(page, `#/play/q/${q.id}`)
    await solveToExplanation(page, q.stages.length, 0)

    for (let i = 0; i < 2; i++) {
      await page.getByRole('button', { name: '‹ 戻る' }).click()
      await expect(currentStage(page)).toBeVisible()
      await page.getByRole('button', { name: /^解説を見る/ }).click()
      await expect(explanation(page)).toBeVisible()
    }
    expect(await storedAttempts(page)).toHaveLength(1)

    // 一覧に戻って開き直す＝新しく解き直す
    await goHash(page, '#/play')
    await page.getByRole('link', { name: new RegExp(q.title) }).click()
    await expect(page.getByRole('heading', { name: 'まず、何を見る？' })).toBeVisible()
    await solveToExplanation(page, q.stages.length, 1)
    const list = await storedAttempts(page)
    expect(list).toHaveLength(2)
    expect(list[0].attemptId).not.toBe(list[1].attemptId)
    expect(list.map((a) => a.questionId)).toEqual([q.id, q.id])
  })

  test('セット：問題ごとに解説で1件ずつ保存。「次の問題」へ進むだけでは増えない。最後は振り返り', async ({ page }) => {
    const s = set('SET-DRIVE-HELP')
    await openApp(page, '#/play')
    await page.getByRole('listitem').filter({ hasText: s.title }).getByRole('link', { name: 'START' }).click()
    await expect(page.getByRole('heading', { name: new RegExp(s.title), level: 1 })).toBeVisible()

    for (let i = 0; i < s.items.length; i++) {
      const q = question(s.items[i]) // このセットは出題順が fixed（データの順）
      await expect(page.getByRole('heading', { name: `問題${i + 1}／${s.items.length}　${q.title}` })).toBeVisible()
      await solveToExplanation(page, q.stages.length, i)
      const last = i === s.items.length - 1
      await page.getByRole('link', { name: last ? '振り返りへ ›' : '次の問題 ›' }).click()
      expect(await storedAttempts(page), '次へ進んだだけでは増えない').toHaveLength(i + 1)
    }
    await expect(page.getByRole('heading', { name: s.title, level: 2 })).toBeVisible()
    await expect(page.getByText(`${s.items.length}問中 ${s.items.length}問 終了`)).toBeVisible()
    const list = await storedAttempts(page)
    expect(list.map((a) => [a.questionId, a.setId, a.questionIndex])).toEqual(s.items.map((id, i) => [id, s.id, i + 1]))
  })

  test('MY IQ：解いた後に、回答回数・問題数・セット数が更新される', async ({ page }) => {
    await openApp(page, '#/my-iq')
    await expect(page.getByText('まだ学習記録がありません')).toBeVisible()

    const s = set('SET-2V1')
    await goHash(page, `#/play/set/${s.id}`)
    // このセットは出題順が shuffle（セットIDから決まる順）なので、表示されている問題を順に解く
    for (let i = 0; i < s.items.length; i++) {
      const title = await page.getByRole('heading', { name: new RegExp(`^問題${i + 1}／${s.items.length}`) }).textContent()
      const q = QUESTIONS.find((x) => title!.endsWith(x.title))!
      await solveToExplanation(page, q.stages.length, i)
      if (i < s.items.length - 1) await page.getByRole('link', { name: '次の問題 ›' }).click()
    }
    await goHash(page, `#/play/q/${SINGLE}`)
    await solveToExplanation(page, question(SINGLE).stages.length, s.items.length)

    await goHash(page, '#/my-iq')
    const main = page.getByRole('main')
    await expect(main).toContainText(/回答した回数\s*3回/)
    await expect(main).toContainText(/解いた問題\s*3問/)
    await expect(main).toContainText(/解いたセット\s*1セット/)
    await expect(main.getByText(s.title).first()).toBeVisible() // セット別
  })
})
