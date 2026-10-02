// 学習記録（attempt）の形と検証。1問を解説まで終えるごとに1件。
// 学習者が選んだもの（selected…）と、その時点の教材データから算出した評価（value・fit・quality など）を分けて持つ。
// 個人情報（名前・メール・学校名など）は持たない。
import type { Category, Fit, ReasonQuality, RecognitionValue } from '../types/content.ts'
import type { Diagnosis } from '../play/evaluate.ts'

export const ATTEMPT_SCHEMA_VERSION = 1

export type ChoiceRecord = {
  selectedChoiceId: string
  fit: Fit // 評価時点の優先度
  hasCondition: boolean // その選択肢に「有効になる条件」がデータにあったか
}

// どの入口から解いたか（事実の記録だけ。評価・集計には使わない）。
// assignmentId は「その課題URLが指定している教材のID」（先生が課題を出した回のIDではない）
export type AttemptSource = { type: 'practice' } | { type: 'assignment'; assignmentType: 'set' | 'question'; assignmentId: string }

export type Attempt = {
  attemptId: string
  completedAt: string // ISO 8601
  questionId: string
  setId: string | null // 単独で解いた時は null
  questionIndex: number | null // セットの中の何問目か（1から）。単独は null
  // 教材の版：教材全体の版番号はデータにないため null。問題の形式の版と、問題の更新日（データの updated_at）を残す
  contentVersion: null
  contentSchemaVersion: number
  questionUpdatedAt: string
  // 集計用：解いた時点の問題のカテゴリーと手がかり（データの cues）
  category: Category
  cues: string[]
  look: { selectedChoiceId: string; value: RecognitionValue; cueId: string | null }
  decision: ChoiceRecord
  reasons: {
    selectedReasonIds: string[]
    items: { reasonId: string; quality: ReasonQuality; supports: string[]; supportsChosen: boolean }[]
    diagnosis: Diagnosis
  }
  reaction: ChoiceRecord | null // 「次の判断」がある問題だけ
  // STEP 7 で追加。STEP 6 で保存した記録にはない（ない記録も読めるようにし、書き換えない）
  source?: AttemptSource
}

export type AttemptEnvelope = { schemaVersion: number; attempts: unknown[] }

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const FITS = ['priority', 'conditional', 'situational', 'low']
const VALUES = ['key', 'useful', 'not_now', 'irrelevant']
const QUALITIES = ['key', 'supporting', 'misconception', 'irrelevant']

const isSource = (v: unknown) =>
  isObj(v) && (v.type === 'practice' || (v.type === 'assignment' && (v.assignmentType === 'set' || v.assignmentType === 'question') && isStr(v.assignmentId)))

const isChoice = (v: unknown) => isObj(v) && isStr(v.selectedChoiceId) && FITS.includes(v.fit as string) && typeof v.hasCondition === 'boolean'

// 読み込んだ値が、記録として使える形かどうか（壊れた記録は集計に使わない。消しもしない）
export function isAttempt(v: unknown): v is Attempt {
  if (!isObj(v)) return false
  if (!isStr(v.attemptId) || !isStr(v.completedAt) || Number.isNaN(Date.parse(v.completedAt)) || !isStr(v.questionId)) return false
  if (!(v.setId === null || isStr(v.setId))) return false
  if (!(v.questionIndex === null || (Number.isInteger(v.questionIndex) && (v.questionIndex as number) >= 1))) return false
  if (!Array.isArray(v.cues) || !v.cues.every(isStr) || !isStr(v.category)) return false
  const look = v.look
  if (!isObj(look) || !isStr(look.selectedChoiceId) || !VALUES.includes(look.value as string)) return false
  if (!isChoice(v.decision)) return false
  const r = v.reasons
  if (!isObj(r) || !Array.isArray(r.selectedReasonIds) || r.selectedReasonIds.length < 1 || r.selectedReasonIds.length > 2) return false
  if (!Array.isArray(r.items) || !r.items.every((i) => isObj(i) && isStr(i.reasonId) && QUALITIES.includes(i.quality as string) && Array.isArray(i.supports) && typeof i.supportsChosen === 'boolean'))
    return false
  if (!isStr(r.diagnosis)) return false
  if (!(v.reaction === null || isChoice(v.reaction))) return false
  // source は STEP 7 からの欄。ない（古い記録）なら可、あるなら正しい形であること
  if (v.source !== undefined && !isSource(v.source)) return false
  return true
}

// 記録ごとに新しいID（上書きしない）。乱数のIDが使えない環境では、時刻と連番で作る
let counter = 0
export function newAttemptId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return `att-${c.randomUUID()}`
  counter += 1
  return `att-${Date.now().toString(36)}-${counter.toString(36)}`
}
