// もう一度解いてみる問題（見直しの目安）。各問題の一番新しい回答だけを見て、事実で選ぶ。
// 点数・「苦手」などのラベルは作らない。解き直して当たらなくなれば、自然に外れる。結果は保存しない。
import type { Attempt } from '../storage/attempt.ts'

// look：見る問いで決め手の情報を選んでいなかった
// decision：判断で〈この状況では優先度が低い〉を選んでいた
// reason：「なぜ」で〈思い込み〉の理由を選んでいた
export type RetryReason = 'look' | 'decision' | 'reason'
export const RETRY_REASONS: RetryReason[] = ['look', 'decision', 'reason']

export type RetryCandidate = {
  questionId: string
  completedAt: string // 一番新しい回答の日時
  reasons: RetryReason[]
}

export function retryReasonsOf(a: Attempt): RetryReason[] {
  const r: RetryReason[] = []
  if (a.look.value !== 'key') r.push('look')
  if (a.decision.fit === 'low') r.push('decision')
  if (a.reasons.items.some((i) => i.quality === 'misconception')) r.push('reason')
  return r
}

// exists：今の教材にある問題か（教材から外れた問題は出さない）。新しく解いた順に並べる
export function retryCandidates(attempts: readonly Attempt[], exists: (questionId: string) => boolean): RetryCandidate[] {
  const latest = new Map<string, Attempt>()
  for (const a of attempts) {
    const prev = latest.get(a.questionId)
    if (!prev || prev.completedAt <= a.completedAt) latest.set(a.questionId, a)
  }
  return [...latest.values()]
    .filter((a) => exists(a.questionId))
    .map((a) => ({ questionId: a.questionId, completedAt: a.completedAt, reasons: retryReasonsOf(a) }))
    .filter((x) => x.reasons.length > 0)
    .sort((x, y) => y.completedAt.localeCompare(x.completedAt) || x.questionId.localeCompare(y.questionId))
}
