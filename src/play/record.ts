// 解き終えた1問の回答から、学習記録（attempt）を作って保存する。
// 評価は STEP 5 の evaluate.ts をそのまま使う（新しい評価基準は作らない）。保存場所には直接触れない（保存は AttemptStore）。
import { type Attempt, type AttemptSource, type ChoiceRecord, newAttemptId } from '../storage/attempt.ts'
import type { AttemptStore, SaveResult } from '../storage/attemptStore.ts'
import type { DecisionOption, Question, ReasonStage, RecognitionStage } from '../types/content.ts'
import { type QuestionAnswer, isFinished } from './answer.ts'
import { diagnose, evaluateDecision, evaluateReasons, evaluateRecognition } from './evaluate.ts'

// source を省略した時は、通常の PLAY から解いたもの（practice）として記録する
export type AttemptContext = { setId: string | null; questionIndex: number | null; source?: AttemptSource }

// 1問を解説まで終えたか（最後の段階まで答え、解説を表示した）
export const isCompleted = (q: Question, a: QuestionAnswer) => a.stageIndex >= q.stages.length && isFinished(q, a)

const choiceRecord = (options: DecisionOption[], id: string): ChoiceRecord => {
  const e = evaluateDecision(options, id)
  if (!e) throw new Error(`選択肢がありません：${id}`)
  return { selectedChoiceId: id, fit: e.fit, hasCondition: e.condition !== null }
}

export function buildAttempt(q: Question, a: QuestionAnswer, ctx: AttemptContext, now: Date, attemptId: string = newAttemptId()): Attempt {
  if (!isCompleted(q, a)) throw new Error('解説まで終えていない回答は記録しない')
  const see = q.stages.find((s): s is RecognitionStage => s.kind === 'RECOGNITION')!
  const dec = q.stages.find((s) => s.kind === 'DECISION')!
  const why = q.stages.find((s): s is ReasonStage => s.kind === 'REASON')!
  const react = q.stages.find((s) => s.kind === 'REACTION')
  const look = evaluateRecognition(see.options, a.look!)!
  const decision = choiceRecord(dec.options, a.decision!)
  const reasons = evaluateReasons(why, a.decision!, a.reasons)
  return {
    attemptId,
    completedAt: now.toISOString(),
    questionId: q.id,
    setId: ctx.setId,
    questionIndex: ctx.questionIndex,
    contentVersion: null,
    contentSchemaVersion: q.schema_version,
    questionUpdatedAt: q.updated_at,
    category: q.category,
    cues: [...q.cues],
    look: { selectedChoiceId: a.look!, value: look.value, cueId: look.option.cue_id ?? null },
    decision,
    reasons: {
      selectedReasonIds: [...a.reasons],
      items: reasons.map((r) => ({ reasonId: r.option.id, quality: r.quality, supports: [...r.option.supports], supportsChosen: r.supportsChosen })),
      diagnosis: diagnose(decision.fit, reasons),
    },
    reaction: react && a.reaction ? choiceRecord(react.options, a.reaction) : null,
    source: ctx.source ?? { type: 'practice' },
  }
}

export type RecordOutcome = { status: 'saved'; attempt: Attempt } | { status: 'failed'; reason: Exclude<SaveResult, { ok: true }>['reason'] } | { status: 'skipped' }

// 二重保存を防ぐ記録係。「1回解いたこと」ごとの鍵（sessionKey）で、1回だけ保存する。
// 同じ問題をもう一度最初から解いた時は、別の鍵になるので別の記録になる（上書きしない）。
export function createRecorder(store: AttemptStore, clock: () => Date = () => new Date()) {
  const done = new Map<string, RecordOutcome>()
  return {
    complete(sessionKey: string, q: Question, a: QuestionAnswer, ctx: AttemptContext): RecordOutcome {
      const prev = done.get(sessionKey)
      if (prev) return prev.status === 'saved' ? { status: 'skipped' } : prev
      if (!isCompleted(q, a)) return { status: 'skipped' }
      const attempt = buildAttempt(q, a, ctx, clock())
      let outcome: RecordOutcome
      try {
        const r = store.save(attempt)
        outcome = r.ok ? { status: 'saved', attempt } : { status: 'failed', reason: r.reason }
      } catch {
        outcome = { status: 'failed', reason: 'quota-or-error' }
      }
      done.set(sessionKey, outcome)
      return outcome
    },
  }
}
