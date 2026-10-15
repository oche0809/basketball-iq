import { describe, expect, it } from 'vitest'
import { retryCandidates, retryReasonsOf } from '../src/analytics/retry.ts'
import { buildContent } from '../src/content/load.ts'
import { answerStage, emptyAnswer, type QuestionAnswer } from '../src/play/answer.ts'
import { buildAttempt } from '../src/play/record.ts'
import type { Attempt } from '../src/storage/attempt.ts'
import type { Question } from '../src/types/content.ts'
import { readRawContent } from '../scripts/read-data.ts'

const c = buildContent(readRawContent())
const q = (id: string) => c.byId.question.get(id)!
const exists = (id: string) => c.byId.question.has(id)

// 見る・判断・なぜで、どの評価の選択肢を選ぶか（教材データから選択肢を探す）
type Pick = { look: string; fit: string; quality: string }
const GOOD: Pick = { look: 'key', fit: 'priority', quality: 'key' }
function solve(question: Question, p: Pick): QuestionAnswer {
  let a = emptyAnswer()
  question.stages.forEach((s, i) => {
    if (s.kind === 'RECOGNITION') a = answerStage(s, a, s.options.find((o) => o.value === p.look)!.id)
    else if (s.kind === 'DECISION' || s.kind === 'REACTION') a = answerStage(s, a, s.options.find((o) => o.fit === p.fit)!.id)
    else a = answerStage(s, a, [s.options.find((o) => o.quality === p.quality)!.id])
    a = { ...a, stageIndex: i + 1 }
  })
  return a
}
let n = 0
const attempt = (id: string, p: Pick, minute: number): Attempt =>
  buildAttempt(q(id), solve(q(id), p), { setId: null, questionIndex: null }, new Date(Date.UTC(2026, 9, 15, 0, minute)), `att-${++n}`)

describe('もう一度解いてみる問題（事実だけで選ぶ）', () => {
  it('見る・判断・なぜのどれに当たるかを、回答の事実だけで決める', () => {
    expect(retryReasonsOf(attempt('GI-FOU-02-B', GOOD, 0))).toEqual([])
    expect(retryReasonsOf(attempt('GI-FOU-02-B', { ...GOOD, look: 'useful' }, 0))).toEqual(['look'])
    expect(retryReasonsOf(attempt('GI-FOU-02-B', { ...GOOD, fit: 'low' }, 0))).toEqual(['decision'])
    expect(retryReasonsOf(attempt('GI-FOU-02-B', { ...GOOD, quality: 'misconception' }, 0))).toEqual(['reason'])
    expect(retryReasonsOf(attempt('GI-FOU-02-B', { look: 'irrelevant', fit: 'low', quality: 'misconception' }, 0))).toEqual(['look', 'decision', 'reason'])
    // 〈条件付きで有効〉〈状況によっては有効〉は当たらない（優先度が低いわけではない）
    expect(retryReasonsOf(attempt('GI-FOU-02-B', { ...GOOD, fit: 'conditional' }, 0))).toEqual([])
    expect(retryReasonsOf(attempt('GI-FOU-02-B', { ...GOOD, fit: 'situational' }, 0))).toEqual([])
  })
  it('各問題の一番新しい回答だけを見る。解き直して当たらなくなれば外れる', () => {
    const before = [attempt('GI-FOU-02-B', { ...GOOD, fit: 'low' }, 1)]
    expect(retryCandidates(before, exists).map((x) => x.questionId)).toEqual(['GI-FOU-02-B'])
    const after = [...before, attempt('GI-FOU-02-B', GOOD, 2)]
    expect(retryCandidates(after, exists)).toEqual([])
    // 保存の順番が時刻順でなくても、日時で一番新しいものを使う
    expect(retryCandidates([...after].reverse(), exists)).toEqual([])
  })
  it('新しく解いた順に並ぶ。今の教材にない問題は出さない', () => {
    const list = [
      attempt('GI-FOU-02-A', { ...GOOD, look: 'useful' }, 1),
      attempt('GI-SCR-01-A', { ...GOOD, fit: 'low' }, 3),
      attempt('OF-DRV-01-A', GOOD, 2),
      { ...attempt('GI-FOU-02-B', { ...GOOD, fit: 'low' }, 4), questionId: 'OLD-REMOVED-Q' },
    ]
    const r = retryCandidates(list, exists)
    expect(r.map((x) => x.questionId)).toEqual(['GI-SCR-01-A', 'GI-FOU-02-A'])
    expect(r[0]).toEqual({ questionId: 'GI-SCR-01-A', completedAt: '2026-10-15T00:03:00.000Z', reasons: ['decision'] })
  })
  it('記録がなければ空。結果に点数やラベルの項目はない', () => {
    expect(retryCandidates([], exists)).toEqual([])
    const [x] = retryCandidates([attempt('GI-FOU-02-B', { ...GOOD, fit: 'low' }, 0)], exists)
    expect(Object.keys(x).sort()).toEqual(['completedAt', 'questionId', 'reasons'])
  })
})
