// 教材レビューの計算（画面・保存場所から切り離した純粋な処理）
import { questionMatches } from '../coach/coachFilter.ts'
import { REVIEW_STATUSES, type ReviewItemType, type ReviewRecord, type ReviewStatus } from '../storage/review.ts'
import type { Content, CurriculumItem, Question } from '../types/content.ts'
import { type MapFilter, filterCurriculum, filterFromParams, filterToQuery } from '../utils/mapFilter.ts'

export type ReviewFilter = MapFilter & { status: ReviewStatus | '' }
export const EMPTY_REVIEW_FILTER: ReviewFilter = { q: '', cat: '', diff: '', grade: null, status: '' }

// 記録がない教材は「未確認」
export function reviewOf(records: readonly ReviewRecord[], itemType: ReviewItemType, itemId: string): ReviewRecord | null {
  return records.find((r) => r.itemType === itemType && r.itemId === itemId) ?? null
}
export const statusOf = (records: readonly ReviewRecord[], itemType: ReviewItemType, itemId: string): ReviewStatus =>
  reviewOf(records, itemType, itemId)?.status ?? 'unreviewed'

export type ReviewSummary = { total: number; reviewed: number; counts: Record<ReviewStatus, number> }
// 今の教材（ids）だけを数える。教材にないIDの記録は数えない
export function summarize(ids: readonly string[], records: readonly ReviewRecord[], itemType: ReviewItemType): ReviewSummary {
  const counts: Record<ReviewStatus, number> = { unreviewed: 0, adopt: 0, revise: 0, hold: 0 }
  for (const id of ids) counts[statusOf(records, itemType, id)]++
  return { total: ids.length, reviewed: ids.length - counts.unreviewed, counts }
}

// 絞り込み：キーワード・カテゴリー・難易度・学年は COACH（問題）・MAP（カリキュラム）と同じ判定。レビュー状態を AND で足す
export function filterQuestionsForReview(c: Content, f: ReviewFilter, records: readonly ReviewRecord[]): Question[] {
  const cueName = (id: string) => c.byId.cue.get(id)?.name
  return c.questions.filter((q) => questionMatches(q, f, cueName) && (!f.status || statusOf(records, 'question', q.id) === f.status))
}
export function filterCurriculumForReview(c: Content, f: ReviewFilter, records: readonly ReviewRecord[]): CurriculumItem[] {
  return filterCurriculum(c.curriculum, f, (id) => c.byId.cue.get(id)?.name).filter((i) => !f.status || statusOf(records, 'curriculum', i.id) === f.status)
}

// 前へ／次へ。今開いている教材が絞り込みから外れても（例：「未確認のみ」で採用にした）、その位置から前後へ進めるようにする
export function neighbors<T extends { id: string }>(all: readonly T[], filtered: readonly T[], currentId: string): { prev: T | null; next: T | null; index: number; total: number } {
  const keep = new Set(filtered.map((x) => x.id))
  keep.add(currentId)
  const list = all.filter((x) => keep.has(x.id))
  const i = list.findIndex((x) => x.id === currentId)
  return { prev: i > 0 ? list[i - 1] : null, next: i >= 0 && i < list.length - 1 ? list[i + 1] : null, index: i, total: list.length }
}

// URL（#/coach/review?tab=…&q=…&cat=…&diff=…&grade=…&status=…）との変換
export type ReviewTab = 'question' | 'curriculum'
export function reviewStateFromParams(p: URLSearchParams): { tab: ReviewTab; filter: ReviewFilter } {
  const status = p.get('status') ?? ''
  return {
    tab: p.get('tab') === 'curriculum' ? 'curriculum' : 'question',
    filter: { ...filterFromParams(p), status: (REVIEW_STATUSES as string[]).includes(status) ? (status as ReviewStatus) : '' },
  }
}
export function reviewQuery(tab: ReviewTab, f: ReviewFilter): string {
  const p = new URLSearchParams(filterToQuery(f).slice(1))
  if (f.status) p.set('status', f.status)
  if (tab === 'curriculum') p.set('tab', 'curriculum')
  const s = p.toString()
  return s ? `?${s}` : ''
}
export const reviewDetailPath = (tab: ReviewTab, id: string) => `#/coach/review/${tab}/${encodeURIComponent(id)}`

// 保存するレビュー記録を作る（更新日時はこの時点）
export const makeReviewRecord = (itemType: ReviewItemType, itemId: string, status: ReviewStatus, note: string, now: Date = new Date()): ReviewRecord => ({
  itemType,
  itemId,
  status,
  note,
  updatedAt: now.toISOString(),
})
