import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildContent } from '../src/content/load.ts'
import { RIM } from '../src/court/geometry.ts'
import { courtStateAt, getCourtState, stepForMoment } from '../src/court/state.ts'
import { answerStage, canAdvance, emptyAnswer, isFinished, isStageAnswered, toggleReason } from '../src/play/answer.ts'
import { DIAGNOSIS_LABELS, FIT_LABELS, QUALITY_LABELS, diagnose, evaluateDecision, evaluateReasons } from '../src/play/evaluate.ts'
import { orderedItems } from '../src/play/setOrder.ts'
import { optionSeed, seededShuffle } from '../src/play/shuffle.ts'
import type { DecisionStage, Question, ReasonStage, Stage } from '../src/types/content.ts'
import { readRawContent } from '../scripts/read-data.ts'

const c = buildContent(readRawContent())
const q = (id: string) => c.byId.question.get(id)!
const stage = <T>(id: string, kind: string) => q(id).stages.find((s) => s.kind === kind) as T

// ソースコード全体（src/）のテキスト
function srcFiles(dir = join(import.meta.dirname, '..', 'src')): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? srcFiles(p) : [p]
  })
}
// 段階の選択肢（種類によって型が違うので、ID と文だけの形で扱う）
const opts = (s: Stage) => s.options as { id: string; text: string }[]
const SRC = srcFiles().map((f) => ({ f, text: readFileSync(f, 'utf8') }))

// 1問を最後まで解く（各段階で、並び替えた後の先頭の選択肢を選ぶ）
function solve(question: Question) {
  let a = emptyAnswer()
  for (let i = 0; i < question.stages.length; i++) {
    const s = question.stages[i]
    expect(a.stageIndex).toBe(i)
    expect(canAdvance(question, a)).toBe(false)
    const first = seededShuffle(opts(s), optionSeed(question.id, s.id))[0].id
    a = answerStage(s, a, s.kind === 'REASON' ? [first] : first)
    expect(isStageAnswered(s, a)).toBe(true)
    expect(canAdvance(question, a)).toBe(true)
    a = { ...a, stageIndex: i + 1 }
  }
  return a
}

describe('回答の流れ（見る → 判断 → なぜ →（次の判断）→ 解説）', () => {
  it('17問すべてが最初の段階から解説まで進める', () => {
    expect(c.questions).toHaveLength(17)
    for (const question of c.questions) {
      const a = solve(question)
      expect(isFinished(question, a), question.id).toBe(true)
      expect(a.stageIndex).toBe(question.stages.length) // ＝解説
    }
  })
  it('全問で「見る」「判断」「なぜ」が別々の段階として、この順にある', () => {
    for (const question of c.questions) {
      const kinds = question.stages.map((s) => s.kind)
      expect(kinds.indexOf('RECOGNITION')).toBeLessThan(kinds.indexOf('DECISION'))
      expect(kinds.indexOf('DECISION')).toBeLessThan(kinds.indexOf('REASON'))
    }
  })
  it('理由は2つまで。3つ目は選べず、選んだ理由は外せる', () => {
    let sel: string[] = []
    sel = toggleReason(sel, 'r1', 2)
    sel = toggleReason(sel, 'r2', 2)
    expect(sel).toEqual(['r1', 'r2'])
    expect(toggleReason(sel, 'r3', 2)).toEqual(['r1', 'r2'])
    expect(toggleReason(sel, 'r1', 2)).toEqual(['r2'])
    for (const question of c.questions) expect((question.stages.find((s) => s.kind === 'REASON') as ReasonStage).max_select).toBe(2)
  })
  it('理由を3つ渡しても、記録されるのは上限の2つまで', () => {
    const why = stage<ReasonStage>('OF-DRV-01-B', 'REASON')
    expect(answerStage(why, emptyAnswer(), ['r1', 'r2', 'r3']).reasons).toEqual(['r1', 'r2'])
  })
  it('段階を戻っても回答は残り、一度決めた答えは変わらない', () => {
    const question = q('OF-DRV-01-B')
    const see = question.stages[0]
    let a = answerStage(see, emptyAnswer(), 's1')
    a = { ...a, stageIndex: 1 }
    a = { ...a, stageIndex: 0 } // 戻る
    expect(a.look).toBe('s1')
    expect(answerStage(see, a, 's2').look).toBe('s1')
  })
  it('見る・判断・理由は別々に持ち、1つの点数や正誤にまとめない', () => {
    expect(Object.keys(emptyAnswer()).sort()).toEqual(['decision', 'look', 'reaction', 'reasons', 'reasonsConfirmed', 'stageIndex'])
  })
})

describe('選択肢の並び順（決定的なシャッフル）', () => {
  it('同じ問題・同じ段階なら、何度並べても同じ順', () => {
    for (const question of c.questions)
      for (const s of question.stages) {
        const a = seededShuffle(opts(s), optionSeed(question.id, s.id)).map((o) => o.id)
        const b = seededShuffle(opts(s), optionSeed(question.id, s.id)).map((o) => o.id)
        expect(a).toEqual(b)
      }
  })
  it('並べ替えても、選択肢のIDと文の組み合わせは変わらない（入れ替わるのは順番だけ）', () => {
    for (const question of c.questions)
      for (const s of question.stages) {
        const shuffled = seededShuffle(opts(s), optionSeed(question.id, s.id))
        expect(shuffled.map((o) => o.id).sort()).toEqual(opts(s).map((o) => o.id).sort())
        for (const o of shuffled) expect(o).toBe(opts(s).find((x) => x.id === o.id))
      }
  })
  it('問題が違えば、並びが変わることがある（全問が同じ順にはならない）', () => {
    const orders = c.questions.map((question) => {
      const s = question.stages.find((x) => x.kind === 'DECISION')!
      return seededShuffle(opts(s), optionSeed(question.id, s.id)).map((o) => o.text).join('|')
    })
    expect(new Set(orders).size).toBeGreaterThan(1)
    // 同じ選択肢を使う問題セットの中でも、並びが変わる
    const setOrders = c.byId.questionSet.get('SET-2V1')!.items.map((id) => {
      const s = q(id).stages.find((x) => x.kind === 'DECISION')!
      return seededShuffle(opts(s), optionSeed(id, s.id)).map((o) => o.text).join('|')
    })
    expect(new Set(setOrders).size).toBe(2)
  })
  it('画面のコードで Math.random を使っていない', () => {
    for (const { f, text } of SRC) expect(/Math\.random\s*\(/.test(text), f).toBe(false)
  })
})

describe('評価（判断と理由を別々に）', () => {
  it('判断の評価はデータの fit どおり、言葉は v2 の4つだけ', () => {
    expect(Object.values(FIT_LABELS)).toEqual(['この状況で優先', '条件付きで有効', '状況によっては有効', 'この状況では優先度が低い'])
    for (const question of c.questions) {
      const s = question.stages.find((x) => x.kind === 'DECISION') as DecisionStage
      for (const o of s.options) {
        const r = evaluateDecision(s.options, o.id)!
        expect(r.fit).toBe(o.fit)
        expect(r.condition).toBe(o.condition ?? null)
      }
    }
  })
  it('理由の4分類（決め手・補助・思い込み・無関係）をデータのまま保つ', () => {
    expect(QUALITY_LABELS).toEqual({ key: '決め手', supporting: '補助', misconception: '思い込み', irrelevant: '無関係' })
    const why = stage<ReasonStage>('OF-DRV-01-B', 'REASON')
    const r = evaluateReasons(why, 'B', why.options.map((o) => o.id))
    expect(r.map((x) => x.quality)).toEqual(why.options.map((o) => o.quality))
  })
  // OF-DRV-01-B：判断 B＝優先、A＝状況次第、C・D＝優先度低。理由 r1・r2＝決め手（B）、r3＝補助（A）、r4＝思い込み、r5＝無関係
  const why = stage<ReasonStage>('OF-DRV-01-B', 'REASON')
  const dx = (decision: string, reasons: string[]) => {
    const fit = stage<DecisionStage>('OF-DRV-01-B', 'DECISION').options.find((o) => o.id === decision)!.fit
    return diagnose(fit, evaluateReasons(why, decision, reasons))
  }
  it('判断は優先・理由も決め手 → 判断も理由も的確', () => expect(dx('B', ['r1'])).toBe('READ_AND_REASONED'))
  it('判断は優先・理由が無関係 → 判断は合っているが理由が状況と関係ない', () => expect(dx('B', ['r5'])).toBe('RIGHT_BUT_IRRELEVANT'))
  it('判断は優先・理由が思い込み → 判断は合っているが理由が思い込み', () => expect(dx('B', ['r4'])).toBe('RIGHT_BUT_MISCONCEPTION'))
  it('判断は優先・理由は別の判断の理由 → 判断と理由が合っていない', () => expect(dx('B', ['r3'])).toBe('REASON_MISMATCH'))
  it('決め手と思い込みを両方選ぶ → 決め手は選べているが、ほかの理由も選んだ', () => expect(dx('B', ['r1', 'r4'])).toBe('KEY_WITH_NOISE'))
  it('判断は状況次第・理由がその判断を支える → 条件を確かめよう（支えている）', () => expect(dx('A', ['r3'])).toBe('CONDITIONAL_CONSISTENT'))
  it('判断は状況次第・理由が支えていない → 条件を確かめよう（支えていない）', () => expect(dx('A', ['r1'])).toBe('CONDITIONAL_UNSUPPORTED'))
  it('判断の優先度が低い → 優先度が低い判断', () => expect(dx('C', ['r1'])).toBe('LOW_PRIORITY'))
  it('すべての診断に、選手向けの言葉がある', () => {
    for (const d of ['READ_AND_REASONED', 'KEY_WITH_NOISE', 'REASON_MISMATCH', 'RIGHT_BUT_MISCONCEPTION', 'RIGHT_BUT_IRRELEVANT', 'RIGHT_SUPPORTING_ONLY', 'CONDITIONAL_CONSISTENT', 'CONDITIONAL_UNSUPPORTED', 'LOW_PRIORITY'] as const)
      expect(DIAGNOSIS_LABELS[d].title).toBeTruthy()
  })
  it('画面のコードに ◎○△× の記号や「正解」「不正解」の表示がない', () => {
    for (const { f, text } of SRC) {
      expect(/[◎○△]|(?<!\d)×(?!\d)/.test(text), f).toBe(false)
      expect(/(?<!不)正解！|不正解/.test(text), f).toBe(false)
    }
  })
})

describe('コートの状態（データの動きだけから計算）', () => {
  // その選手が取りうる位置：開始位置か、データの動きの to のどれか
  const allowed = (question: Question, id: string) => [
    question.court!.players.find((p) => p.id === id)!.start,
    ...question.court!.steps.flatMap((s) => s.actions.flatMap((a) => ('player' in a && a.player === id && 'to' in a ? [a.to] : []))),
  ]
  it('全15問・全段階で、描く選手はデータと同じ。位置はデータにある座標だけ（推測で作らない）', () => {
    for (const question of c.questions)
      for (const moment of ['start', ...question.stages.map((s) => s.id), 'end']) {
        const st = getCourtState(question, moment)!
        expect(Object.keys(st.positions).sort(), `${question.id} ${moment}`).toEqual(question.court!.players.map((p) => p.id).sort())
        for (const [id, pos] of Object.entries(st.positions)) expect(allowed(question, id), `${question.id} ${moment} ${id}`).toContainEqual(pos)
        if (st.ballHolder === null) expect(st.ballAt).toEqual(RIM)
        else expect(question.court!.players.map((p) => p.id)).toContain(st.ballHolder)
      }
  })
  it('矢印（動き）はデータの動きだけ', () => {
    for (const question of c.questions) {
      const dataMoves = question.court!.steps.flatMap((s) => s.actions.flatMap((a) => ('to' in a && typeof a.to === 'object' ? [JSON.stringify(a.to)] : [])))
      for (const moment of ['start', ...question.stages.map((s) => s.id), 'end'])
        for (const t of getCourtState(question, moment)!.trails) if (t.kind !== 'pass') expect(dataMoves).toContain(JSON.stringify(t.to))
    }
  })
  it('ドライブのセット：「判断」の場面で、DFの位置が問題ごとに違う（データの動きを反映）', () => {
    const at = (id: string) => getCourtState(q(id), 'decide')!.positions
    expect(at('OF-DRV-01-A').D4).toEqual({ x: 88, y: 10 }) // 寄らない
    expect(at('OF-DRV-01-B').D4).toEqual({ x: 70, y: 17 }) // コーナーのDFが寄る
    expect(at('OF-DRV-01-C').D4).toEqual({ x: 70, y: 17 })
    expect(at('OF-DRV-01-C').D1).toEqual({ x: 78, y: 24 }) // トップのDFも動く
    expect(at('OF-DRV-01-A').D1).toEqual({ x: 50, y: 53 })
    // 攻撃側（あなた）は3問とも同じ位置
    for (const id of ['OF-DRV-01-A', 'OF-DRV-01-B', 'OF-DRV-01-C']) expect(at(id).O2).toEqual({ x: 68, y: 24 })
  })
  it('段階が進むと位置が変わる（開始時 → 見る → 判断 → 最後）', () => {
    const question = q('TR-ODF-02-B')
    expect(getCourtState(question, 'start')!.positions.O1).toEqual({ x: 45, y: 90 })
    expect(getCourtState(question, 'see')!.positions.O1).toEqual({ x: 48, y: 72 })
    expect(getCourtState(question, 'end')!.positions.D1).toEqual({ x: 49, y: 62 })
  })
  it('「なぜ」の段階は、止める位置の指定がないので「判断」と同じ場面', () => {
    for (const question of c.questions) expect(stepForMoment(question, 'why')).toBe(stepForMoment(question, 'decide'))
  })
  it('パスはボールの持ち主だけを変え、シュートはボールをリングへ', () => {
    const question = q('OF-DRV-01-B')
    expect(courtStateAt(question.court!, 3).ballHolder).toBe('O4')
    expect(courtStateAt(question.court!, 4).ballHolder).toBeNull()
    expect(courtStateAt(question.court!, 4).ballAt).toEqual(RIM)
  })
  it('動きのない問題（3問）は、どの段階でも開始時と同じ', () => {
    const still = c.questions.filter((x) => x.court!.steps.length === 0)
    expect(still.map((x) => x.id).sort()).toEqual(['DF-OFB-03-A', 'GI-CLK-02-A', 'GI-CLK-02-B'])
    for (const question of still) expect(getCourtState(question, 'end')!.positions).toEqual(getCourtState(question, 'start')!.positions)
  })
})

describe('問題セットの進行', () => {
  it('fixed はデータの順、shuffle はセットIDから決まる同じ順（問題は増えも減りもしない）', () => {
    for (const s of c.questionSets) {
      const o = orderedItems(s)
      expect([...o].sort()).toEqual([...s.items].sort())
      expect(orderedItems(s)).toEqual(o)
      if (s.order === 'fixed') expect(o).toEqual(s.items)
    }
  })
})

describe('保存の場所を1か所に集約（STEP 6 で保存を追加）', () => {
  it('localStorage・sessionStorage・IndexedDB を使うのは src/storage/ だけ（画面・問題フローは直接触らない）', () => {
    for (const { f, text } of SRC) if (!f.includes('/src/storage/')) expect(/localStorage|sessionStorage|indexedDB/.test(text), f).toBe(false)
  })
})
