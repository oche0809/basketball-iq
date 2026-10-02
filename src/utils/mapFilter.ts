// MAP の検索・絞り込み（キーワード・カテゴリー・難易度・学年は AND 条件）
import type { Category, CurriculumItem, Difficulty } from '../types/content.ts'

export type MapFilter = { q: string; cat: Category | ''; diff: Difficulty | ''; grade: number | null }
export const EMPTY_FILTER: MapFilter = { q: '', cat: '', diff: '', grade: null }

const DIFFICULTY_ORDER: Difficulty[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED']
const CATEGORIES: Category[] = ['OFFENSE', 'DEFENSE', 'TRANSITION', 'ADVANTAGE', 'GAME_IQ']

// 全角・半角、大文字・小文字の違いを無視する
export const normalize = (s: string) => s.normalize('NFKC').toLowerCase()

// 検索の対象：項目名・学習目標・状況・分類・見る問い・判断の問い・手がかり名・ID
export function searchText(item: CurriculumItem, cueName: (id: string) => string | undefined): string {
  return normalize(
    [
      item.id,
      item.title,
      item.subcategory,
      item.learning_goal,
      item.situation,
      item.sample_questions.recognition,
      item.sample_questions.decision,
      ...item.cues.map((c) => cueName(c) ?? ''),
    ].join(' '),
  )
}

export function filterCurriculum(items: CurriculumItem[], f: MapFilter, cueName: (id: string) => string | undefined): CurriculumItem[] {
  const terms = normalize(f.q).split(/\s+/).filter(Boolean)
  return items.filter((it) => {
    if (f.cat && it.category !== f.cat) return false
    if (f.diff && it.difficulty !== f.diff) return false
    if (f.grade !== null && !it.grade.includes(f.grade)) return false
    if (terms.length) {
      const text = searchText(it, cueName)
      if (!terms.every((t) => text.includes(t))) return false
    }
    return true
  })
}

// 選択肢はデータにある値だけ（存在しない難易度・学年は出さない）
// カリキュラムの項目にも問題にも使える（難易度・学年を持つものなら何でも）
export const difficultiesIn = (items: readonly { difficulty: Difficulty }[]) => DIFFICULTY_ORDER.filter((d) => items.some((i) => i.difficulty === d))
export const gradesIn = (items: readonly { grade: number[] }[]) => [...new Set(items.flatMap((i) => i.grade))].sort((a, b) => a - b)

// URL（#/map?q=…&cat=…&diff=…&grade=…）との変換。直接開いても・戻っても同じ条件になる
export function filterFromParams(p: URLSearchParams): MapFilter {
  const cat = p.get('cat') ?? ''
  const diff = p.get('diff') ?? ''
  const grade = Number(p.get('grade'))
  return {
    q: p.get('q') ?? '',
    cat: (CATEGORIES as string[]).includes(cat) ? (cat as Category) : '',
    diff: (DIFFICULTY_ORDER as string[]).includes(diff) ? (diff as Difficulty) : '',
    grade: Number.isInteger(grade) && grade > 0 ? grade : null,
  }
}
export function filterToQuery(f: MapFilter): string {
  const p = new URLSearchParams()
  if (f.q) p.set('q', f.q)
  if (f.cat) p.set('cat', f.cat)
  if (f.diff) p.set('diff', f.diff)
  if (f.grade !== null) p.set('grade', String(f.grade))
  const s = p.toString()
  return s ? `?${s}` : ''
}
