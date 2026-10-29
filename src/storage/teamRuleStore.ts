// チームの約束の保存場所。localStorage に触れるのは src/storage/ だけ（画面は TeamRuleStore を通して使う）。
// 学習記録・レビュー記録とはキーを分け、互いに読み書き・削除しない。
import { browserStorage } from './attemptStore.ts'
import {
  DEFAULT_PROFILE,
  TEAM_RULE_SCHEMA_VERSION,
  type TeamProfile,
  type TeamRuleEnvelope,
  type TeamRules,
  isTeamProfile,
  isTeamRuleRecord,
  normalizeProfileName,
  normalizeTeamRuleText,
} from './teamRule.ts'

export const TEAM_RULE_STORAGE_KEY = 'basketball-iq:team-rules'
// 読み込めなかった記録を、消さずに退避しておく場所
export const TEAM_RULE_BACKUP_KEY_PREFIX = 'basketball-iq:team-rules:unreadable'

// rules は「いつもの約束」。byProfile は 相手の ID → 約束（いつもの約束は DEFAULT_PROFILE）
type Loaded = { rules: TeamRules; profiles: TeamProfile[]; byProfile: Record<string, TeamRules> }
export type TeamRuleLoadResult =
  | ({ status: 'ok' } & Loaded)
  | ({ status: 'unreadable'; reason: 'broken-json' | 'unexpected-shape' | 'newer-version' } & Loaded)
  | ({ status: 'unavailable' } & Loaded)
export type TeamRuleSaveResult = { ok: true } | { ok: false; reason: 'unavailable' | 'quota-or-error' | 'newer-version' }
export type TeamProfileAddResult = { ok: true; id: string } | { ok: false; reason: 'unavailable' | 'quota-or-error' | 'newer-version' | 'empty-name' }
const empty = (): Loaded => { const rules: TeamRules = {}; return { rules, profiles: [], byProfile: { [DEFAULT_PROFILE]: rules } } }

export interface TeamRuleStore {
  load(): TeamRuleLoadResult
  // 1つの問題の約束を保存する。空の文なら、その問題の約束を消す。profile を省くと「いつもの約束」
  save(questionId: string, text: string, now?: Date, profile?: string): TeamRuleSaveResult
  // 相手ごとの約束を1つ足す（名前は相手の特徴。学校名・人の名前は書かない）
  addProfile(name: string, now?: Date): TeamProfileAddResult
  // 相手ごとの約束を、その相手の約束の文ごと消す（いつもの約束には触れない）
  deleteProfile(id: string): TeamRuleSaveResult
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
  const write = (rules: unknown[], profiles: unknown[] = []): TeamRuleSaveResult => {
    try {
      const env: TeamRuleEnvelope = profiles.length ? { schemaVersion: TEAM_RULE_SCHEMA_VERSION, rules, profiles } : { schemaVersion: TEAM_RULE_SCHEMA_VERSION, rules }
      storage!.setItem(TEAM_RULE_STORAGE_KEY, JSON.stringify(env))
      return { ok: true }
    } catch {
      return { ok: false, reason: 'quota-or-error' }
    }
  }

  const profilesOf = (env: TeamRuleEnvelope): unknown[] => (Array.isArray(env.profiles) ? env.profiles : [])
  // 書く前の準備：新しい版は上書きしない。読めない記録は消さずに別のキーへ退避する
  const prepare = (): { ok: true; p: Parsed } | { ok: false; reason: 'quota-or-error' | 'newer-version' } => {
    const p = read()
    if (p.kind === 'newer-version') return { ok: false, reason: 'newer-version' }
    if (p.kind === 'broken-json' || p.kind === 'unexpected-shape') {
      try {
        let key = TEAM_RULE_BACKUP_KEY_PREFIX
        for (let i = 2; storage!.getItem(key) !== null && storage!.getItem(key) !== p.raw; i++) key = `${TEAM_RULE_BACKUP_KEY_PREFIX}:${i}`
        storage!.setItem(key, p.raw)
      } catch {
        return { ok: false, reason: 'quota-or-error' }
      }
    }
    return { ok: true, p }
  }

  return {
    load() {
      if (!storage) return { status: 'unavailable', ...empty() }
      const p = read()
      if (p.kind === 'empty') return { status: 'ok', ...empty() }
      if (p.kind !== 'ok') return { status: 'unreadable', reason: p.kind, ...empty() }
      const profiles = profilesOf(p.envelope).filter(isTeamProfile).map((x) => ({ ...x, name: normalizeProfileName(x.name) }))
      const byProfile: Record<string, TeamRules> = { [DEFAULT_PROFILE]: {} }
      for (const x of profiles) byProfile[x.id] = {}
      // 同じ問題の記録が2つ以上あれば、後ろ（新しく書いた方）を使う。消えた相手の記録は使わない
      for (const r of p.envelope.rules.filter(isTeamRuleRecord)) {
        const target = byProfile[r.profile ?? DEFAULT_PROFILE]
        if (target) target[r.questionId] = normalizeTeamRuleText(r.text)
      }
      return { status: 'ok', rules: byProfile[DEFAULT_PROFILE], profiles, byProfile }
    },

    save(questionId, text, now = new Date(), profile = DEFAULT_PROFILE) {
      if (!storage) return { ok: false, reason: 'unavailable' }
      const prep = prepare()
      if (!prep.ok) return prep
      const p = prep.p
      const profiles = p.kind === 'ok' ? profilesOf(p.envelope) : []
      if (profile !== DEFAULT_PROFILE && !profiles.some((x) => isTeamProfile(x) && x.id === profile)) return { ok: false, reason: 'quota-or-error' }
      // 同じ相手・同じ問題の「使える記録」だけを置き換え、壊れた記録はそのまま残す
      const rest = p.kind === 'ok' ? p.envelope.rules.filter((r) => !(isTeamRuleRecord(r) && r.questionId === questionId && (r.profile ?? DEFAULT_PROFILE) === profile)) : []
      const t = normalizeTeamRuleText(text)
      const rec = profile === DEFAULT_PROFILE ? { questionId, text: t, updatedAt: now.toISOString() } : { questionId, text: t, updatedAt: now.toISOString(), profile }
      return write(t ? [...rest, rec] : rest, profiles)
    },

    addProfile(name, now = new Date()) {
      if (!storage) return { ok: false, reason: 'unavailable' }
      const n = normalizeProfileName(name)
      if (!n) return { ok: false, reason: 'empty-name' }
      const prep = prepare()
      if (!prep.ok) return prep
      const p = prep.p
      const rules = p.kind === 'ok' ? p.envelope.rules : []
      const profiles = p.kind === 'ok' ? profilesOf(p.envelope) : []
      const used = new Set(profiles.filter(isTeamProfile).map((x) => x.id))
      let id = `p-${now.getTime().toString(36)}`
      for (let i = 2; used.has(id); i++) id = `p-${now.getTime().toString(36)}-${i}`
      const r = write(rules, [...profiles, { id, name: n, createdAt: now.toISOString() }])
      return r.ok ? { ok: true, id } : r
    },

    deleteProfile(id) {
      if (!storage) return { ok: false, reason: 'unavailable' }
      if (id === DEFAULT_PROFILE) return { ok: false, reason: 'quota-or-error' }
      const prep = prepare()
      if (!prep.ok) return prep
      const p = prep.p
      if (p.kind !== 'ok') return { ok: true }
      const rules = p.envelope.rules.filter((r) => !(isTeamRuleRecord(r) && r.profile === id))
      return write(rules, profilesOf(p.envelope).filter((x) => !(isTeamProfile(x) && x.id === id)))
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
