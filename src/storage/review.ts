// 先生の教材レビューの記録。教材そのものの状態ではなく「先生がレビューした結果」だけを持つ。
// 教材データ（data/）には書き込まない。名前などの個人情報は持たない。
export const REVIEW_SCHEMA_VERSION = 1

export type ReviewStatus = 'unreviewed' | 'adopt' | 'revise' | 'hold'
export type ReviewItemType = 'question' | 'curriculum'

export type ReviewRecord = {
  itemType: ReviewItemType
  itemId: string
  status: ReviewStatus
  note: string // 先生用メモ（自由入力。画面ではテキストとしてだけ表示する）
  updatedAt: string // ISO 8601
}

export type ReviewEnvelope = { schemaVersion: number; records: unknown[] }

export const REVIEW_STATUSES: ReviewStatus[] = ['unreviewed', 'adopt', 'revise', 'hold']
export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = { unreviewed: '未確認', adopt: '採用', revise: '修正', hold: '保留' }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

// 読み込んだ値が、レビュー記録として使える形かどうか（壊れた記録は使わない。消しもしない）
export function isReviewRecord(v: unknown): v is ReviewRecord {
  if (!isObj(v)) return false
  if (v.itemType !== 'question' && v.itemType !== 'curriculum') return false
  if (typeof v.itemId !== 'string' || v.itemId.length === 0) return false
  if (!REVIEW_STATUSES.includes(v.status as ReviewStatus)) return false
  if (typeof v.note !== 'string') return false
  if (typeof v.updatedAt !== 'string' || Number.isNaN(Date.parse(v.updatedAt))) return false
  return true
}

export const sameItem = (a: { itemType: string; itemId: string }, b: { itemType: string; itemId: string }) => a.itemType === b.itemType && a.itemId === b.itemId
