// COACH の教材一覧の絞り込み。キーワード・カテゴリー・難易度・学年は AND 条件。
// キーワードの正規化と条件の形は MAP と同じもの（utils/mapFilter.ts）を使う。
import type { Content, Question, QuestionSet } from '../types/content.ts'
import { type MapFilter, normalize } from '../utils/mapFilter.ts'

const terms = (q: string) => normalize(q).split(/\s+/).filter(Boolean)

// 検索の対象：問題ID・タイトル・状況・手がかり名
const questionText = (q: Question, cueName: (id: string) => string | undefined) =>
  normalize([q.id, q.title, q.situation, ...q.cues.map((c) => cueName(c) ?? '')].join(' '))

// 1問がすべての条件を満たすか
export function questionMatches(q: Question, f: MapFilter, cueName: (id: string) => string | undefined): boolean {
  if (f.cat && q.category !== f.cat) return false
  if (f.diff && q.difficulty !== f.diff) return false
  if (f.grade !== null && !q.grade.includes(f.grade)) return false
  const t = terms(f.q)
  if (t.length) {
    const text = questionText(q, cueName)
    if (!t.every((x) => text.includes(x))) return false
  }
  return true
}

export const filterQuestions = (c: Content, f: MapFilter) => c.questions.filter((q) => questionMatches(q, f, (id) => c.byId.cue.get(id)?.name))

// セットにはカテゴリー・難易度・学年のデータがないので、セットの問題で判定する：
// 「すべての条件を満たす問題が、セットの中に1問以上ある」セットを表示する（キーワードはセット名・説明も対象）
export function filterSets(c: Content, f: MapFilter): QuestionSet[] {
  const cueName = (id: string) => c.byId.cue.get(id)?.name
  return c.questionSets.filter((s) => {
    const qs = s.items.map((id) => c.byId.question.get(id)).filter((q): q is Question => !!q)
    const setText = normalize([s.id, s.title, s.intro].join(' '))
    const t = terms(f.q)
    const keywordInSet = t.length > 0 && t.every((x) => setText.includes(x))
    // キーワードがセット名・説明に当たる時は、キーワード以外の条件だけで問題を判定する
    const g = keywordInSet ? { ...f, q: '' } : f
    return qs.some((q) => questionMatches(q, g, cueName))
  })
}
