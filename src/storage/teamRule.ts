// チームの約束：先生が問題ごとに書く短い文。生徒の解説の【チームの約束】に出る。
// 教材データ（data/）には書き込まない。名前・学校名などの個人情報は書かない（画面で注意する）。
export const TEAM_RULE_SCHEMA_VERSION = 1
export const TEAM_RULE_MAX_LENGTH = 200

export type TeamRuleRecord = {
  questionId: string
  text: string // 画面ではテキストとしてだけ表示する
  updatedAt: string // ISO 8601
}
export type TeamRuleEnvelope = { schemaVersion: number; rules: unknown[] }
// 問題ID → 約束の文
export type TeamRules = Record<string, string>

// 前後の空白を除き、長すぎる分は切る（空なら「約束なし」）
export const normalizeTeamRuleText = (s: string) => s.trim().slice(0, TEAM_RULE_MAX_LENGTH)

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export function isTeamRuleRecord(v: unknown): v is TeamRuleRecord {
  if (!isObj(v)) return false
  if (typeof v.questionId !== 'string' || v.questionId.length === 0) return false
  if (typeof v.text !== 'string' || normalizeTeamRuleText(v.text).length === 0) return false
  if (typeof v.updatedAt !== 'string' || Number.isNaN(Date.parse(v.updatedAt))) return false
  return true
}
