// コート図の座標変換と、描画する内容（モデル）の計算。
// 座標は練習メニュー倉庫と同じ：データは x・y とも 0〜100（x：左→右、y：エンドライン→ハーフライン）。
// 図は 150×140（1単位＝10cm。横15m・縦14m のハーフコート）に変換する。座標を作り直したり補ったりはしない。
import type { Court, Hud, Point } from '../types/content.ts'

export const W = 150
export const H = 140
export const PLAYER_R = 5
export const RIM: Point = { x: 50, y: 11.25 }

export const toSvg = (p: Point) => ({ x: (p.x / 100) * W, y: (p.y / 100) * H })

export type CourtPlayerShape = {
  id: string
  label: string
  team: 'offense' | 'defense' | 'neutral'
  x: number
  y: number
  isYou: boolean
}
export type CourtModel = {
  players: CourtPlayerShape[]
  ball: { x: number; y: number; holder: string } | null
  hud: Hud | null
  showMiddleLine: boolean
}

// positions：その瞬間の各選手の位置（データ座標）。省略すると開始時の配置。
// 将来のアニメーションは、ステップごとに positions と ballHolder を計算して渡すだけでよい。
// ballHolder に null を渡すとボールは誰も持たず、ballAt（データ座標。例：シュート後のリング）に描く。
export function courtModel(court: Court, positions?: Record<string, Point>, ballHolder?: string | null, ballAt?: Point | null): CourtModel {
  const players = court.players.map((p) => {
    const pos = toSvg(positions?.[p.id] ?? p.start)
    return { id: p.id, label: p.label, team: p.team, x: pos.x, y: pos.y, isYou: p.id === court.you }
  })
  const holderId = ballHolder === undefined ? court.ball : ballHolder
  const holder = holderId ? players.find((p) => p.id === holderId) : undefined
  const free = !holder && ballAt ? toSvg(ballAt) : null
  return {
    players,
    // ボールは持っている選手の右上に小さく描く（データの位置は変えない）
    ball: holder
      ? { x: holder.x + PLAYER_R * 0.85, y: holder.y - PLAYER_R * 0.85, holder: holder.id }
      : free
        ? { x: free.x, y: free.y, holder: '' }
        : null,
    hud: court.hud ?? null,
    showMiddleLine: !!court.show_middle_line,
  }
}
