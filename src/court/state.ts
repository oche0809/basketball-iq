// コートの「その時点の状態」を、教材データの動き（court.steps）だけから機械的に計算する。
// 位置を推測で補うことはしない：
//   move / cut / dribble / screen … その選手を、データの to の座標へ移す
//   pass  … ボールを to の選手へ移す（位置は誰も動かさない）
//   shoot … ボールをリングへ（RIM は練習メニュー倉庫と同じ定数）
//   wait  … 何もしない
// 1つのステップの中の動きは同時に起きる（移動 → パス → シュートの順に反映）。
import type { Court, CourtAction, Point, Question } from '../types/content.ts'
import { RIM } from './geometry.ts'

export type Trail =
  | { kind: 'move' | 'cut' | 'dribble' | 'screen'; player: string; from: Point; to: Point }
  | { kind: 'pass'; from: string; to: string; fromPos: Point; toPos: Point }

export type CourtState = {
  step: number // 何ステップ目まで反映したか（0＝開始時）
  positions: Record<string, Point>
  ballHolder: string | null // null のときはボールがリングにある（シュート後）
  ballAt: Point | null
  trails: Trail[] // このステップ範囲で起きた動き（矢印の表示用）
  texts: string[] // 反映したステップの説明文（データの steps[].text）
}

const isMove = (a: CourtAction): a is Extract<CourtAction, { to: Point }> =>
  (a.type === 'move' || a.type === 'cut' || a.type === 'dribble' || a.type === 'screen') && typeof a.to === 'object'

// trailsFrom：この番号より後のステップの動きを trails に入れる（省略時は直前の1ステップ分）
export function courtStateAt(court: Court, step: number, trailsFrom?: number): CourtState {
  const last = Math.max(0, Math.min(step, court.steps.length))
  const from = Math.max(0, Math.min(trailsFrom ?? last - 1, last))
  const positions: Record<string, Point> = Object.fromEntries(court.players.map((p) => [p.id, { ...p.start }]))
  let ballHolder: string | null = court.ball
  let ballAt: Point | null = null
  const trails: Trail[] = []
  const texts: string[] = []

  for (let i = 0; i < last; i++) {
    const s = court.steps[i]
    texts.push(s.text)
    const before = Object.fromEntries(Object.entries(positions).map(([k, v]) => [k, { ...v }]))
    for (const a of s.actions) if (isMove(a)) positions[a.player] = { ...a.to }
    for (const a of s.actions) {
      if (a.type === 'pass') {
        ballHolder = a.to
        ballAt = null
        if (i >= from) trails.push({ kind: 'pass', from: a.from, to: a.to, fromPos: before[a.from], toPos: positions[a.to] })
      }
      if (a.type === 'shoot') {
        ballHolder = null
        ballAt = { ...RIM }
      }
    }
    if (i >= from) for (const a of s.actions) if (isMove(a)) trails.push({ kind: a.type, player: a.player, from: before[a.player], to: { ...a.to } })
  }
  return { step: last, positions, ballHolder, ballAt, trails, texts }
}

// 段階ごとに、どのステップまで反映するか。
// 'start'＝開始時、各段階＝その段階の show_until_step（指定がなければ直前の段階と同じ場面）、'end'＝最後まで
export type CourtMoment = 'start' | 'end' | string
export function stepForMoment(q: Question, moment: CourtMoment): number {
  const total = q.court?.steps.length ?? 0
  if (moment === 'start') return 0
  if (moment === 'end') return total
  let step = 0
  for (const s of q.stages) {
    if (s.show_until_step !== undefined) step = s.show_until_step
    if (s.id === moment) return Math.min(step, total)
  }
  return total
}

// 段階ごとのコートの状態。矢印は「前の段階の場面から、この段階の場面まで」に起きた動き
export function getCourtState(q: Question, moment: CourtMoment): CourtState | null {
  if (!q.court) return null
  const step = stepForMoment(q, moment)
  const ids = q.stages.map((s) => s.id)
  const idx = ids.indexOf(moment)
  let prevStep = 0
  if (moment === 'end') prevStep = stepForMoment(q, ids[ids.length - 1])
  else if (idx > 0) prevStep = stepForMoment(q, ids[idx - 1])
  // 前の段階と同じ場面なら、その場面に入るまでの直前の動きを見せる
  const trailsFrom = prevStep < step ? prevStep : Math.max(0, step - 1)
  return courtStateAt(q.court, step, trailsFrom)
}
