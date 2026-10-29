// チームの約束：先生が問題ごとに書く短い文。生徒の解説の【チームの約束】に出る。
// 教材データ（data/）には書き込まない。名前・学校名などの個人情報は書かない（画面で注意する）。
export const TEAM_RULE_SCHEMA_VERSION = 1
export const TEAM_RULE_MAX_LENGTH = 200

export type TeamRuleRecord = {
  questionId: string
  text: string // 画面ではテキストとしてだけ表示する
  updatedAt: string // ISO 8601
  profile?: string // 相手ごとの約束の ID。ないものは「いつもの約束」
}
// 相手ごとの約束：相手の特徴で名前をつける（学校名・人の名前は書かない。画面で注意する）。名前はこのブラウザだけに残し、URLには入れない
export type TeamProfile = { id: string; name: string; createdAt: string }
export type TeamRuleEnvelope = { schemaVersion: number; rules: unknown[]; profiles?: unknown[] }
// 問題ID → 約束の文
export type TeamRules = Record<string, string>
// 「いつもの約束」の ID（記録に profile がないもの）
export const DEFAULT_PROFILE = ''
export const TEAM_PROFILE_NAME_MAX_LENGTH = 30

// 前後の空白を除き、長すぎる分は切る（空なら「約束なし」）
export const normalizeTeamRuleText = (s: string) => s.trim().slice(0, TEAM_RULE_MAX_LENGTH)
export const normalizeProfileName = (s: string) => s.trim().slice(0, TEAM_PROFILE_NAME_MAX_LENGTH)

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export function isTeamRuleRecord(v: unknown): v is TeamRuleRecord {
  if (!isObj(v)) return false
  if (typeof v.questionId !== 'string' || v.questionId.length === 0) return false
  if (typeof v.text !== 'string' || normalizeTeamRuleText(v.text).length === 0) return false
  if (typeof v.updatedAt !== 'string' || Number.isNaN(Date.parse(v.updatedAt))) return false
  if (v.profile !== undefined && (typeof v.profile !== 'string' || v.profile.length === 0)) return false
  return true
}

export function isTeamProfile(v: unknown): v is TeamProfile {
  if (!isObj(v)) return false
  if (typeof v.id !== 'string' || v.id.length === 0) return false
  if (typeof v.name !== 'string' || normalizeProfileName(v.name).length === 0) return false
  if (typeof v.createdAt !== 'string' || Number.isNaN(Date.parse(v.createdAt))) return false
  return true
}

// 相手ごとの約束を使う時の約束：その相手の約束がない問題は、いつもの約束を使う
export const mergeTeamRules = (byProfile: Record<string, TeamRules>, profile: string): TeamRules =>
  profile === DEFAULT_PROFILE ? { ...byProfile[DEFAULT_PROFILE] } : { ...byProfile[DEFAULT_PROFILE], ...byProfile[profile] }
