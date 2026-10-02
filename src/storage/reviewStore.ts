// レビュー記録の保存場所。localStorage に触れるのは src/storage/ だけ（画面は ReviewStore を通して使う）。
// 学習記録（basketball-iq:attempts）とはキーを分け、互いに読み書き・削除しない。
import { browserStorage } from './attemptStore.ts'
import { REVIEW_SCHEMA_VERSION, type ReviewEnvelope, type ReviewRecord, isReviewRecord, sameItem } from './review.ts'

export const REVIEW_STORAGE_KEY = 'basketball-iq:reviews'
// 読み込めなかったレビュー記録を、消さずに退避しておく場所
export const REVIEW_BACKUP_KEY_PREFIX = 'basketball-iq:reviews:unreadable'

export type ReviewLoadResult =
  | { status: 'ok'; records: ReviewRecord[]; invalidCount: number }
  | { status: 'unreadable'; records: []; reason: 'broken-json' | 'unexpected-shape' | 'newer-version' }
  | { status: 'unavailable'; records: [] }
export type ReviewSaveResult = { ok: true } | { ok: false; reason: 'unavailable' | 'quota-or-error' | 'newer-version' }

export interface ReviewStore {
  load(): ReviewLoadResult
  // 1つの教材のレビューを保存する（同じ教材の記録は置き換える）
  save(record: ReviewRecord): ReviewSaveResult
  // レビュー記録だけをすべて削除（学習記録やほかのキーには触れない）
  deleteAll(): ReviewSaveResult
}

type Parsed = { kind: 'empty' } | { kind: 'ok'; envelope: ReviewEnvelope } | { kind: 'broken-json' | 'unexpected-shape' | 'newer-version'; raw: string }

function parse(raw: string | null): Parsed {
  if (raw === null) return { kind: 'empty' }
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return { kind: 'broken-json', raw }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { kind: 'unexpected-shape', raw }
  const env = v as Partial<ReviewEnvelope>
  if (typeof env.schemaVersion !== 'number' || !Array.isArray(env.records)) return { kind: 'unexpected-shape', raw }
  if (env.schemaVersion > REVIEW_SCHEMA_VERSION) return { kind: 'newer-version', raw }
  if (env.schemaVersion !== REVIEW_SCHEMA_VERSION) return { kind: 'unexpected-shape', raw }
  return { kind: 'ok', envelope: env as ReviewEnvelope }
}

export function createReviewStore(storage: Storage | null): ReviewStore {
  const read = (): Parsed => {
    try {
      return parse(storage!.getItem(REVIEW_STORAGE_KEY))
    } catch {
      return { kind: 'unexpected-shape', raw: '' }
    }
  }
  const write = (envelope: ReviewEnvelope): ReviewSaveResult => {
    try {
      storage!.setItem(REVIEW_STORAGE_KEY, JSON.stringify(envelope))
      return { ok: true }
    } catch {
      return { ok: false, reason: 'quota-or-error' }
    }
  }

  return {
    load() {
      if (!storage) return { status: 'unavailable', records: [] }
      const p = read()
      if (p.kind === 'empty') return { status: 'ok', records: [], invalidCount: 0 }
      if (p.kind !== 'ok') return { status: 'unreadable', records: [], reason: p.kind }
      const valid = p.envelope.records.filter(isReviewRecord)
      // 同じ教材の記録が2つ以上あれば、後ろ（新しく書いた方）を使う
      const latest = new Map<string, ReviewRecord>()
      for (const r of valid) latest.set(`${r.itemType}|${r.itemId}`, r)
      return { status: 'ok', records: [...latest.values()], invalidCount: p.envelope.records.length - valid.length }
    },

    save(record) {
      if (!storage) return { ok: false, reason: 'unavailable' }
      const p = read()
      if (p.kind === 'newer-version') return { ok: false, reason: 'newer-version' } // 新しい版の記録は上書きしない
      if (p.kind === 'ok') {
        // 同じ教材の「使える記録」だけを置き換え、壊れた記録はそのまま残す
        const rest = p.envelope.records.filter((r) => !(isReviewRecord(r) && sameItem(r, record)))
        return write({ schemaVersion: REVIEW_SCHEMA_VERSION, records: [...rest, record] })
      }
      if (p.kind === 'broken-json' || p.kind === 'unexpected-shape') {
        try {
          let key = REVIEW_BACKUP_KEY_PREFIX
          for (let i = 2; storage.getItem(key) !== null && storage.getItem(key) !== p.raw; i++) key = `${REVIEW_BACKUP_KEY_PREFIX}:${i}`
          storage.setItem(key, p.raw)
        } catch {
          return { ok: false, reason: 'quota-or-error' }
        }
      }
      return write({ schemaVersion: REVIEW_SCHEMA_VERSION, records: [record] })
    },

    deleteAll() {
      if (!storage) return { ok: false, reason: 'unavailable' }
      try {
        const keys: string[] = []
        for (let i = 0; i < storage.length; i++) {
          const k = storage.key(i)
          if (k && (k === REVIEW_STORAGE_KEY || k.startsWith(`${REVIEW_STORAGE_KEY}:`))) keys.push(k)
        }
        for (const k of keys) storage.removeItem(k)
        return { ok: true }
      } catch {
        return { ok: false, reason: 'quota-or-error' }
      }
    },
  }
}

let defaultStore: ReviewStore | null = null
export function reviewStore(): ReviewStore {
  if (!defaultStore) defaultStore = createReviewStore(browserStorage())
  return defaultStore
}
