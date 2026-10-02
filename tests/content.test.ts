import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ContentError, buildContent, loadContent } from '../src/content/load.ts'
import { validateContent } from '../src/content/validate.ts'
import type { DecisionStage, RawContent, ReasonStage } from '../src/types/content.ts'
import { DATA_DIR, readRawContent } from '../scripts/read-data.ts'

const fresh = (): RawContent => readRawContent()
const q = (raw: RawContent, id: string) => raw.questions.questions.find((x) => x.id === id)!
const stage = <T>(raw: RawContent, id: string, sid: string) => q(raw, id).stages.find((s) => s.id === sid) as T

describe('v2 教材データ（data/）', () => {
  it('チェックに1件も引っかからない', () => {
    expect(validateContent(fresh())).toEqual([])
  })

  it('件数が設計どおり（15問・4セット・76項目・35手がかり・20ルール・17出典・68練習）', () => {
    const c = buildContent(fresh())
    expect(c.questions).toHaveLength(15)
    expect(c.questionSets).toHaveLength(4)
    expect(c.curriculum).toHaveLength(76)
    expect(c.retired).toHaveLength(29)
    expect(c.cues).toHaveLength(35)
    expect(c.rules).toHaveLength(20)
    expect(c.sources).toHaveLength(17)
    expect(c.drills).toHaveLength(68)
  })

  it('全15問に「見る→判断→なぜ」の段階がこの順にある', () => {
    for (const x of buildContent(fresh()).questions) {
      const kinds = x.stages.map((s) => s.kind).filter((k) => k !== 'REACTION')
      expect(kinds, x.id).toEqual(['RECOGNITION', 'DECISION', 'REASON'])
    }
  })

  it('問題セットの問題はすべて ID で引ける', () => {
    const c = buildContent(fresh())
    for (const s of c.questionSets) for (const id of s.items) expect(c.byId.question.get(id)?.set_id).toBe(s.id)
  })

  it('関連練習の ID はすべて練習メニュー名に対応している', () => {
    const c = buildContent(fresh())
    for (const x of [...c.questions, ...c.curriculum]) for (const d of x.related_drills) expect(c.byId.drill.get(d)?.title, d).toBeTruthy()
  })
})

// 壊したデータを確実に止められること（docs/02_design.md 15章）
describe('壊したデータを検出する', () => {
  const cases: [string, (r: RawContent) => void, RegExp][] = [
    ['セットの最優先が全問同じ', (r) => {
      const o = stage<DecisionStage>(r, 'AD-2V1-01-B', 'decide').options
      o.find((x) => x.id === 'A')!.fit = 'conditional'
      o.find((x) => x.id === 'A')!.condition = 'x'
      o.find((x) => x.id === 'B')!.fit = 'priority'
    }, /最優先の選択肢が同じ/],
    ['決め手の理由がない', (r) => {
      const w = stage<ReasonStage>(r, 'OF-DRV-01-B', 'why')
      w.options = w.options.filter((o) => o.quality !== 'key')
    }, /決め手」の理由がない/],
    ['教材の内容に研究を根拠として付ける', (r) => { q(r, 'DF-OFB-03-A').evidence[1].basis = 'RESEARCH' }, /研究を根拠/],
    ['セットの攻撃側の配置が違う', (r) => { q(r, 'TR-ODF-02-B').court!.players.find((p) => p.id === 'O1')!.start.x = 40 }, /攻撃側の初期配置/],
    ['見る段階がない', (r) => { q(r, 'OF-DRV-01-A').stages = q(r, 'OF-DRV-01-A').stages.filter((s) => s.kind !== 'RECOGNITION') }, /段階がない RECOGNITION/],
    ['問題IDの重複', (r) => { r.questions.questions[1].id = r.questions.questions[0].id }, /重複/],
    ['実在しない練習メニューID', (r) => { q(r, 'DF-CLO-01-A').related_drills.push('lib-999') }, /練習メニューIDがない lib-999/],
    ['座標がコートの外', (r) => { q(r, 'AD-3V2-01-A').court!.players[0].start.y = 120 }, /座標が範囲外/],
    ['条件付きなのに条件がない', (r) => { delete stage<DecisionStage>(r, 'OF-1V1-03-A', 'decide').options[0].condition }, /有効になる条件がない/],
    ['実在しないルールID', (r) => { q(r, 'GI-CLK-02-A').rule_notes[0].rule_id = 'RULE-XXX' }, /ルール枠のルールがない/],
    ['v1 の形式（schema_version 1）', (r) => { (r.questions as { schema_version: number }).schema_version = 1 }, /schema_version/],
  ]
  for (const [name, breakIt, expected] of cases) {
    it(name, () => {
      const raw = fresh()
      breakIt(raw)
      const errors = validateContent(raw)
      expect(errors.join('\n')).toMatch(expected)
      expect(() => buildContent(raw)).toThrow(ContentError)
    })
  }
})

describe('読み込み（loadContent）', () => {
  const fileFetcher = async (url: string) => {
    const name = url.split('/').pop()!
    try {
      const text = readFileSync(join(DATA_DIR, name), 'utf8')
      return { ok: true, status: 200, json: async () => JSON.parse(text) }
    } catch {
      return { ok: false, status: 404, json: async () => null }
    }
  }

  it('GitHub Pages のパス（/basketball-iq/data/…）から6ファイルを読み込む', async () => {
    const urls: string[] = []
    const c = await loadContent('/basketball-iq/', async (u) => (urls.push(u), fileFetcher(u)))
    expect(c.questions).toHaveLength(15)
    expect(urls.sort()).toEqual([
      '/basketball-iq/data/cues.json',
      '/basketball-iq/data/curriculum.json',
      '/basketball-iq/data/links_drills.json',
      '/basketball-iq/data/rules.json',
      '/basketball-iq/data/sample_questions.json',
      '/basketball-iq/data/sources.json',
    ])
  })

  it('ファイルがない時は分かるエラーを出す', async () => {
    await expect(loadContent('/x/', async (u) => (u.endsWith('rules.json') ? { ok: false, status: 404, json: async () => null } : fileFetcher(u)))).rejects.toThrow(
      /見つかりません（404）：rules.json/,
    )
  })

  it('通信エラーの時も分かるエラーを出す', async () => {
    await expect(loadContent('/x/', async () => { throw new Error('offline') })).rejects.toThrow(/通信エラー/)
  })
})
