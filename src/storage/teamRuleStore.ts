// チームの約束の保存場所。localStorage に触れるのは src/storage/ だけ（画面は TeamRuleStore を通して使う）。
// 学習記録・レビュー記録とはキーを分け、互いに読み書き・削除しない。
import { browserStorage } from './attemptStore.ts'
import { TEAM_RULE_SCHEMA_VERSION, type TeamRuleEnvelope, type TeamRules, isTeamRuleRecord, normalizeTeamRuleText } from './teamRule.ts'

export const TEAM_RULE_STORAGE_KEY = 'basketball-iq:team-rules'
// 読み込めなかった記録を、消さずに退避しておく場所
export const TEAM_RULE_BACKUP_KEY_PREFIX = 'basketball-iq:team-rules:unreadable'

export type TeamRuleLoadResult =
  | { status: 'ok'; rules: TeamRules }
  | { status: 'unreadable'; rules: TeamRules; reason: 'broken-json' | 'unexpected-shape' | 'newer-version' }
  | { status: 'unavailable'; rules: TeamRules }
export type TeamRuleSaveResult = { ok: true } | { ok: false; reason: 'unavailable' | 'quota-or-error' | 'newer-version' }

export interface TeamRuleStore {
  load(): TeamRuleLoadResult
  // 1つの問題の約束を保存する。空の文なら、その問題の約束を消す
  save(questionId: string, text: string, now?: Date): TeamRuleSaveResult
  // チームの約束だけをすべて削除（学習記録・レビュー記録には触れない）
  deleteAll(): TeamRuleSaveResult
}

type Parsed = { kind: 'empty' } | { kind: 'ok'; envelope: TeamRuleEnvelope } | { kind: 'broken-json' | 'unexpected-shape' | 'newer-version'; raw: string }

function parse(raw: string | null): Parsed {
  if (raw === null) return { kind: 'empty' }
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return { kind: 'broken-json', raw }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { kind: 'unexpected-shape', raw }
  const env = v as Partial<TeamRuleEnvelope>
  if (typeof env.schemaVersion !== 'number' || !Array.isArray(env.rules)) return { kind: 'unexpected-shape', raw }
  if (env.schemaVersion > TEAM_RULE_SCHEMA_VERSION) return { kind: 'newer-version', raw }
  if (env.schemaVersion !== TEAM_RULE_SCHEMA_VERSION) return { kind: 'unexpected-shape', raw }
  return { kind: 'ok', envelope: env as TeamRuleEnvelope }
}

export function createTeamRuleStore(storage: Storage | null): TeamRuleStore {
  const read = (): Parsed => {
    try {
      return parse(storage!.getItem(TEAM_RULE_STORAGE_KEY))
    } catch {
      return { kind: 'unexpected-shape', raw: '' }
    }
  }
  const write = (rules: unknown[]): TeamRuleSaveResult => {
    try {
      storage!.setItem(TEAM_RULE_STORAGE_KEY, JSON.stringify({ schemaVersion: TEAM_RULE_SCHEMA_VERSION, rules }))
      return { ok: true }
    } catch {
      return { ok: false, reason: 'quota-or-error' }
    }
  }

  return {
    load() {
      if (!storage) return { status: 'unavailable', rules: {} }
      const p = read()
      if (p.kind === 'empty') return { status: 'ok', rules: {} }
      if (p.kind !== 'ok') return { status: 'unreadable', rules: {}, reason: p.kind }
      // 同じ問題の記録が2つ以上あれば、後ろ（新しく書いた方）を使う
      const rules: TeamRules = {}
      for (const r of p.envelope.rules.filter(isTeamRuleRecord)) rules[r.questionId] = normalizeTeamRuleText(r.text)
      return { status: 'ok', rules }
    },

    save(questionId, text, now = new Date()) {
      if (!storage) return { ok: false, reason: 'unavailable' }
      const p = read()
      if (p.kind === 'newer-version') return { ok: false, reason: 'newer-version' } // 新しい版の記録は上書きしない
      if (p.kind === 'broken-json' || p.kind === 'unexpected-shape') {
        try {
          let key = TEAM_RULE_BACKUP_KEY_PREFIX
          for (let i = 2; storage.getItem(key) !== null && storage.getItem(key) !== p.raw; i++) key = `${TEAM_RULE_BACKUP_KEY_PREFIX}:${i}`
          storage.setItem(key, p.raw)
        } catch {
          return { ok: false, reason: 'quota-or-error' }
        }
      }
      // 同じ問題の「使える記録」だけを置き換え、壊れた記録はそのまま残す
      const rest = p.kind === 'ok' ? p.envelope.rules.filter((r) => !(isTeamRuleRecord(r) && r.questionId === questionId)) : []
      const t = normalizeTeamRuleText(text)
      return write(t ? [...rest, { questionId, text: t, updatedAt: now.toISOString() }] : rest)
    },

    deleteAll() {
      if (!storage) return { ok: false, reason: 'unavailable' }
      try {
        const keys: string[] = []
        for (let i = 0; i < storage.length; i++) {
          const k = storage.key(i)
          if (k && (k === TEAM_RULE_STORAGE_KEY || k.startsWith(`${TEAM_RULE_STORAGE_KEY}:`))) keys.push(k)
        }
        for (const k of keys) storage.removeItem(k)
        return { ok: true }
      } catch {
        return { ok: false, reason: 'quota-or-error' }
      }
    },
  }
}

let defaultStore: TeamRuleStore | null = null
export function teamRuleStore(): TeamRuleStore {
  if (!defaultStore) defaultStore = createTeamRuleStore(browserStorage())
  return defaultStore
}
