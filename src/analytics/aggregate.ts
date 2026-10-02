// 学習記録（attempt）の集計。attempts を受け取って、回数の事実だけを返す（保存場所は読まない。結果も保存しない）。
// 点数・正解率・偏差値・ランク・「得意／苦手」は作らない。
import type { Attempt } from '../storage/attempt.ts'
import type { Fit, ReasonQuality } from '../types/content.ts'

// これより少ない回答数では「最近の回答では〜」という傾向の文を出さない
export const MIN_ATTEMPTS_FOR_TREND = 3
// 傾向の文で見る「最近の回答」の数
export const RECENT_WINDOW = 5

export type FitCounts = Record<Fit, number>
export type QualityCounts = Record<ReasonQuality, number>
const zeroFits = (): FitCounts => ({ priority: 0, conditional: 0, situational: 0, low: 0 })
const zeroQualities = (): QualityCounts => ({ key: 0, supporting: 0, misconception: 0, irrelevant: 0 })

export type CueSummary = {
  cueId: string
  attempts: number // この手がかりが関係する問題の回答数（1問に複数の手がかりがあれば、それぞれに数える）
  lookKey: number // 見る問いで決め手の情報を選んだ回数
  lookOther: number // 見る問いでそれ以外を選んだ回数
  decisionFits: FitCounts
  recent: { attempts: number; lookKey: number; decisionPriority: number } | null // 回答数が少ない時は null
}

export type SetSummary = {
  setId: string
  attempts: number
  answeredQuestions: number // このセットから解いた問題の数（重複なし）
  lastCompletedAt: string
  // 各問題の最新の回答で、判断に「この状況で優先」を選んでいた問題の数
  latestPriorityQuestions: number
}

export type Aggregate = {
  totalAttempts: number
  distinctQuestions: number
  distinctSets: number
  lastCompletedAt: string | null
  look: { key: number; other: number }
  decision: FitCounts
  reaction: { attempts: number; fits: FitCounts }
  reasons: { selected: number; qualities: QualityCounts; supportsChosen: number }
  byCue: CueSummary[]
  bySet: SetSummary[]
  recent: Attempt[]
}

const byTime = (a: Attempt, b: Attempt) => a.completedAt.localeCompare(b.completedAt)

export function aggregate(attempts: readonly Attempt[], recentLimit = 10): Aggregate {
  const list = [...attempts].sort(byTime)
  const decision = zeroFits()
  const reactionFits = zeroFits()
  const qualities = zeroQualities()
  let reactionAttempts = 0
  let selected = 0
  let supportsChosen = 0
  let lookKey = 0

  for (const a of list) {
    if (a.look.value === 'key') lookKey++
    decision[a.decision.fit]++
    if (a.reaction) {
      reactionAttempts++
      reactionFits[a.reaction.fit]++
    }
    for (const r of a.reasons.items) {
      selected++
      qualities[r.quality]++
      if (r.supportsChosen) supportsChosen++
    }
  }

  // 手がかり別（解いた時点の問題の cues に、データどおり関連づける）
  const cueMap = new Map<string, Attempt[]>()
  for (const a of list) for (const c of new Set(a.cues)) cueMap.set(c, [...(cueMap.get(c) ?? []), a])
  const byCue: CueSummary[] = [...cueMap.entries()]
    .map(([cueId, as]) => {
      const fits = zeroFits()
      for (const a of as) fits[a.decision.fit]++
      const key = as.filter((a) => a.look.value === 'key').length
      const recentAs = as.slice(-RECENT_WINDOW)
      return {
        cueId,
        attempts: as.length,
        lookKey: key,
        lookOther: as.length - key,
        decisionFits: fits,
        recent:
          as.length >= MIN_ATTEMPTS_FOR_TREND
            ? { attempts: recentAs.length, lookKey: recentAs.filter((a) => a.look.value === 'key').length, decisionPriority: recentAs.filter((a) => a.decision.fit === 'priority').length }
            : null,
      }
    })
    .sort((x, y) => y.attempts - x.attempts || x.cueId.localeCompare(y.cueId))

  // セット別（セットから解いた記録だけ）
  const setMap = new Map<string, Attempt[]>()
  for (const a of list) if (a.setId) setMap.set(a.setId, [...(setMap.get(a.setId) ?? []), a])
  const bySet: SetSummary[] = [...setMap.entries()].map(([setId, as]) => {
    const latest = new Map<string, Attempt>()
    for (const a of as) latest.set(a.questionId, a) // 時刻順なので最後が最新
    return {
      setId,
      attempts: as.length,
      answeredQuestions: latest.size,
      lastCompletedAt: as[as.length - 1].completedAt,
      latestPriorityQuestions: [...latest.values()].filter((a) => a.decision.fit === 'priority').length,
    }
  })

  return {
    totalAttempts: list.length,
    distinctQuestions: new Set(list.map((a) => a.questionId)).size,
    distinctSets: setMap.size,
    lastCompletedAt: list.length ? list[list.length - 1].completedAt : null,
    look: { key: lookKey, other: list.length - lookKey },
    decision,
    reaction: { attempts: reactionAttempts, fits: reactionFits },
    reasons: { selected, qualities, supportsChosen },
    byCue,
    bySet: bySet.sort((x, y) => y.lastCompletedAt.localeCompare(x.lastCompletedAt)),
    recent: list.slice(-recentLimit).reverse(),
  }
}
