// 1問の回答状態（その画面の中だけで持つ。保存は STEP 6）。
// 見る・判断・理由・相手の反応を別々に持ち、1つの正誤や点数にまとめない。STEP 6 ではこの形をそのまま記録できる。
import type { Question, Stage } from '../types/content.ts'

export type QuestionAnswer = {
  look: string | null // 見る（RECOGNITION）で決定した選択肢ID
  decision: string | null // 判断（DECISION）で決定した選択肢ID
  reasons: string[] // なぜ（REASON）で決定した理由ID（最大 max_select 個）
  reasonsConfirmed: boolean
  reaction: string | null // 相手の反応 → 次の判断（REACTION）。ない問題もある
  stageIndex: number // いま表示している段階（stages の番号。stages.length＝解説）
}

export const emptyAnswer = (): QuestionAnswer => ({ look: null, decision: null, reasons: [], reasonsConfirmed: false, reaction: null, stageIndex: 0 })

// 理由の選択：選んでいれば外す。上限に達していれば追加しない（3つ目は選べない）
export function toggleReason(selected: string[], id: string, max: number): string[] {
  if (selected.includes(id)) return selected.filter((x) => x !== id)
  if (selected.length >= max) return selected
  return [...selected, id]
}

// その段階に答え終わっているか
export function isStageAnswered(stage: Stage, a: QuestionAnswer): boolean {
  switch (stage.kind) {
    case 'RECOGNITION':
      return a.look !== null
    case 'DECISION':
      return a.decision !== null
    case 'REASON':
      return a.reasonsConfirmed && a.reasons.length > 0
    case 'REACTION':
      return a.reaction !== null
  }
}

// 段階に答えを入れる（一度決めた答えは変えない：解説を見てから直すことを防ぐ）
export function answerStage(stage: Stage, a: QuestionAnswer, value: string | string[]): QuestionAnswer {
  if (isStageAnswered(stage, a)) return a
  switch (stage.kind) {
    case 'RECOGNITION':
      return { ...a, look: value as string }
    case 'DECISION':
      return { ...a, decision: value as string }
    case 'REASON':
      return { ...a, reasons: (value as string[]).slice(0, stage.max_select), reasonsConfirmed: true }
    case 'REACTION':
      return { ...a, reaction: value as string }
  }
}

// 次の段階へ進めるのは、今の段階に答え終わった時だけ
export function canAdvance(q: Question, a: QuestionAnswer): boolean {
  const stage = q.stages[a.stageIndex]
  return !!stage && isStageAnswered(stage, a)
}
export const isFinished = (q: Question, a: QuestionAnswer) => q.stages.every((s) => isStageAnswered(s, a))
