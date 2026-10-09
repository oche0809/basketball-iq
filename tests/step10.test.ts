import { describe, expect, it } from 'vitest'
import { filterQuestions } from '../src/coach/coachFilter.ts'
import { buildContent } from '../src/content/load.ts'
import {
  EMPTY_REVIEW_FILTER,
  type ReviewFilter,
  filterCurriculumForReview,
  filterQuestionsForReview,
  makeReviewRecord,
  neighbors,
  reviewDetailPath,
  reviewQuery,
  reviewStateFromParams,
  statusOf,
  summarize,
} from '../src/review/reviewModel.ts'
import { STORAGE_KEY } from '../src/storage/attemptStore.ts'
import { REVIEW_SCHEMA_VERSION, isReviewRecord } from '../src/storage/review.ts'
import { REVIEW_BACKUP_KEY_PREFIX, REVIEW_STORAGE_KEY, createReviewStore } from '../src/storage/reviewStore.ts'
import { EMPTY_FILTER, filterCurriculum } from '../src/utils/mapFilter.ts'
import { readRawContent } from '../scripts/read-data.ts'

const raw = readRawContent()
const c = buildContent(raw)
const T = new Date('2026-10-02T10:00:00+09:00')

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

describe('レビュー記録の保存（ReviewStore）', () => {
  it('初期状態：記録がなければ、すべての教材が「未確認」', () => {
    const store = createReviewStore(new MemoryStorage())
    const { records } = store.load()
    expect(records).toEqual([])
    for (const q of c.questions) expect(statusOf(records, 'question', q.id)).toBe('unreviewed')
    for (const i of c.curriculum) expect(statusOf(records, 'curriculum', i.id)).toBe('unreviewed')
  })
  it('採用・修正・保留とメモ・更新日時を保存し、読み込み直しても（再読み込み相当）残る', () => {
    const mem = new MemoryStorage()
    const store = createReviewStore(mem)
    expect(store.save(makeReviewRecord('question', 'OF-DRV-01-A', 'adopt', '', T))).toEqual({ ok: true })
    store.save(makeReviewRecord('question', 'AD-2V1-01-A', 'revise', '選択肢Bの条件を要確認', T))
    store.save(makeReviewRecord('curriculum', 'DF-PNR-05', 'hold', 'チームルール確定後に再確認', T))
    const again = createReviewStore(mem).load() // 新しく作り直す＝ページの再読み込みと同じ
    expect(again.status).toBe('ok')
    expect(statusOf(again.records, 'question', 'OF-DRV-01-A')).toBe('adopt')
    expect(statusOf(again.records, 'question', 'AD-2V1-01-A')).toBe('revise')
    expect(statusOf(again.records, 'curriculum', 'DF-PNR-05')).toBe('hold')
    expect(again.records.find((r) => r.itemId === 'AD-2V1-01-A')).toEqual({
      itemType: 'question',
      itemId: 'AD-2V1-01-A',
      status: 'revise',
      note: '選択肢Bの条件を要確認',
      updatedAt: T.toISOString(),
    })
    const env = JSON.parse(mem.getItem(REVIEW_STORAGE_KEY)!)
    expect(env.schemaVersion).toBe(REVIEW_SCHEMA_VERSION)
    expect([...mem.map.keys()]).toEqual([REVIEW_STORAGE_KEY])
  })
  it('同じ教材をもう一度保存すると置き換わる（未確認に戻すこともできる）', () => {
    const store = createReviewStore(new MemoryStorage())
    store.save(makeReviewRecord('question', 'OF-DRV-01-A', 'adopt', 'a', T))
    store.save(makeReviewRecord('question', 'OF-DRV-01-A', 'unreviewed', 'b', new Date(T.getTime() + 1000)))
    const { records } = store.load()
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ status: 'unreviewed', note: 'b' })
  })
  it('問題とカリキュラムで同じIDがあっても混ざらない', () => {
    const store = createReviewStore(new MemoryStorage())
    store.save(makeReviewRecord('question', 'X', 'adopt', '', T))
    store.save(makeReviewRecord('curriculum', 'X', 'hold', '', T))
    const { records } = store.load()
    expect(statusOf(records, 'question', 'X')).toBe('adopt')
    expect(statusOf(records, 'curriculum', 'X')).toBe('hold')
  })
  it('壊れたJSON：落ちずに「読み込めない」を返し、読むだけでは変えない。保存時は消さずに退避してから新しく始める', () => {
    const mem = new MemoryStorage()
    mem.setItem(REVIEW_STORAGE_KEY, '{壊れた')
    const store = createReviewStore(mem)
    expect(store.load()).toEqual({ status: 'unreadable', records: [], reason: 'broken-json' })
    expect(mem.getItem(REVIEW_STORAGE_KEY)).toBe('{壊れた')
    expect(store.save(makeReviewRecord('question', 'OF-DRV-01-A', 'adopt', '', T)).ok).toBe(true)
    expect(mem.getItem(REVIEW_BACKUP_KEY_PREFIX)).toBe('{壊れた')
    expect(store.load().records).toHaveLength(1)
  })
  it('一部だけ壊れた記録：使える記録だけを使い、壊れた記録は保存しても消さない', () => {
    const mem = new MemoryStorage()
    const good = makeReviewRecord('question', 'OF-DRV-01-A', 'adopt', '', T)
    mem.setItem(
      REVIEW_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, records: [good, { itemType: 'question' }, 'x', { ...good, status: 'great' }, { ...good, itemId: '' }, { ...good, updatedAt: 'きのう' }] }),
    )
    const store = createReviewStore(mem)
    const r = store.load()
    expect(r).toMatchObject({ status: 'ok', invalidCount: 5 })
    expect(r.records).toEqual([good])
    store.save(makeReviewRecord('question', 'GI-CLK-02-A', 'hold', '', T))
    expect(JSON.parse(mem.getItem(REVIEW_STORAGE_KEY)!).records).toHaveLength(7) // 壊れた5件も残る
    mem.setItem(REVIEW_STORAGE_KEY, JSON.stringify([1, 2]))
    expect(createReviewStore(mem).load()).toMatchObject({ status: 'unreadable', reason: 'unexpected-shape' })
  })
  it('新しい版のレビュー記録は上書きしない／保存できない環境・容量不足でも落ちない', () => {
    const mem = new MemoryStorage()
    const newer = JSON.stringify({ schemaVersion: 99, records: [] })
    mem.setItem(REVIEW_STORAGE_KEY, newer)
    expect(createReviewStore(mem).save(makeReviewRecord('question', 'a', 'adopt', '', T))).toEqual({ ok: false, reason: 'newer-version' })
    expect(mem.getItem(REVIEW_STORAGE_KEY)).toBe(newer)
    expect(createReviewStore(null).load()).toEqual({ status: 'unavailable', records: [] })
    expect(createReviewStore(null).save(makeReviewRecord('question', 'a', 'adopt', '', T))).toEqual({ ok: false, reason: 'unavailable' })
    const full = new MemoryStorage()
    full.failWrites = true
    expect(createReviewStore(full).save(makeReviewRecord('question', 'a', 'adopt', '', T))).toEqual({ ok: false, reason: 'quota-or-error' })
  })
  it('削除：レビュー記録（と退避分）だけを消す。学習記録やほかのキーは残す', () => {
    const mem = new MemoryStorage()
    mem.setItem(STORAGE_KEY, '{"schemaVersion":1,"attempts":[]}')
    mem.setItem(`${STORAGE_KEY}:unreadable`, 'old')
    mem.setItem('other-app', 'keep')
    mem.setItem(REVIEW_STORAGE_KEY, '{壊れた')
    const store = createReviewStore(mem)
    store.save(makeReviewRecord('question', 'OF-DRV-01-A', 'adopt', '', T))
    expect(store.deleteAll()).toEqual({ ok: true })
    expect([...mem.map.keys()].sort()).toEqual([STORAGE_KEY, `${STORAGE_KEY}:unreadable`, 'other-app'].sort())
    expect(store.load()).toEqual({ status: 'ok', records: [], invalidCount: 0 })
  })
  it('メモの文字は、そのまま文字として保存する（HTML として加工しない）', () => {
    const store = createReviewStore(new MemoryStorage())
    const xss = '<script>alert(1)</script><img src=x onerror=alert(2)>'
    store.save(makeReviewRecord('question', 'OF-DRV-01-A', 'revise', xss, T))
    expect(store.load().records[0].note).toBe(xss)
    expect(isReviewRecord({ itemType: 'question', itemId: 'a', status: 'adopt', note: xss, updatedAt: T.toISOString() })).toBe(true)
  })
})

describe('レビューの計算', () => {
  const records = [
    makeReviewRecord('question', 'OF-DRV-01-A', 'adopt', '', T),
    makeReviewRecord('question', 'AD-2V1-01-A', 'revise', '', T),
    makeReviewRecord('question', 'GI-CLK-02-A', 'hold', '', T),
    makeReviewRecord('question', 'DOES-NOT-EXIST', 'adopt', '', T), // 教材にないIDの記録
    makeReviewRecord('curriculum', 'OF-DRV-01', 'adopt', '', T),
  ]
  it('集計：問題とカリキュラムを別々に数える。教材にないIDの記録は数えない', () => {
    const q = summarize(c.questions.map((x) => x.id), records, 'question')
    expect(q).toEqual({ total: 19, reviewed: 3, counts: { unreviewed: 16, adopt: 1, revise: 1, hold: 1 } })
    const cur = summarize(c.curriculum.map((x) => x.id), records, 'curriculum')
    expect(cur).toEqual({ total: 76, reviewed: 1, counts: { unreviewed: 75, adopt: 1, revise: 0, hold: 0 } })
  })
  it('絞り込み：状態なしなら COACH（問題）・MAP（カリキュラム）と同じ結果', () => {
    expect(filterQuestionsForReview(c, EMPTY_REVIEW_FILTER, records)).toEqual(filterQuestions(c, EMPTY_FILTER))
    const f: ReviewFilter = { ...EMPTY_REVIEW_FILTER, cat: 'DEFENSE', grade: 2 }
    expect(filterCurriculumForReview(c, f, records)).toEqual(filterCurriculum(c.curriculum, f, (id) => c.byId.cue.get(id)?.name))
  })
  it('絞り込み：レビュー状態は AND で効く（未確認のみ・採用・修正・保留）', () => {
    const un = filterQuestionsForReview(c, { ...EMPTY_REVIEW_FILTER, status: 'unreviewed' }, records)
    expect(un).toHaveLength(16)
    expect(un.map((q) => q.id)).not.toContain('OF-DRV-01-A')
    expect(filterQuestionsForReview(c, { ...EMPTY_REVIEW_FILTER, status: 'revise' }, records).map((q) => q.id)).toEqual(['AD-2V1-01-A'])
    expect(filterQuestionsForReview(c, { ...EMPTY_REVIEW_FILTER, status: 'adopt', cat: 'GAME_IQ' }, records)).toEqual([]) // 採用は OFFENSE の1問だけ
    expect(filterQuestionsForReview(c, { ...EMPTY_REVIEW_FILTER, status: 'hold', cat: 'GAME_IQ' }, records).map((q) => q.id)).toEqual(['GI-CLK-02-A'])
    expect(filterCurriculumForReview(c, { ...EMPTY_REVIEW_FILTER, status: 'adopt' }, records).map((i) => i.id)).toEqual(['OF-DRV-01'])
  })
  it('前へ／次へ：絞り込みから外れた教材（未確認のみで採用にした等）からも、前後へ進める', () => {
    const filtered = filterQuestionsForReview(c, { ...EMPTY_REVIEW_FILTER, status: 'unreviewed' }, records) // OF-DRV-01-A は含まれない
    const n = neighbors(c.questions, filtered, 'OF-DRV-01-A')
    expect(n.prev).toBeNull() // データの先頭
    expect(n.next?.id).toBe('OF-DRV-01-B')
    expect(n.total).toBe(17)
    const last = neighbors(c.questions, c.questions, c.questions.at(-1)!.id)
    expect(last.next).toBeNull()
    expect(last.prev?.id).toBe(c.questions.at(-2)!.id)
  })
  it('URL との変換：対象・条件・状態が戻る。おかしな値は無視する', () => {
    const f: ReviewFilter = { q: 'ヘルプ', cat: 'DEFENSE', diff: 'INTERMEDIATE', grade: 2, status: 'hold' }
    const back = reviewStateFromParams(new URLSearchParams(reviewQuery('curriculum', f).slice(1)))
    expect(back).toEqual({ tab: 'curriculum', filter: f })
    expect(reviewStateFromParams(new URLSearchParams('tab=zzz&status=great&cat=ZONE'))).toEqual({ tab: 'question', filter: EMPTY_REVIEW_FILTER })
    expect(reviewDetailPath('question', 'OF-DRV-01-A')).toBe('#/coach/review/question/OF-DRV-01-A')
  })
  it('存在しないID：状態は「未確認」として扱い、教材の引き当てはできない（画面は「指定された教材が見つかりません」）', () => {
    expect(statusOf(records, 'question', 'NOPE')).toBe('unreviewed')
    expect(c.byId.question.get('DOES-NOT-EXIST')).toBeUndefined()
    expect(c.byId.curriculum.get('DOES-NOT-EXIST')).toBeUndefined()
    expect(reviewDetailPath('question', '<script>')).toBe('#/coach/review/question/%3Cscript%3E')
  })
  it('レビューの計算は教材データを書き換えない', () => {
    const before = JSON.stringify(raw)
    summarize(c.questions.map((x) => x.id), records, 'question')
    filterQuestionsForReview(c, { ...EMPTY_REVIEW_FILTER, status: 'adopt' }, records)
    filterCurriculumForReview(c, { ...EMPTY_REVIEW_FILTER, status: 'hold' }, records)
    neighbors(c.curriculum, [], 'OF-DRV-01')
    expect(JSON.stringify(raw)).toBe(before)
    expect(c.questions[0]).not.toHaveProperty('reviewStatus')
  })
})
