import { describe, expect, it } from 'vitest'
import { MIN_ATTEMPTS_FOR_TREND, aggregate } from '../src/analytics/aggregate.ts'
import { buildContent } from '../src/content/load.ts'
import { answerStage, emptyAnswer, type QuestionAnswer } from '../src/play/answer.ts'
import { buildAttempt, createRecorder, isCompleted } from '../src/play/record.ts'
import { ATTEMPT_SCHEMA_VERSION, type Attempt, isAttempt, newAttemptId } from '../src/storage/attempt.ts'
import { BACKUP_KEY_PREFIX, STORAGE_KEY, createAttemptStore } from '../src/storage/attemptStore.ts'
import type { Question } from '../src/types/content.ts'
import { readRawContent } from '../scripts/read-data.ts'

const c = buildContent(readRawContent())
const q = (id: string) => c.byId.question.get(id)!

// テスト用の保存場所（ブラウザの localStorage と同じ使い方ができる）
class MemoryStorage implements Storage {
  map = new Map<string, string>()
  failWrites = false
  get length() {
    return this.map.size
  }
  clear() {
    this.map.clear()
  }
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null
  }
  removeItem(k: string) {
    this.map.delete(k)
  }
  setItem(k: string, v: string) {
    if (this.failWrites) throw new Error('QuotaExceededError')
    this.map.set(k, String(v))
  }
}

// 指定した選択で1問を最後（解説）まで解く
function solveWith(question: Question, picks: Record<string, string | string[]>): QuestionAnswer {
  let a = emptyAnswer()
  question.stages.forEach((s, i) => {
    const v = picks[s.id] ?? (s.kind === 'REASON' ? [s.options[0].id] : s.options[0].id)
    a = answerStage(s, a, v)
    a = { ...a, stageIndex: i + 1 }
  })
  return a
}
const T0 = new Date('2026-10-02T09:00:00+09:00')
const at = (min: number) => new Date(T0.getTime() + min * 60_000)

describe('保存のタイミング', () => {
  it('段階の途中（見るだけ・判断まで・なぜまで）では保存しない。解説まで終えた時だけ1件保存', () => {
    const store = createAttemptStore(new MemoryStorage())
    const rec = createRecorder(store, () => T0)
    const question = q('AD-2V1-01-A') // 「次の判断」がある問題
    let a = emptyAnswer()
    for (let i = 0; i < question.stages.length; i++) {
      const s = question.stages[i]
      a = answerStage(s, a, s.kind === 'REASON' ? [s.options[0].id] : s.options[0].id)
      expect(rec.complete('k1', question, a, { setId: null, questionIndex: null }).status, `段階${i + 1}の回答直後`).toBe('skipped')
      a = { ...a, stageIndex: i + 1 }
      if (i < question.stages.length - 1) expect(rec.complete('k1', question, a, { setId: null, questionIndex: null }).status, `段階${i + 2}へ進んだ時`).toBe('skipped')
    }
    expect(store.load().attempts).toHaveLength(0) // 次の判断まで答えていても、解説に入るまでは保存しない…
    expect(isCompleted(question, a)).toBe(true)
    expect(rec.complete('k1', question, a, { setId: null, questionIndex: null }).status).toBe('saved') // …解説に入った今、保存
    expect(store.load().attempts).toHaveLength(1)
  })
  it('同じ回の解説で何度操作しても（戻る・次へ・次の問題）二重に保存しない', () => {
    const store = createAttemptStore(new MemoryStorage())
    const rec = createRecorder(store)
    const question = q('OF-DRV-01-B')
    const a = solveWith(question, {})
    expect(rec.complete('s|OF-DRV-01-B', question, a, { setId: 'SET-DRIVE-HELP', questionIndex: 2 }).status).toBe('saved')
    rec.complete('s|OF-DRV-01-B', question, { ...a, stageIndex: 1 }, { setId: 'SET-DRIVE-HELP', questionIndex: 2 }) // 戻る
    expect(rec.complete('s|OF-DRV-01-B', question, a, { setId: 'SET-DRIVE-HELP', questionIndex: 2 }).status).toBe('skipped') // また解説へ
    expect(store.load().attempts).toHaveLength(1)
  })
  it('解き直し（開き直した別の回）は、上書きせず別の記録になる。セットを変えても別の記録', () => {
    const store = createAttemptStore(new MemoryStorage())
    const rec = createRecorder(store)
    const question = q('OF-DRV-01-B')
    const a = solveWith(question, {})
    rec.complete('回1|OF-DRV-01-B', question, a, { setId: 'SET-DRIVE-HELP', questionIndex: 2 })
    rec.complete('回2|OF-DRV-01-B', question, a, { setId: 'SET-DRIVE-HELP', questionIndex: 2 })
    rec.complete('回3|OF-DRV-01-B', question, a, { setId: null, questionIndex: null })
    const list = store.load().attempts
    expect(list).toHaveLength(3)
    expect(new Set(list.map((x) => x.attemptId)).size).toBe(3)
    expect(list.map((x) => x.setId)).toEqual(['SET-DRIVE-HELP', 'SET-DRIVE-HELP', null])
  })
  it('セットでは、問題ごとに解き終えた時点で1件ずつ保存（途中でやめても、それまでの問題は残る）', () => {
    const store = createAttemptStore(new MemoryStorage())
    const rec = createRecorder(store)
    const set = c.byId.questionSet.get('SET-DRIVE-HELP')!
    set.items.slice(0, 2).forEach((id, i) => rec.complete(`s|${id}`, q(id), solveWith(q(id), {}), { setId: set.id, questionIndex: i + 1 }))
    const list = store.load().attempts
    expect(list.map((x) => [x.questionId, x.questionIndex])).toEqual([
      ['OF-DRV-01-A', 1],
      ['OF-DRV-01-B', 2],
    ])
  })
})

describe('記録の中身', () => {
  const question = q('OF-DRV-01-B')
  const a = solveWith(question, { see: 's1', decide: 'B', why: ['r1', 'r4'] })
  const att = buildAttempt(question, a, { setId: 'SET-DRIVE-HELP', questionIndex: 2 }, T0, 'att-test')
  it('問題・セット・日時・順番が正しい。教材全体の版はデータにないので null、問題の形式の版と更新日を残す', () => {
    expect(att).toMatchObject({
      attemptId: 'att-test',
      completedAt: T0.toISOString(),
      questionId: 'OF-DRV-01-B',
      setId: 'SET-DRIVE-HELP',
      questionIndex: 2,
      contentVersion: null,
      contentSchemaVersion: 2,
      questionUpdatedAt: question.updated_at,
      category: 'OFFENSE',
      cues: question.cues,
    })
  })
  it('見る・判断・理由を別々に持ち、選んだIDと、その時点の評価を分けて持つ', () => {
    expect(att.look).toEqual({ selectedChoiceId: 's1', value: 'key', cueId: 'CUE-HELP-FEET' })
    expect(att.decision).toEqual({ selectedChoiceId: 'B', fit: 'priority', hasCondition: false })
    expect(att.reasons.selectedReasonIds).toEqual(['r1', 'r4'])
    expect(att.reasons.items).toEqual([
      { reasonId: 'r1', quality: 'key', supports: ['B'], supportsChosen: true },
      { reasonId: 'r4', quality: 'misconception', supports: ['B', 'C'], supportsChosen: true },
    ])
    expect(att.reasons.diagnosis).toBe('KEY_WITH_NOISE')
    expect(att).not.toHaveProperty('score')
  })
  it('「次の判断」は、その段階がある問題だけ保存する', () => {
    expect(att.reaction).toBeNull()
    const withReaction = buildAttempt(q('AD-2V1-01-A'), solveWith(q('AD-2V1-01-A'), { next: 'A' }), { setId: null, questionIndex: null }, T0)
    expect(withReaction.reaction).toEqual({ selectedChoiceId: 'A', fit: 'priority', hasCondition: false })
  })
  it('理由は最大2つ。3つ渡しても2つだけ記録し、4分類と supports を保つ', () => {
    const three = buildAttempt(question, solveWith(question, { why: ['r1', 'r3', 'r5'] }), { setId: null, questionIndex: null }, T0)
    expect(three.reasons.selectedReasonIds).toEqual(['r1', 'r3'])
    expect(three.reasons.items.map((i) => [i.quality, i.supports])).toEqual([
      ['key', ['B']],
      ['supporting', ['A']],
    ])
  })
  it('全15問で、解き終えた回答から形の正しい記録が作れる（個人情報の欄はない）', () => {
    for (const x of c.questions) {
      const r = buildAttempt(x, solveWith(x, {}), { setId: x.set_id, questionIndex: x.set_id ? 1 : null }, T0)
      expect(isAttempt(r), x.id).toBe(true)
      for (const k of ['name', 'email', 'school', 'grade', 'ip']) expect(r).not.toHaveProperty(k)
    }
  })
  it('解説まで終えていない回答からは記録を作らない', () => {
    expect(() => buildAttempt(question, { ...a, stageIndex: 1 }, { setId: null, questionIndex: null }, T0)).toThrow()
  })
  it('attemptId は毎回ちがう', () => {
    const ids = Array.from({ length: 500 }, () => newAttemptId())
    expect(new Set(ids).size).toBe(500)
  })
})

describe('保存場所（AttemptStore）', () => {
  const sample = () => buildAttempt(q('OF-DRV-01-B'), solveWith(q('OF-DRV-01-B'), {}), { setId: null, questionIndex: null }, T0)
  it('正しい記録を保存して読み込める（キーは1つ・版つき）', () => {
    const mem = new MemoryStorage()
    const store = createAttemptStore(mem)
    expect(store.save(sample())).toEqual({ ok: true })
    expect([...mem.map.keys()]).toEqual([STORAGE_KEY])
    expect(JSON.parse(mem.getItem(STORAGE_KEY)!).schemaVersion).toBe(ATTEMPT_SCHEMA_VERSION)
    expect(store.load()).toMatchObject({ status: 'ok', invalidCount: 0 })
  })
  it('壊れたJSONでも落ちない。読み込みでは元のデータを消さない。保存の時は退避してから新しく始める', () => {
    const mem = new MemoryStorage()
    mem.setItem(STORAGE_KEY, '{壊れた')
    const store = createAttemptStore(mem)
    expect(store.load()).toEqual({ status: 'unreadable', attempts: [], reason: 'broken-json' })
    expect(mem.getItem(STORAGE_KEY)).toBe('{壊れた') // 読んだだけでは変えない
    expect(store.save(sample()).ok).toBe(true)
    expect(mem.getItem(BACKUP_KEY_PREFIX)).toBe('{壊れた') // 消さずに退避
    expect(store.load().attempts).toHaveLength(1)
  })
  it('配列でない・必須の欄がない・型が違う記録でも落ちない。使えない記録は集計に使わず、保存しても消さない', () => {
    const mem = new MemoryStorage()
    mem.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, attempts: [{ attemptId: 1 }, 'x', null, sample()] }))
    const store = createAttemptStore(mem)
    const r = store.load()
    expect(r).toMatchObject({ status: 'ok', invalidCount: 3 })
    expect(r.attempts).toHaveLength(1)
    store.save(sample())
    expect(JSON.parse(mem.getItem(STORAGE_KEY)!).attempts).toHaveLength(5) // 壊れた3件も残る
    mem.setItem(STORAGE_KEY, JSON.stringify([1, 2]))
    expect(createAttemptStore(mem).load()).toMatchObject({ status: 'unreadable', reason: 'unexpected-shape' })
  })
  it('新しい版で保存された記録は、読めなくても上書きしない', () => {
    const mem = new MemoryStorage()
    const newer = JSON.stringify({ schemaVersion: 99, attempts: [] })
    mem.setItem(STORAGE_KEY, newer)
    const store = createAttemptStore(mem)
    expect(store.load()).toMatchObject({ status: 'unreadable', reason: 'newer-version' })
    expect(store.save(sample())).toEqual({ ok: false, reason: 'newer-version' })
    expect(mem.getItem(STORAGE_KEY)).toBe(newer)
  })
  it('localStorage が使えない環境でも落ちない（読み込みも保存も「使えない」を返す）', () => {
    const store = createAttemptStore(null)
    expect(store.load()).toEqual({ status: 'unavailable', attempts: [] })
    expect(store.save(sample())).toEqual({ ok: false, reason: 'unavailable' })
    expect(store.deleteAll()).toEqual({ ok: false, reason: 'unavailable' })
  })
  it('容量不足などで書き込めなくても落ちず、記録係は「保存できなかった」を返す（問題は続けられる）', () => {
    const mem = new MemoryStorage()
    mem.failWrites = true
    const store = createAttemptStore(mem)
    expect(store.save(sample())).toEqual({ ok: false, reason: 'quota-or-error' })
    const rec = createRecorder(store)
    const question = q('OF-DRV-01-B')
    expect(rec.complete('x', question, solveWith(question, {}), { setId: null, questionIndex: null })).toEqual({ status: 'failed', reason: 'quota-or-error' })
  })
  it('保存場所そのものが例外を投げても、記録係は落ちない', () => {
    const rec = createRecorder({ load: () => ({ status: 'unavailable', attempts: [] }), save: () => { throw new Error('x') }, deleteAll: () => ({ ok: true }) })
    expect(rec.complete('x', q('OF-DRV-01-B'), solveWith(q('OF-DRV-01-B'), {}), { setId: null, questionIndex: null }).status).toBe('failed')
  })
  it('削除：学習記録と退避した記録だけを消し、ほかのキーには触れない', () => {
    const mem = new MemoryStorage()
    mem.setItem('other-app', 'keep')
    mem.setItem(STORAGE_KEY, '{壊れた')
    const store = createAttemptStore(mem)
    store.save(sample())
    expect(store.deleteAll()).toEqual({ ok: true })
    expect([...mem.map.keys()]).toEqual(['other-app'])
    expect(store.load()).toEqual({ status: 'ok', attempts: [], invalidCount: 0 })
  })
})

describe('MY IQ の集計（記録から毎回計算する）', () => {
  const make = (id: string, picks: Record<string, string | string[]>, setId: string | null, min: number): Attempt =>
    buildAttempt(q(id), solveWith(q(id), picks), { setId, questionIndex: setId ? c.byId.questionSet.get(setId)!.items.indexOf(id) + 1 : null }, at(min), `att-${id}-${min}`)

  it('0件', () => {
    const g = aggregate([])
    expect(g).toMatchObject({ totalAttempts: 0, distinctQuestions: 0, distinctSets: 0, lastCompletedAt: null, byCue: [], bySet: [], recent: [] })
  })
  it('1件：数えるだけで、傾向（最近の回答では〜）は出さない', () => {
    const g = aggregate([make('OF-DRV-01-B', { see: 's1', decide: 'B', why: ['r1'] }, null, 0)])
    expect(g.totalAttempts).toBe(1)
    expect(g.look).toEqual({ key: 1, other: 0 })
    expect(g.decision.priority).toBe(1)
    expect(g.byCue.every((x) => x.recent === null)).toBe(true)
  })
  it('同じ問題を3回解く → 回答3回・問題1問。3回以上になった手がかりだけ傾向の数字が出る', () => {
    const list = [0, 1, 2].map((m) => make('OF-DRV-01-B', { see: m === 0 ? 's2' : 's1', decide: 'B', why: ['r1'] }, 'SET-DRIVE-HELP', m))
    const g = aggregate(list)
    expect(g.totalAttempts).toBe(3)
    expect(g.distinctQuestions).toBe(1)
    const cue = g.byCue.find((x) => x.cueId === 'CUE-HELP-FEET')!
    expect(cue).toMatchObject({ attempts: 3, lookKey: 2, lookOther: 1 })
    expect(cue.recent).toEqual({ attempts: 3, lookKey: 2, decisionPriority: 3 })
    expect(MIN_ATTEMPTS_FOR_TREND).toBe(3)
  })
  it('手がかり別：1問に複数の手がかりがあれば、データの cues のとおり、それぞれに数える', () => {
    const g = aggregate([make('OF-DRV-01-B', {}, null, 0)]) // cues: HELP-FEET・WHO-HELPED
    expect(g.byCue.map((x) => x.cueId).sort()).toEqual([...q('OF-DRV-01-B').cues].sort())
  })
  it('判断別・理由別・セット別', () => {
    const list = [
      make('OF-DRV-01-A', { decide: 'A', why: ['r1'] }, 'SET-DRIVE-HELP', 0), // A＝優先、r1＝決め手
      make('OF-DRV-01-B', { decide: 'A', why: ['r3', 'r5'] }, 'SET-DRIVE-HELP', 1), // A＝状況次第、r3＝補助、r5＝無関係
      make('OF-DRV-01-B', { decide: 'B', why: ['r1', 'r4'] }, 'SET-DRIVE-HELP', 2), // 解き直し：B＝優先、r1＝決め手、r4＝思い込み
      make('AD-2V1-01-A', { decide: 'B', why: ['r1'], next: 'A' }, null, 3), // 単独
    ]
    const g = aggregate(list)
    expect(g.decision).toEqual({ priority: 3, conditional: 0, situational: 1, low: 0 })
    expect(g.reaction).toEqual({ attempts: 1, fits: { priority: 1, conditional: 0, situational: 0, low: 0 } })
    expect(g.reasons.qualities).toEqual({ key: 3, supporting: 1, misconception: 1, irrelevant: 1 })
    expect(g.reasons.selected).toBe(6)
    expect(g.reasons.supportsChosen).toBe(5) // r5（無関係）だけが判断を説明していない
    expect(g.distinctSets).toBe(1)
    expect(g.bySet).toEqual([{ setId: 'SET-DRIVE-HELP', attempts: 3, answeredQuestions: 2, lastCompletedAt: at(2).toISOString(), latestPriorityQuestions: 2 }])
    expect(g.recent.map((x) => x.attemptId)[0]).toBe('att-AD-2V1-01-A-3') // 新しい順
  })
  it('集計は記録から毎回計算する（記録が変われば結果も変わる。集計結果は保存しない）', () => {
    const mem = new MemoryStorage()
    const store = createAttemptStore(mem)
    store.save(make('OF-DRV-01-B', {}, null, 0))
    expect(aggregate(store.load().attempts).totalAttempts).toBe(1)
    store.save(make('OF-DRV-01-A', {}, null, 1))
    expect(aggregate(store.load().attempts).totalAttempts).toBe(2)
    expect([...mem.map.keys()]).toEqual([STORAGE_KEY]) // 集計結果のキーはない
    expect(Object.keys(JSON.parse(mem.getItem(STORAGE_KEY)!))).toEqual(['schemaVersion', 'attempts'])
  })
  it('集計の結果に、点数・正解率・ランクの項目はない', () => {
    const g = aggregate([make('OF-DRV-01-B', {}, null, 0)])
    const keys = JSON.stringify(Object.keys(g))
    for (const bad of ['score', 'rate', 'rank', 'iq', 'accuracy']) expect(keys.toLowerCase()).not.toContain(bad)
  })
})
