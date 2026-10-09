import { describe, expect, it } from 'vitest'
import { aggregate } from '../src/analytics/aggregate.ts'
import { assignmentPath, assignmentSource, assignmentUrl, copyText, parseAssignment } from '../src/coach/assignment.ts'
import { filterQuestions, filterSets } from '../src/coach/coachFilter.ts'
import { buildContent } from '../src/content/load.ts'
import { answerStage, emptyAnswer, type QuestionAnswer } from '../src/play/answer.ts'
import { buildAttempt, createRecorder } from '../src/play/record.ts'
import { orderedItems } from '../src/play/setOrder.ts'
import { type Attempt, isAttempt } from '../src/storage/attempt.ts'
import { STORAGE_KEY, createAttemptStore } from '../src/storage/attemptStore.ts'
import type { Question } from '../src/types/content.ts'
import { EMPTY_FILTER, type MapFilter } from '../src/utils/mapFilter.ts'
import { parseHash } from '../src/utils/router.ts'
import { readRawContent } from '../scripts/read-data.ts'

const c = buildContent(readRawContent())
const q = (id: string) => c.byId.question.get(id)!

class MemoryStorage implements Storage {
  map = new Map<string, string>()
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
    this.map.set(k, String(v))
  }
}
function solve(question: Question): QuestionAnswer {
  let a = emptyAnswer()
  question.stages.forEach((s, i) => {
    a = answerStage(s, a, s.kind === 'REASON' ? [s.options[0].id] : s.options[0].id)
    a = { ...a, stageIndex: i + 1 }
  })
  return a
}

describe('COACH の教材一覧と絞り込み', () => {
  it('条件なし：セット6つ・問題17問がすべて出る（名前はデータのまま）', () => {
    expect(filterSets(c, EMPTY_FILTER).map((s) => s.title)).toEqual(c.questionSets.map((s) => s.title))
    expect(filterQuestions(c, EMPTY_FILTER).map((x) => x.title)).toEqual(c.questions.map((x) => x.title))
    expect(filterQuestions(c, EMPTY_FILTER)).toHaveLength(17)
  })
  it('カテゴリー・難易度・学年それぞれで、条件を満たす問題だけになる', () => {
    expect(filterQuestions(c, { ...EMPTY_FILTER, cat: 'OFFENSE' }).every((x) => x.category === 'OFFENSE')).toBe(true)
    expect(filterQuestions(c, { ...EMPTY_FILTER, cat: 'OFFENSE' })).toHaveLength(c.questions.filter((x) => x.category === 'OFFENSE').length)
    expect(filterQuestions(c, { ...EMPTY_FILTER, diff: 'ADVANCED' }).map((x) => x.id)).toEqual(c.questions.filter((x) => x.difficulty === 'ADVANCED').map((x) => x.id))
    expect(filterQuestions(c, { ...EMPTY_FILTER, grade: 3 }).map((x) => x.id)).toEqual(c.questions.filter((x) => x.grade.includes(3)).map((x) => x.id))
  })
  it('条件は AND（それぞれで絞った結果の共通部分と同じ）', () => {
    const f: MapFilter = { q: '', cat: 'OFFENSE', diff: 'BEGINNER', grade: 1 }
    const and = filterQuestions(c, f).map((x) => x.id)
    const expected = c.questions.filter((x) => x.category === 'OFFENSE' && x.difficulty === 'BEGINNER' && x.grade.includes(1)).map((x) => x.id)
    expect(and).toEqual(expected)
    expect(and.length).toBeGreaterThan(0)
    expect(filterQuestions(c, { ...f, cat: 'GAME_IQ' })).toEqual([]) // GAME IQ に初級・1年の問題はない
  })
  it('セット：条件をすべて満たす問題が1問以上入っているセットだけが出る', () => {
    const f: MapFilter = { ...EMPTY_FILTER, cat: 'TRANSITION' }
    expect(filterSets(c, f).map((s) => s.id)).toEqual(['SET-TRANSITION-D'])
    const g: MapFilter = { ...EMPTY_FILTER, cat: 'ADVANTAGE', grade: 3 } // 2対1は1・2年のみ。3年は3対2だけ
    expect(filterSets(c, g).map((s) => s.id)).toEqual(['SET-3V2'])
  })
  it('キーワードは MAP と同じ正規化（全角・半角を区別しない）。セット名でも探せる', () => {
    expect(filterQuestions(c, { ...EMPTY_FILTER, q: '２対１' }).map((x) => x.id)).toEqual(filterQuestions(c, { ...EMPTY_FILTER, q: '2対1' }).map((x) => x.id))
    expect(filterSets(c, { ...EMPTY_FILTER, q: 'ショットクロック' }).map((s) => s.id)).toEqual(['SET-SHOT-CLOCK'])
  })
})

describe('課題URL', () => {
  const page = 'https://oche0809.github.io/basketball-iq/?check=1#/coach'
  it('セット・単独問題のURLを作る（? 以降は持ち込まない）', () => {
    expect(assignmentUrl(page, { type: 'set', id: 'SET-DRIVE-HELP' })).toBe('https://oche0809.github.io/basketball-iq/#/play/assignment/set/SET-DRIVE-HELP')
    expect(assignmentUrl(page, { type: 'question', id: 'OF-DRV-01-B' })).toBe('https://oche0809.github.io/basketball-iq/#/play/assignment/q/OF-DRV-01-B')
  })
  it('URLに入るのは教材のIDだけ（全教材で確認）', () => {
    const targets = [...c.questionSets.map((s) => ({ type: 'set' as const, id: s.id })), ...c.questions.map((x) => ({ type: 'question' as const, id: x.id }))]
    for (const t of targets) {
      const u = assignmentUrl(page, t)
      expect(u).toMatch(/^https:\/\/oche0809\.github\.io\/basketball-iq\/#\/play\/assignment\/(set|q)\/[A-Z0-9-]+$/)
      expect(u.endsWith(`/${t.id}`)).toBe(true)
    }
  })
  it('作ったURLを開くと、同じ教材の指定として読み取れる', () => {
    for (const t of [{ type: 'set' as const, id: 'SET-2V1' }, { type: 'question' as const, id: 'GI-CLK-02-B' }])
      expect(parseAssignment(parseHash(assignmentPath(t)).segments)).toEqual(t)
  })
  it('課題でないURL・形のおかしいURLは課題として読まない（ほかの教材に置き換えない）', () => {
    expect(parseAssignment(parseHash('#/play/set/SET-2V1').segments)).toBeNull()
    expect(parseAssignment(parseHash('#/play/assignment/zzz/SET-2V1').segments)).toBeNull()
    expect(parseAssignment(parseHash('#/play/assignment/set').segments)).toBeNull()
    expect(parseAssignment(parseHash('#/play/assignment/q/DOES-NOT-EXIST').segments)).toEqual({ type: 'question', id: 'DOES-NOT-EXIST' })
    expect(parseAssignment(parseHash('#/play/assignment/set/%E0%A4%A').segments)).toEqual({ type: 'set', id: '%E0%A4%A' }) // 壊れたエンコードでも落ちない
  })
  it('存在しないIDは、データで引くと見つからない（画面は「見つかりませんでした」を出す）', () => {
    expect(c.byId.questionSet.get('DOES-NOT-EXIST')).toBeUndefined()
    expect(c.byId.question.get('DOES-NOT-EXIST')).toBeUndefined()
  })
  it('セット課題の出題順は、通常の PLAY と同じ（既存の orderedItems）', () => {
    for (const s of c.questionSets) {
      const t = parseAssignment(parseHash(assignmentPath({ type: 'set', id: s.id })).segments)!
      expect(orderedItems(c.byId.questionSet.get(t.id)!)).toEqual(orderedItems(s))
    }
  })
})

describe('URLのコピー（失敗しても落ちない）', () => {
  it('コピーできた時は true', async () => {
    let got = ''
    expect(await copyText('x', { writeText: async (t) => void (got = t) })).toBe(true)
    expect(got).toBe('x')
  })
  it('クリップボードがない・許可されない時は false（例外にしない）', async () => {
    expect(await copyText('x', undefined)).toBe(false)
    expect(await copyText('x', { writeText: () => Promise.reject(new Error('NotAllowedError')) })).toBe(false)
    expect(await copyText('x', { writeText: () => { throw new Error('sync') } })).toBe(false)
  })
})

describe('課題から解いた記録（source）', () => {
  it('通常の PLAY は practice、課題は assignment（セット・問題・ID）', () => {
    const question = q('OF-DRV-01-B')
    const a = solve(question)
    expect(buildAttempt(question, a, { setId: null, questionIndex: null }, new Date()).source).toEqual({ type: 'practice' })
    expect(buildAttempt(question, a, { setId: 'SET-DRIVE-HELP', questionIndex: 2, source: assignmentSource({ type: 'set', id: 'SET-DRIVE-HELP' }) }, new Date()).source).toEqual({
      type: 'assignment',
      assignmentType: 'set',
      assignmentId: 'SET-DRIVE-HELP',
    })
    expect(buildAttempt(question, a, { setId: null, questionIndex: null, source: assignmentSource({ type: 'question', id: 'OF-DRV-01-B' }) }, new Date()).source).toEqual({
      type: 'assignment',
      assignmentType: 'question',
      assignmentId: 'OF-DRV-01-B',
    })
  })
  it('課題でも、解説に入るまで保存しない。入ったら1件だけ。解き直しは別の記録', () => {
    const store = createAttemptStore(new MemoryStorage())
    const rec = createRecorder(store)
    const question = q('AD-2V1-01-A')
    const ctx = { setId: null, questionIndex: null, source: assignmentSource({ type: 'question', id: question.id }) }
    let a = emptyAnswer()
    question.stages.forEach((s, i) => {
      a = answerStage(s, a, s.kind === 'REASON' ? [s.options[0].id] : s.options[0].id)
      expect(rec.complete('回1', question, a, ctx).status).toBe('skipped') // 段階の回答だけでは保存しない
      a = { ...a, stageIndex: i + 1 }
      if (i < question.stages.length - 1) expect(rec.complete('回1', question, a, ctx).status).toBe('skipped')
    })
    expect(store.load().attempts).toHaveLength(0)
    expect(rec.complete('回1', question, a, ctx).status).toBe('saved')
    expect(rec.complete('回1', question, { ...a, stageIndex: 1 }, ctx).status).toBe('skipped') // 戻る
    expect(rec.complete('回1', question, a, ctx).status).toBe('skipped') // また解説
    expect(store.load().attempts).toHaveLength(1)
    rec.complete('回2', question, a, ctx) // 開き直して解き直し
    const list = store.load().attempts
    expect(list).toHaveLength(2)
    expect(list[0].attemptId).not.toBe(list[1].attemptId)
    expect(list.every((x) => x.source?.type === 'assignment')).toBe(true)
  })
})

describe('MY IQ への影響と後方互換', () => {
  const ids = ['OF-DRV-01-A', 'OF-DRV-01-B', 'AD-2V1-01-A', 'GI-CLK-02-A']
  const make = (source: Attempt['source'] | 'omit') =>
    ids.map((id, i) => {
      const at = buildAttempt(q(id), solve(q(id)), { setId: null, questionIndex: null, ...(source === 'omit' ? {} : { source }) }, new Date(Date.UTC(2026, 9, 2, 0, i)), `att-${i}`)
      if (source === 'omit') delete at.source // STEP 6 で保存された、source のない古い記録
      return at
    })
  it('課題からの記録も、通常の記録と同じように集計に入る。source によって集計結果は変わらない', () => {
    const practice = aggregate(make({ type: 'practice' }))
    const assignment = aggregate(make({ type: 'assignment', assignmentType: 'question', assignmentId: 'OF-DRV-01-A' }))
    const old = aggregate(make('omit'))
    const strip = (g: ReturnType<typeof aggregate>) => ({ ...g, recent: g.recent.map((a) => a.attemptId) })
    expect(strip(assignment)).toEqual(strip(practice))
    expect(strip(old)).toEqual(strip(practice))
    expect(practice.totalAttempts).toBe(4)
  })
  it('集計の結果に source を使った項目はない', () => {
    expect(JSON.stringify(Object.keys(aggregate(make({ type: 'practice' }))))).not.toMatch(/source|assignment/i)
  })
  it('source のない古い記録も読める。source の形が壊れている記録は使わない（消しもしない）', () => {
    const [old] = make('omit')
    expect(isAttempt(old)).toBe(true)
    expect(isAttempt({ ...old, source: { type: 'assignment', assignmentType: 'class', assignmentId: 'x' } })).toBe(false)
    expect(isAttempt({ ...old, source: { type: 'practice' } })).toBe(true)
  })
  it('新しい記録を保存しても、古い記録は書き換えない（source を足さない）', () => {
    const mem = new MemoryStorage()
    const [old] = make('omit')
    mem.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, attempts: [old] }))
    const store = createAttemptStore(mem)
    store.save(make({ type: 'assignment', assignmentType: 'set', assignmentId: 'SET-2V1' })[1])
    const saved = JSON.parse(mem.getItem(STORAGE_KEY)!)
    expect(saved.schemaVersion).toBe(1)
    expect(saved.attempts[0]).toEqual(JSON.parse(JSON.stringify(old)))
    expect(saved.attempts[0]).not.toHaveProperty('source')
    expect(saved.attempts[1].source).toEqual({ type: 'assignment', assignmentType: 'set', assignmentId: 'SET-2V1' })
  })
})
