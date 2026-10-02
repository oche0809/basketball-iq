import { describe, expect, it } from 'vitest'
import { buildContent } from '../src/content/load.ts'
import { H, W, courtModel, toSvg } from '../src/court/geometry.ts'
import type { Category } from '../src/types/content.ts'
import { dayNumber, pickForDay } from '../src/utils/daily.ts'
import { EMPTY_FILTER, difficultiesIn, filterCurriculum, filterFromParams, filterToQuery, gradesIn } from '../src/utils/mapFilter.ts'
import { readRawContent } from '../scripts/read-data.ts'

const c = buildContent(readRawContent())
const cueName = (id: string) => c.byId.cue.get(id)?.name

describe('今日の問題セット（日付で決まる）', () => {
  it('同じ日なら、時刻が違っても（リロードしても）同じセット', () => {
    const a = pickForDay(c.questionSets, new Date(2026, 9, 2, 0, 1))
    const b = pickForDay(c.questionSets, new Date(2026, 9, 2, 23, 59))
    expect(a?.id).toBe(b?.id)
  })
  it('日付が1日進むと別のセットになり、4日で4セットすべてが出る', () => {
    const ids = [0, 1, 2, 3].map((d) => pickForDay(c.questionSets, new Date(2026, 9, 2 + d))?.id)
    for (let i = 1; i < ids.length; i++) expect(ids[i]).not.toBe(ids[i - 1])
    expect(new Set(ids).size).toBe(4)
    expect(new Set(ids)).toEqual(new Set(c.questionSets.map((s) => s.id)))
  })
  it('月や年をまたいでも日数が1ずつ進む', () => {
    expect(dayNumber(new Date(2026, 11, 31)) + 1).toBe(dayNumber(new Date(2027, 0, 1)))
    expect(dayNumber(new Date(2028, 1, 28)) + 1).toBe(dayNumber(new Date(2028, 1, 29)))
  })
  it('セットがない時は null', () => {
    expect(pickForDay([], new Date())).toBeNull()
  })
})

describe('コート図（データの座標だけを描く）', () => {
  const withCourt = c.questions.filter((q) => q.court)
  it('全15問にコート図のデータがある', () => {
    expect(withCourt).toHaveLength(15)
  })
  it('描く選手はデータの選手と完全に同じ（人数・ID・位置）。追加も省略もしない', () => {
    for (const q of withCourt) {
      const m = courtModel(q.court!)
      expect(m.players.map((p) => p.id), q.id).toEqual(q.court!.players.map((p) => p.id))
      for (const p of q.court!.players) {
        const shape = m.players.find((s) => s.id === p.id)!
        expect({ x: shape.x, y: shape.y }, `${q.id} ${p.id}`).toEqual(toSvg(p.start))
        expect(shape.team).toBe(p.team)
        expect(shape.label).toBe(p.label)
      }
    }
  })
  it('ボールはデータの ball の選手が持ち、YOU はデータの you の選手', () => {
    for (const q of withCourt) {
      const m = courtModel(q.court!)
      expect(m.ball?.holder, q.id).toBe(q.court!.ball)
      expect(m.players.filter((p) => p.isYou).map((p) => p.id), q.id).toEqual([q.court!.you])
    }
  })
  it('全員がコートの図の中に入る', () => {
    for (const q of withCourt)
      for (const p of courtModel(q.court!).players) {
        expect(p.x, `${q.id} ${p.id}`).toBeGreaterThanOrEqual(0)
        expect(p.x).toBeLessThanOrEqual(W)
        expect(p.y).toBeGreaterThanOrEqual(0)
        expect(p.y).toBeLessThanOrEqual(H)
      }
  })
  it('座標の変換は練習メニュー倉庫と同じ（リング {50, 11.25} → 図の (75, 15.75)）', () => {
    expect(toSvg({ x: 50, y: 11.25 })).toEqual({ x: 75, y: 15.75 })
    expect(toSvg({ x: 100, y: 100 })).toEqual({ x: W, y: H })
  })
  it('問題セットの中では、攻撃側の配置は同じまま描かれる', () => {
    for (const s of c.questionSets) {
      const offense = s.items.map((id) =>
        JSON.stringify(courtModel(c.byId.question.get(id)!.court!).players.filter((p) => p.team === 'offense').map((p) => [p.id, p.x, p.y])),
      )
      expect(new Set(offense).size, s.id).toBe(1)
    }
  })
  it('位置を渡すと、その位置で描く（将来のアニメーション用）', () => {
    const q = c.byId.question.get('AD-2V1-01-A')!
    const m = courtModel(q.court!, { O1: { x: 44, y: 42 } }, 'O2')
    expect(m.players.find((p) => p.id === 'O1')).toMatchObject(toSvg({ x: 44, y: 42 }))
    expect(m.ball?.holder).toBe('O2')
  })
})

describe('MAP の検索・絞り込み', () => {
  it('条件なしで76項目すべて', () => {
    expect(filterCurriculum(c.curriculum, EMPTY_FILTER, cueName)).toHaveLength(76)
  })
  it('カテゴリー別の件数（29・21・8・9・9）', () => {
    const count = (cat: Category) => filterCurriculum(c.curriculum, { ...EMPTY_FILTER, cat }, cueName).length
    expect([count('OFFENSE'), count('DEFENSE'), count('TRANSITION'), count('ADVANTAGE'), count('GAME_IQ')]).toEqual([29, 21, 8, 9, 9])
  })
  it('難易度・学年の選択肢はデータにある値だけ', () => {
    expect(difficultiesIn(c.curriculum)).toEqual(['BEGINNER', 'INTERMEDIATE', 'ADVANCED'])
    expect(gradesIn(c.curriculum)).toEqual([1, 2, 3])
  })
  it('キーワード：全角・半角を区別しない（「２対１」でも 2対1 の項目が出る）', () => {
    const half = filterCurriculum(c.curriculum, { ...EMPTY_FILTER, q: '2対1' }, cueName)
    const full = filterCurriculum(c.curriculum, { ...EMPTY_FILTER, q: '２対１' }, cueName)
    expect(half.length).toBeGreaterThan(0)
    expect(full.map((i) => i.id)).toEqual(half.map((i) => i.id))
  })
  it('キーワードは手がかりの名前でも探せる', () => {
    const r = filterCurriculum(c.curriculum, { ...EMPTY_FILTER, q: 'ヘルプDFの足' }, cueName)
    expect(r.map((i) => i.id)).toContain('OF-DRV-01')
  })
  it('4つの条件は AND（それぞれで絞った結果の共通部分と同じ）', () => {
    const f = { q: 'ヘルプ', cat: 'DEFENSE' as const, diff: 'INTERMEDIATE' as const, grade: 2 }
    const all = filterCurriculum(c.curriculum, f, cueName).map((i) => i.id)
    const each = [
      filterCurriculum(c.curriculum, { ...EMPTY_FILTER, q: f.q }, cueName),
      filterCurriculum(c.curriculum, { ...EMPTY_FILTER, cat: f.cat }, cueName),
      filterCurriculum(c.curriculum, { ...EMPTY_FILTER, diff: f.diff }, cueName),
      filterCurriculum(c.curriculum, { ...EMPTY_FILTER, grade: f.grade }, cueName),
    ].map((r) => new Set(r.map((i) => i.id)))
    const intersection = c.curriculum.map((i) => i.id).filter((id) => each.every((s) => s.has(id)))
    expect(all).toEqual(intersection)
    expect(all.length).toBeGreaterThan(0)
  })
  it('URL との変換：条件が戻る。おかしな値は無視する', () => {
    const f = { q: 'ヘルプ 2対1', cat: 'OFFENSE' as const, diff: 'BEGINNER' as const, grade: 1 }
    expect(filterFromParams(new URLSearchParams(filterToQuery(f).slice(1)))).toEqual(f)
    expect(filterFromParams(new URLSearchParams('cat=ZONE&diff=EXPERT&grade=abc'))).toEqual(EMPTY_FILTER)
    expect(filterToQuery(EMPTY_FILTER)).toBe('')
  })
})

describe('関連データのつながり', () => {
  it('76項目の関連練習・ルール・出典・手がかりがすべて引ける', () => {
    for (const it of c.curriculum) {
      for (const d of it.related_drills) expect(c.byId.drill.get(d), `${it.id} ${d}`).toBeTruthy()
      for (const r of it.rule_refs) expect(c.byId.rule.get(r), `${it.id} ${r}`).toBeTruthy()
      for (const e of it.evidence) expect(c.byId.source.get(e.source_id), `${it.id} ${e.source_id}`).toBeTruthy()
      for (const cue of it.cues) expect(c.byId.cue.get(cue), `${it.id} ${cue}`).toBeTruthy()
    }
  })
  it('カリキュラムの根拠に研究（RESEARCH）は1件もない', () => {
    expect(c.curriculum.flatMap((i) => i.evidence).filter((e) => e.basis === 'RESEARCH')).toEqual([])
  })
  it('全15問がカリキュラムの項目に属している（MAP の詳細から問題へ行ける）', () => {
    for (const q of c.questions) expect(c.byId.curriculum.get(q.curriculum_id), q.id).toBeTruthy()
  })
})
