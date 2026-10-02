import type { Category, Difficulty } from '../types/content.ts'

// 画面に出す日本語の名前（教材の本文ではなく、表示用のラベルだけ）
export const CATEGORY_ORDER: Category[] = ['OFFENSE', 'DEFENSE', 'TRANSITION', 'ADVANTAGE', 'GAME_IQ']
export const CATEGORY_LABELS: Record<Category, string> = {
  OFFENSE: 'オフェンス',
  DEFENSE: 'ディフェンス',
  TRANSITION: 'トランジション',
  ADVANTAGE: '数的優位・ずれ',
  GAME_IQ: '時計・点差・ファウル',
}
export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  BEGINNER: '初級',
  INTERMEDIATE: '中級',
  ADVANCED: '上級',
}

// 問題セットの種類（データの kind）を、選手向けの短い説明にする
export const SET_KIND_LABELS: Record<string, string> = {
  DEFENSE_VARIATION: '攻撃は同じ。DFの動きだけが違う',
  CONTEXT_VARIATION: 'コートは同じ。時計や点差だけが違う',
  BALL_VARIATION: 'ボールの位置だけが違う',
  OFFENSE_VARIATION: '相手の特徴だけが違う',
  MIRROR: '同じ場面を攻撃側・守備側から見る',
  PROGRESSION: '同じ場面の続き',
}
export const gradeLabel = (grades: number[]) => grades.map((g) => `${g}年`).join('・')
