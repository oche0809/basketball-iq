// 課題URLに入れる「チームの約束」（?team=...）。サーバーがないので、生徒の端末へは URL で届ける。
// 中身は {"v":1,"r":{問題ID: 約束の文}} を UTF-8 → base64url にしたもの。先生が書いた文だけで、回答・名前などは入れない。
import { type TeamRules, normalizeTeamRuleText } from '../storage/teamRule.ts'

export const TEAM_PARAM = 'team'
const VERSION = 1
// これより長い値は読まない（壊れた・いたずらの URL で重くならないように）
const MAX_PARAM_LENGTH = 8000

function toBase64Url(text: string): string {
  let bin = ''
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): string {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)))
}

// URL から読んだ team の値。決まった文字（base64url）だけでできていなければ使わない（リンクに持ち回さない）
export const cleanTeamParam = (raw: string | null): string | null =>
  raw && raw.length <= MAX_PARAM_LENGTH && /^[A-Za-z0-9_-]+$/.test(raw) ? raw : null

// 約束が1つもなければ null（URLに team を付けない）
export function encodeTeamRules(rules: TeamRules): string | null {
  const r: TeamRules = {}
  for (const [id, text] of Object.entries(rules)) {
    const t = normalizeTeamRuleText(text)
    if (t) r[id] = t
  }
  if (Object.keys(r).length === 0) return null
  return toBase64Url(JSON.stringify({ v: VERSION, r }))
}

// 課題で出す問題（allowedIds）の約束だけを読む。読めない値は、エラーにせず「約束なし」として扱う
export function decodeTeamRules(param: string | null, allowedIds: readonly string[]): TeamRules {
  if (!cleanTeamParam(param)) return {}
  let v: unknown
  try {
    v = JSON.parse(fromBase64Url(param!))
  } catch {
    return {}
  }
  if (!v || typeof v !== 'object' || (v as { v?: unknown }).v !== VERSION) return {}
  const r = (v as { r?: unknown }).r
  if (!r || typeof r !== 'object' || Array.isArray(r)) return {}
  const out: TeamRules = {}
  for (const id of allowedIds) {
    if (!Object.hasOwn(r, id)) continue
    const text = (r as Record<string, unknown>)[id]
    if (typeof text !== 'string') continue
    const t = normalizeTeamRuleText(text)
    if (t) out[id] = t
  }
  return out
}

// 選んだ問題の約束だけを取り出す
export const pickTeamRules = (rules: TeamRules, ids: readonly string[]): TeamRules =>
  Object.fromEntries(ids.filter((id) => Object.hasOwn(rules, id) && rules[id]).map((id) => [id, rules[id]]))
