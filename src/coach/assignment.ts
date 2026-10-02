// 課題URL。URLに入れるのは、教材を特定するID（セットIDか問題ID）だけ。
// 名前・学校名・メール・回答・端末の記録などは入れない。
import type { AttemptSource } from '../storage/attempt.ts'

export type AssignmentTarget = { type: 'set' | 'question'; id: string }

// ハッシュの道（#/play/assignment/set/<セットID>、#/play/assignment/q/<問題ID>）
export function assignmentPath(t: AssignmentTarget): string {
  return `#/play/assignment/${t.type === 'set' ? 'set' : 'q'}/${encodeURIComponent(t.id)}`
}

// 配る用の完全なURL。今のページの ? 以降（検索・確認用の文字など）は持ち込まない
export function assignmentUrl(pageUrl: string, t: AssignmentTarget): string {
  const u = new URL(pageUrl)
  return `${u.origin}${u.pathname}${assignmentPath(t)}`
}

// #/play/assignment/... の segments（['play','assignment','set',ID]）から、課題の指定を読む
export function parseAssignment(segments: string[]): AssignmentTarget | null {
  if (segments[0] !== 'play' || segments[1] !== 'assignment') return null
  const kind = segments[2]
  const raw = segments[3]
  if (!raw || (kind !== 'set' && kind !== 'q')) return null
  let id = raw
  try {
    id = decodeURIComponent(raw)
  } catch {
    // 壊れたエンコードはそのまま（見つからない ID として扱う）
  }
  return { type: kind === 'set' ? 'set' : 'question', id }
}

// 課題から解いた時に attempt に残す source（評価・集計には使わない）
export const assignmentSource = (t: AssignmentTarget): AttemptSource => ({ type: 'assignment', assignmentType: t.type, assignmentId: t.id })

type ClipboardLike = { writeText(text: string): Promise<void> } | undefined
// クリップボードへコピー。使えない・失敗した時は false を返す（例外にしない）
export async function copyText(text: string, clipboard: ClipboardLike = globalThis.navigator?.clipboard): Promise<boolean> {
  try {
    if (!clipboard?.writeText) return false
    await clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
