// 教材データのチェック。docs/02_design.md 15章の項目をすべて確かめる。
// 画面（ブラウザ）・コマンド（scripts/validate-content.ts）・テストの3か所から同じ関数を使う。
import type { Court, DecisionOption, Question, RawContent } from '../types/content.ts'

const RECOGNITION_VALUES = ['key', 'useful', 'not_now', 'irrelevant']
const FITS = ['priority', 'conditional', 'situational', 'low']
const QUALITIES = ['key', 'supporting', 'misconception', 'irrelevant']
const BASES = ['RESEARCH', 'OFFICIAL_RULE', 'OFFICIAL_COACHING', 'COACHING_PRACTICE', 'TEAM_RULE']
const CATEGORIES = ['OFFENSE', 'DEFENSE', 'TRANSITION', 'ADVANTAGE', 'GAME_IQ']
const DIFFICULTIES = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED']
// 作戦盤の戦術ID・守備パターンID（作戦盤のデータから確認済みの範囲）
const TACTIC_ID = /^(BLOB-0[1-6]|SLOB-0[1-8]|HC-0[1-6]|SET-U16-0[1-8]|DEF-(0[1-9]|1[0-5]))$/
// コートの座標範囲（x：0〜100、y：0〜ハーフライン約93）
const inCourt = (p: { x: number; y: number } | undefined) =>
  !!p && typeof p.x === 'number' && typeof p.y === 'number' && p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 94

export function validateContent(raw: RawContent): string[] {
  const errors: string[] = []
  const { curriculum, questions: qFile, cues: cueFile, rules: ruleFile, sources: srcFile, drills: drillFile } = raw

  if (curriculum?.schema_version !== 2) errors.push('curriculum.json: schema_version が 2 ではない')
  if (qFile?.schema_version !== 2) errors.push('sample_questions.json: schema_version が 2 ではない')
  if (errors.length) return errors

  const cueIds = new Set(cueFile.cues.map((c) => c.id))
  const ruleIds = new Set(ruleFile.rules.map((r) => r.id))
  const sourceType = new Map(srcFile.sources.map((s) => [s.id, s.source_type]))
  const drillIds = new Set(drillFile.drills.map((d) => d.id))
  const curIds = new Set(curriculum.items.map((i) => i.id))
  const plannedSetIds = new Set(curriculum.planned_sets.map((s) => s.id))
  const questionIds = new Set(qFile.questions.map((q) => q.id))

  const dupes = (label: string, ids: string[]) => {
    const seen = new Set<string>()
    for (const id of ids) {
      if (seen.has(id)) errors.push(`${label}: ID が重複 ${id}`)
      seen.add(id)
    }
  }
  dupes('cues.json', cueFile.cues.map((c) => c.id))
  dupes('rules.json', ruleFile.rules.map((r) => r.id))
  dupes('sources.json', srcFile.sources.map((s) => s.id))
  dupes('links_drills.json', drillFile.drills.map((d) => d.id))
  dupes('curriculum.json', [...curriculum.items.map((i) => i.id), ...curriculum.retired.map((r) => r.id)])
  dupes('sample_questions.json', qFile.questions.map((q) => q.id))

  for (const r of ruleFile.rules) if (!sourceType.has(r.source_id)) errors.push(`rules.json ${r.id}: 出典がない ${r.source_id}`)
  for (const d of drillFile.drills) if (!/^lib-\d{3}$/.test(d.id) || !d.title) errors.push(`links_drills.json: 形が不正 ${d.id}`)

  // ---- カリキュラム ----
  for (const it of curriculum.items) {
    const e = (m: string) => errors.push(`curriculum ${it.id}: ${m}`)
    if (!CATEGORIES.includes(it.category)) e('カテゴリーが不正')
    if (!DIFFICULTIES.includes(it.difficulty)) e('難易度が不正')
    if (!it.sample_questions?.recognition || !it.sample_questions?.decision) e('見る問い・判断の問いがない')
    it.cues.forEach((c) => cueIds.has(c) || e(`手がかりがない ${c}`))
    it.rule_refs.forEach((r) => ruleIds.has(r) || e(`ルールがない ${r}`))
    it.related_drills.forEach((d) => drillIds.has(d) || e(`練習メニューIDがない ${d}`))
    it.related_tactics.forEach((t) => TACTIC_ID.test(t) || e(`戦術IDが不正 ${t}`))
    if (it.question_set && !plannedSetIds.has(it.question_set)) e(`問題セットの計画がない ${it.question_set}`)
    for (const v of it.evidence) checkEvidence(v, e)
  }

  // ---- 問題 ----
  for (const q of qFile.questions) checkQuestion(q)

  function checkEvidence(v: { basis: string; source_id: string; rule_id?: string; locator?: string; part: string }, e: (m: string) => void, isQuestion = false) {
    if (!BASES.includes(v.basis)) e(`根拠の種類が不正 ${v.basis}`)
    const st = sourceType.get(v.source_id)
    if (!st) e(`出典がない ${v.source_id}`)
    else if (st !== v.basis) e(`根拠の種類と出典の種類が違う ${v.part}: ${v.basis}≠${st}`)
    if (v.basis === 'OFFICIAL_RULE' && (!v.rule_id || !ruleIds.has(v.rule_id))) e(`ルールの根拠に正しい rule_id がない ${v.part}`)
    if (isQuestion && v.basis === 'OFFICIAL_RULE' && !v.locator) e(`ルールの根拠に条文番号がない ${v.part}`)
    // 研究は「教え方」の根拠。教材の内容の根拠には付けない（docs/02_design.md 9章）
    if (v.basis === 'RESEARCH') e('教材の内容に研究を根拠として付けている（研究は教え方の根拠）')
  }

  function checkCourt(court: Court, e: (m: string) => void) {
    const ids = new Set<string>()
    for (const p of court.players) {
      if (ids.has(p.id)) e(`選手IDが重複 ${p.id}`)
      ids.add(p.id)
      if (!inCourt(p.start)) e(`座標が範囲外 ${p.id}`)
    }
    if (!ids.has(court.you)) e('you の選手がいない')
    if (!ids.has(court.ball)) e('ball の選手がいない')
    for (const s of court.steps)
      for (const a of s.actions) {
        if ('player' in a && !ids.has(a.player)) e(`動作の選手がいない ${a.player}`)
        if (a.type === 'pass' && (!ids.has(a.from) || !ids.has(a.to))) e('パスの選手がいない')
        if ('to' in a && typeof a.to === 'object' && !inCourt(a.to)) e('移動先が範囲外')
      }
  }

  function checkQuestion(q: Question) {
    const e = (m: string) => errors.push(`${q.id}: ${m}`)
    if (!curIds.has(q.curriculum_id)) e(`カリキュラムにない ${q.curriculum_id}`)
    if (!CATEGORIES.includes(q.category)) e('カテゴリーが不正')
    q.cues.forEach((c) => cueIds.has(c) || e(`手がかりがない ${c}`))
    const steps = q.court?.steps ?? []
    if (q.court) checkCourt(q.court, e)

    // 見る → 判断 → なぜ の3段階が、この順番であること
    const kinds = q.stages.map((s) => s.kind)
    for (const k of ['RECOGNITION', 'DECISION', 'REASON'] as const) if (!kinds.includes(k)) e(`段階がない ${k}`)
    if (kinds.indexOf('RECOGNITION') > kinds.indexOf('DECISION') || kinds.indexOf('DECISION') > kinds.indexOf('REASON'))
      e('段階の順番が「見る→判断→なぜ」ではない')
    let last = 0
    for (const s of q.stages) {
      if (s.show_until_step === undefined) continue
      if (s.show_until_step < last) e(`停止位置が前に戻る ${s.id}`)
      if (s.show_until_step > steps.length) e(`停止位置が範囲外 ${s.id}`)
      last = s.show_until_step
    }
    const dec = q.stages.find((s) => s.kind === 'DECISION')
    if (!dec) return
    if (q.presentation === 'ANIMATION' && !((dec.show_until_step ?? 0) > 0 && (dec.show_until_step ?? 0) < steps.length))
      e('動きの問題で、判断の後に続きの再生がない')
    const decIds = new Set(dec.options.map((o) => o.id))

    for (const s of q.stages) {
      if (s.kind === 'RECOGNITION') {
        if (!s.options.some((o) => o.value === 'key')) e('見る問いに key がない')
        for (const o of s.options) {
          if (!RECOGNITION_VALUES.includes(o.value)) e(`見る問いの value が不正 ${o.id}`)
          if (o.value === 'key' && (!o.cue_id || !q.cues.includes(o.cue_id))) e(`key の手がかりが問題の cues にない ${o.id}`)
          if (o.cue_id && !cueIds.has(o.cue_id)) e(`手がかりがない ${o.cue_id}`)
        }
      }
      if (s.kind === 'DECISION' || s.kind === 'REACTION') {
        const opts: DecisionOption[] = s.options
        if (opts.filter((o) => o.fit === 'priority').length !== 1) e(`${s.id}: 「この状況で優先」がちょうど1つではない`)
        for (const o of opts) {
          if (!FITS.includes(o.fit)) e(`fit が不正 ${s.id}.${o.id}`)
          if ((o.fit === 'conditional' || o.fit === 'situational') && !o.condition) e(`有効になる条件がない ${s.id}.${o.id}`)
          if (!o.feedback) e(`フィードバックがない ${s.id}.${o.id}`)
          if (s.kind === 'DECISION' && s.spot && !inCourt(o.spot)) e(`位置の座標がない ${o.id}`)
        }
        if (s.kind === 'DECISION' && s.mode === 'PRIORITY') {
          const valued = opts.filter((o) => o.fit === 'conditional' || o.fit === 'situational').length
          const low = opts.filter((o) => o.fit === 'low').length
          if (valued < 2 || low > 1) e('優先問題なのに価値のある選択肢が少ない（条件付き・状況次第が2つ以上、優先度低は1つまで）')
        }
      }
      if (s.kind === 'REASON') {
        const prio = dec.options.find((o) => o.fit === 'priority')?.id
        if (!s.options.some((o) => o.quality === 'key' && prio && o.supports.includes(prio))) e('最優先の判断を支える「決め手」の理由がない')
        if (!s.options.some((o) => o.quality === 'misconception' || o.quality === 'irrelevant')) e('思い込み・無関係の理由がない（理由の質を判定できない）')
        if (!(s.max_select >= 1)) e('理由の選べる数が不正')
        for (const o of s.options) {
          if (!QUALITIES.includes(o.quality)) e(`理由の quality が不正 ${o.id}`)
          o.supports.forEach((x) => decIds.has(x) || e(`理由が支える選択肢がない ${o.id}→${x}`))
          if (o.cue_id && !cueIds.has(o.cue_id)) e(`手がかりがない ${o.cue_id}`)
        }
      }
    }

    if (!q.evidence.some((v) => v.part === 'decision_rule')) e('判断ルールの根拠がない')
    for (const v of q.evidence) checkEvidence(v, e, true)
    for (const r of q.rule_notes) if (!ruleIds.has(r.rule_id)) e(`ルール枠のルールがない ${r.rule_id}`)
    q.related_drills.forEach((d) => drillIds.has(d) || e(`練習メニューIDがない ${d}`))
    q.related_tactics.forEach((t) => TACTIC_ID.test(t) || e(`戦術IDが不正 ${t}`))
    if (q.set_id && !qFile.question_sets.some((s) => s.id === q.set_id)) e(`問題セットがない ${q.set_id}`)
    for (const c of q.debrief.if_defense_changes) if (c.question_id && !questionIds.has(c.question_id)) e(`参照先の問題がない ${c.question_id}`)
  }

  // ---- 問題セット：同じ状況で相手（または時計）だけ変わり、最優先が全問同じではないこと ----
  const offense = (q: Question) =>
    JSON.stringify((q.court?.players ?? []).filter((p) => p.team === 'offense').map((p) => [p.id, p.start]).sort())
  const defense = (q: Question) =>
    JSON.stringify([
      (q.court?.players ?? []).filter((p) => p.team === 'defense').map((p) => [p.id, p.start]).sort(),
      (q.court?.steps ?? []).map((s) => s.actions.filter((a) => 'player' in a && a.player.startsWith('D'))),
    ])
  const decisionOf = (q: Question) => q.stages.find((s) => s.kind === 'DECISION')?.options ?? []

  for (const set of qFile.question_sets) {
    const e = (m: string) => errors.push(`${set.id}: ${m}`)
    if (!plannedSetIds.has(set.id)) e('カリキュラムの計画にないセット')
    const qs = set.items.map((id) => qFile.questions.find((q) => q.id === id))
    if (qs.some((q) => !q)) {
      e('問題が見つからない')
      continue
    }
    const items = qs as Question[]
    if (items.length < 2) e('セットは2問以上')
    for (const q of items) {
      if (q.set_id !== set.id) e(`${q.id} の set_id が違う`)
      if (q.scenario_id !== set.scenario_id) e(`${q.id} の scenario_id が違う`)
    }
    if (new Set(items.map(offense)).size !== 1) e('攻撃側の初期配置が問題ごとに違う（同じ状況になっていない）')
    if (set.kind === 'DEFENSE_VARIATION' && new Set(items.map(defense)).size !== items.length) e('DFの配置・動きが変わっていない問題がある')
    if (set.kind === 'CONTEXT_VARIATION') {
      if (new Set(items.map((q) => JSON.stringify(q.court?.players))).size !== 1) e('コートが同じではない')
      if (new Set(items.map((q) => JSON.stringify(q.court?.hud))).size !== items.length) e('時計・点差が変わっていない')
    }
    if (new Set(items.map((q) => JSON.stringify(decisionOf(q).map((o) => o.text).sort()))).size !== 1)
      e('判断の選択肢の文が問題ごとに違う（同じ選択肢で優先が変わる形にする）')
    if (new Set(items.map((q) => decisionOf(q).find((o) => o.fit === 'priority')?.text)).size < 2)
      e('全問で最優先の選択肢が同じ（暗記で解けてしまう）')
    if (!set.closing.options.some((o) => o.correct && o.cue_id && cueIds.has(o.cue_id))) e('振り返りの問いに手がかりがない')
  }

  return errors
}
