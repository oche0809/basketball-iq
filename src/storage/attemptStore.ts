// 学習記録の保存場所。localStorage に触れるのはこのファイルだけ（画面は AttemptStore を通して使う）。
// 将来サーバーに保存する時は、同じ AttemptStore の形で別の実装を作って差し替える。
import { ATTEMPT_SCHEMA_VERSION, type Attempt, type AttemptEnvelope, isAttempt } from './attempt.ts'

export const STORAGE_KEY = 'basketball-iq:attempts'
// 読み込めなかった記録を、消さずに退避しておく場所
export const BACKUP_KEY_PREFIX = 'basketball-iq:attempts:unreadable'

export type LoadResult =
  | { status: 'ok'; attempts: Attempt[]; invalidCount: number } // invalidCount：形が壊れていて集計に使わなかった件数
  | { status: 'unreadable'; attempts: []; reason: 'broken-json' | 'unexpected-shape' | 'newer-version' }
  | { status: 'unavailable'; attempts: [] }
export type SaveResult = { ok: true } | { ok: false; reason: 'unavailable' | 'quota-or-error' | 'newer-version' }

export interface AttemptStore {
  load(): LoadResult
  save(attempt: Attempt): SaveResult
  deleteAll(): SaveResult
}

// localStorage そのものの取得。プライベートモードなどで触っただけで例外になることがあるので、ここで受け止める
export function browserStorage(): Storage | null {
  try {
    const s = globalThis.localStorage
    const probe = `${STORAGE_KEY}:probe`
    s.setItem(probe, '1')
    s.removeItem(probe)
    return s
  } catch {
    return null
  }
}

type Parsed = { kind: 'empty' } | { kind: 'ok'; envelope: AttemptEnvelope } | { kind: 'broken-json' | 'unexpected-shape' | 'newer-version'; raw: string }

function parse(raw: string | null): Parsed {
  if (raw === null) return { kind: 'empty' }
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return { kind: 'broken-json', raw }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { kind: 'unexpected-shape', raw }
  const env = v as Partial<AttemptEnvelope>
  if (typeof env.schemaVersion !== 'number' || !Array.isArray(env.attempts)) return { kind: 'unexpected-shape', raw }
  if (env.schemaVersion > ATTEMPT_SCHEMA_VERSION) return { kind: 'newer-version', raw }
  if (env.schemaVersion !== ATTEMPT_SCHEMA_VERSION) return { kind: 'unexpected-shape', raw }
  return { kind: 'ok', envelope: env as AttemptEnvelope }
}

export function createAttemptStore(storage: Storage | null): AttemptStore {
  const read = (): Parsed => {
    try {
      return parse(storage!.getItem(STORAGE_KEY))
    } catch {
      return { kind: 'unexpected-shape', raw: '' }
    }
  }
  const write = (envelope: AttemptEnvelope): SaveResult => {
    try {
      storage!.setItem(STORAGE_KEY, JSON.stringify(envelope))
      return { ok: true }
    } catch {
      return { ok: false, reason: 'quota-or-error' }
    }
  }

  return {
    load() {
      if (!storage) return { status: 'unavailable', attempts: [] }
      const p = read()
      if (p.kind === 'empty') return { status: 'ok', attempts: [], invalidCount: 0 }
      if (p.kind !== 'ok') return { status: 'unreadable', attempts: [], reason: p.kind }
      const valid = p.envelope.attempts.filter(isAttempt)
      return { status: 'ok', attempts: valid, invalidCount: p.envelope.attempts.length - valid.length }
    },

    save(attempt) {
      if (!storage) return { ok: false, reason: 'unavailable' }
      const p = read()
      // 新しい形式の記録（このアプリより新しい版で保存されたもの）は、上書きして壊さない
      if (p.kind === 'newer-version') return { ok: false, reason: 'newer-version' }
      if (p.kind === 'ok') return write({ schemaVersion: ATTEMPT_SCHEMA_VERSION, attempts: [...p.envelope.attempts, attempt] }) // 形の壊れた記録もそのまま残す
      if (p.kind === 'broken-json' || p.kind === 'unexpected-shape') {
        // 読めなかった記録は消さずに退避してから、新しい記録を始める
        try {
          let key = BACKUP_KEY_PREFIX
          for (let i = 2; storage.getItem(key) !== null && storage.getItem(key) !== p.raw; i++) key = `${BACKUP_KEY_PREFIX}:${i}`
          storage.setItem(key, p.raw)
        } catch {
          return { ok: false, reason: 'quota-or-error' }
        }
      }
      return write({ schemaVersion: ATTEMPT_SCHEMA_VERSION, attempts: [attempt] })
    },

    // 学習記録をすべて削除（退避した記録も含む）。学習記録以外のキーには触れない
    deleteAll() {
      if (!storage) return { ok: false, reason: 'unavailable' }
      try {
        const keys: string[] = []
        for (let i = 0; i < storage.length; i++) {
          const k = storage.key(i)
          if (k && (k === STORAGE_KEY || k.startsWith(BACKUP_KEY_PREFIX))) keys.push(k)
        }
        for (const k of keys) storage.removeItem(k)
        return { ok: true }
      } catch {
        return { ok: false, reason: 'quota-or-error' }
      }
    },
  }
}

// アプリで使う保存場所（ブラウザの localStorage）。最初に使う時に1回だけ用意する
let defaultStore: AttemptStore | null = null
export function attemptStore(): AttemptStore {
  if (!defaultStore) defaultStore = createAttemptStore(browserStorage())
  return defaultStore
}
