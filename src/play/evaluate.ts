// 回答の評価。見る・判断・理由を別々に評価し、1つの点数や正誤にまとめない（docs/02_design.md 2〜4章）。
// 表示の言葉は設計書の表のとおり。教材の本文（feedback・condition など）はデータからそのまま使う。
import type { DecisionOption, Fit, ReasonOption, ReasonQuality, ReasonStage, RecognitionOption, RecognitionValue } from '../types/content.ts'

export const RECOGNITION_LABELS: Record<RecognitionValue, string> = {
  key: 'ここを見ることが、判断の決め手になる',
  useful: '役に立つ情報。でも決め手は別にある',
  not_now: '大事な情報。でも、この瞬間に見るものではない',
  irrelevant: 'この判断には関係ない（または、この場面では起きていない）',
}
export const FIT_LABELS: Record<Fit, string> = {
  priority: 'この状況で優先',
  conditional: '条件付きで有効',
  situational: '状況によっては有効',
  low: 'この状況では優先度が低い',
}
export const QUALITY_LABELS: Record<ReasonQuality, string> = {
  key: '決め手',
  supporting: '補助',
  misconception: '思い込み',
  irrelevant: '無関係',
}

export type ReasonResult = {
  option: ReasonOption
  quality: ReasonQuality
  // この理由が、あなたの選んだ判断を説明しているか（データの supports で判定。データにない対応は作らない）
  supportsChosen: boolean
  // 決め手・補助の理由なのに、別の判断を説明している（判断と理由が合っていない）
  supportsOtherOnly: boolean
}

export type Diagnosis =
  | 'READ_AND_REASONED' // 判断も理由も的確
  | 'KEY_WITH_NOISE' // 決め手の理由は選べている。ただし思い込み・無関係の理由も選んだ
  | 'REASON_MISMATCH' // 判断と理由が合っていない
  | 'RIGHT_BUT_MISCONCEPTION' // 判断はこの状況で優先。でも理由が思い込み
  | 'RIGHT_BUT_IRRELEVANT' // 判断はこの状況で優先。でも理由が状況と関係ない
  | 'RIGHT_SUPPORTING_ONLY' // 判断はこの状況で優先。決め手は別にある
  | 'CONDITIONAL_CONSISTENT' // 条件付き・状況次第の判断を、その判断を支える理由で選んだ
  | 'CONDITIONAL_UNSUPPORTED' // 条件付き・状況次第の判断。理由がその判断を支えていない
  | 'LOW_PRIORITY' // この状況では優先度が低い判断

export const DIAGNOSIS_LABELS: Record<Diagnosis, { title: string; text: string }> = {
  READ_AND_REASONED: { title: '判断も理由も的確', text: '状況の決め手を見て、判断を選べています。' },
  KEY_WITH_NOISE: { title: '決め手の理由は選べている', text: 'ただし、決め手ではない理由も一緒に選んでいます。どれが決め手かを確かめよう。' },
  REASON_MISMATCH: { title: '判断と理由が合っていない', text: '選んだ理由は、別の判断を説明する理由です。' },
  RIGHT_BUT_MISCONCEPTION: { title: '判断は合っているが、理由が思い込み', text: 'いつも同じ答えになるわけではありません。相手の動きを見て決めよう。' },
  RIGHT_BUT_IRRELEVANT: { title: '判断は合っているが、理由が状況と関係ない', text: 'この場面で何を見たかを、もう一度確かめよう。' },
  RIGHT_SUPPORTING_ONLY: { title: '判断は良い。決め手は別にある', text: '選んだ理由も正しいですが、決め手となる手がかりは別にあります。' },
  CONDITIONAL_CONSISTENT: { title: 'その判断が有効になる条件を確かめよう', text: '理由はその判断を説明しています。この場面で、その条件が成り立っているかを確かめよう。' },
  CONDITIONAL_UNSUPPORTED: { title: 'その判断が有効になる条件を確かめよう', text: '選んだ理由は、その判断を説明していません。' },
  LOW_PRIORITY: { title: 'この状況では優先度が低い判断', text: '解説で、この場面で優先する判断と、その決め手を確かめよう。' },
}

export const findOption = <T extends { id: string }>(options: T[], id: string | null) => (id ? options.find((o) => o.id === id) ?? null : null)

export function evaluateRecognition(options: RecognitionOption[], choiceId: string) {
  const o = findOption(options, choiceId)
  return o ? { option: o, value: o.value, label: RECOGNITION_LABELS[o.value] } : null
}

export function evaluateDecision(options: DecisionOption[], choiceId: string) {
  const o = findOption(options, choiceId)
  return o ? { option: o, fit: o.fit, label: FIT_LABELS[o.fit], condition: o.condition ?? null } : null
}

const SUPPORTIVE: ReasonQuality[] = ['key', 'supporting']

export function evaluateReasons(stage: ReasonStage, decisionId: string, reasonIds: string[]): ReasonResult[] {
  return reasonIds
    .map((id) => findOption(stage.options, id))
    .filter((o): o is ReasonOption => !!o)
    .map((o) => {
      const supportsChosen = o.supports.includes(decisionId)
      return {
        option: o,
        quality: o.quality,
        supportsChosen,
        supportsOtherOnly: SUPPORTIVE.includes(o.quality) && o.supports.length > 0 && !supportsChosen,
      }
    })
}

// 判断（データの fit）と理由（データの quality・supports）の組み合わせから、設計書 3-3 の表で診断する
export function diagnose(fit: Fit, reasons: ReasonResult[]): Diagnosis {
  if (fit === 'low') return 'LOW_PRIORITY'
  const supportsChosen = reasons.some((r) => SUPPORTIVE.includes(r.quality) && r.supportsChosen)
  if (fit === 'conditional' || fit === 'situational') return supportsChosen ? 'CONDITIONAL_CONSISTENT' : 'CONDITIONAL_UNSUPPORTED'
  const keyForChosen = reasons.some((r) => r.quality === 'key' && r.supportsChosen)
  const noise = reasons.some((r) => r.quality === 'misconception' || r.quality === 'irrelevant')
  if (keyForChosen) return noise ? 'KEY_WITH_NOISE' : 'READ_AND_REASONED'
  if (reasons.some((r) => r.supportsOtherOnly)) return 'REASON_MISMATCH'
  if (reasons.some((r) => r.quality === 'misconception')) return 'RIGHT_BUT_MISCONCEPTION'
  if (reasons.some((r) => r.quality === 'irrelevant')) return 'RIGHT_BUT_IRRELEVANT'
  return 'RIGHT_SUPPORTING_ONLY'
}
