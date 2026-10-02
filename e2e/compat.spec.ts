import { expect, openApp, question, solveToExplanation, STORAGE_KEY, storedEnvelope, test } from './helpers.ts'

// STEP 6 の形のまま（source がない）の記録。実在する問題・選択肢のIDで作る
const OLD_ATTEMPT = {
  attemptId: 'att-step6-old-0001',
  completedAt: '2026-10-01T09:00:00.000Z',
  questionId: 'OF-DRV-01-B',
  setId: 'SET-DRIVE-HELP',
  questionIndex: 2,
  contentVersion: null,
  contentSchemaVersion: 2,
  questionUpdatedAt: '2026-10-01',
  category: 'OFFENSE',
  cues: ['CUE-HELP-FEET', 'CUE-WHO-HELPED'],
  look: { selectedChoiceId: 's1', value: 'key', cueId: 'CUE-HELP-FEET' },
  decision: { selectedChoiceId: 'B', fit: 'priority', hasCondition: false },
  reasons: { selectedReasonIds: ['r1'], items: [{ reasonId: 'r1', quality: 'key', supports: ['B'], supportsChosen: true }], diagnosis: 'READ_AND_REASONED' },
  reaction: null,
}

test.describe('後方互換（source のない STEP 6 の記録）', () => {
  test('古い記録を読み込んで MY IQ に表示し、新しく解いても古い記録は書き換えない（source を足さない・版を変えない）', async ({ page }) => {
    await openApp(page, '#/')
    const original = JSON.stringify({ schemaVersion: 1, attempts: [OLD_ATTEMPT] })
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [STORAGE_KEY, original])
    await page.reload()

    await page.evaluate(() => (window.location.hash = '#/my-iq'))
    const main = page.getByRole('main')
    await expect(main).toContainText(/回答した回数\s*1回/)
    await expect(main).toContainText(/解いたセット\s*1セット/)
    await expect(main).not.toContainText('読み込めませんでした')
    await expect(main).not.toContainText('集計に使えなかった')
    expect(await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)).toBe(original) // 開いただけでは変えない

    const q = question('OF-1V1-03-A')
    await page.evaluate((id) => (window.location.hash = `#/play/q/${id}`), q.id)
    await solveToExplanation(page, q.stages.length, 1)
    const env = (await storedEnvelope(page))!
    expect(env.schemaVersion).toBe(1)
    expect(env.attempts[0]).toEqual(OLD_ATTEMPT)
    expect(env.attempts[0]).not.toHaveProperty('source')
    expect(env.attempts[1].source).toEqual({ type: 'practice' })

    await page.evaluate(() => (window.location.hash = '#/my-iq'))
    await expect(main).toContainText(/回答した回数\s*2回/)
  })
})
