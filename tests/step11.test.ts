import { describe, expect, it } from 'vitest'
import { assignmentPath, assignmentUrl, parseAssignment } from '../src/coach/assignment.ts'
import { cleanTeamParam, decodeTeamRules, encodeTeamRules, pickTeamRules } from '../src/coach/teamRuleParam.ts'
import { STORAGE_KEY } from '../src/storage/attemptStore.ts'
import { REVIEW_STORAGE_KEY } from '../src/storage/reviewStore.ts'
import { TEAM_PROFILE_NAME_MAX_LENGTH, TEAM_RULE_MAX_LENGTH, TEAM_RULE_SCHEMA_VERSION, mergeTeamRules } from '../src/storage/teamRule.ts'
import { TEAM_RULE_BACKUP_KEY_PREFIX, TEAM_RULE_STORAGE_KEY, createTeamRuleStore } from '../src/storage/teamRuleStore.ts'
import { parseHash } from '../src/utils/router.ts'

const T = new Date('2026-10-15T10:00:00+09:00')
const RULE = '4ファウルの時は、ブロックに跳ばない。ヘルプにまかせて、リバウンドへ。'

class MemoryStorage implements Storage {
  map = new Map<string, string>()
  failWrites = false
  get length() {
    return this.map.size
  }
  clear() {
    this.map.clear()
  }
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null
  }
  removeItem(k: string) {
    this.map.delete(k)
  }
  setItem(k: string, v: string) {
    if (this.failWrites) throw new Error('QuotaExceededError')
    this.map.set(k, String(v))
  }
}

describe('チームの約束の保存（TeamRuleStore）', () => {
  it('保存して読み込み直しても残る。空の文で保存するとその問題の約束が消える', () => {
    const mem = new MemoryStorage()
    const store = createTeamRuleStore(mem)
    expect(store.load()).toEqual({ status: 'ok', rules: {}, profiles: [], byProfile: { '': {} } })
    expect(store.save('GI-FOU-02-B', `  ${RULE}  `, T)).toEqual({ ok: true })
    expect(store.save('GI-SCR-01-A', '24秒はしっかり使う', T)).toEqual({ ok: true })
    expect(createTeamRuleStore(mem).load()).toMatchObject({ status: 'ok', rules: { 'GI-FOU-02-B': RULE, 'GI-SCR-01-A': '24秒はしっかり使う' }, profiles: [] })
    const saved = JSON.parse(mem.getItem(TEAM_RULE_STORAGE_KEY)!)
    expect(saved.schemaVersion).toBe(TEAM_RULE_SCHEMA_VERSION)
    expect(saved.rules[0]).toEqual({ questionId: 'GI-FOU-02-B', text: RULE, updatedAt: T.toISOString() })

    store.save('GI-FOU-02-B', '   ', T)
    expect(store.load().rules).toEqual({ 'GI-SCR-01-A': '24秒はしっかり使う' })
  })
  it('同じ問題を保存し直すと置き換わる。長すぎる文は上限で切る', () => {
    const store = createTeamRuleStore(new MemoryStorage())
    store.save('GI-FOU-02-B', '古い約束', T)
    store.save('GI-FOU-02-B', 'あ'.repeat(TEAM_RULE_MAX_LENGTH + 50), T)
    expect(store.load().rules['GI-FOU-02-B']).toBe('あ'.repeat(TEAM_RULE_MAX_LENGTH))
  })
  it('学習記録・レビュー記録には触れない（すべて削除でも消えない）', () => {
    const mem = new MemoryStorage()
    mem.setItem(STORAGE_KEY, 'attempts')
    mem.setItem(REVIEW_STORAGE_KEY, 'reviews')
    const store = createTeamRuleStore(mem)
    store.save('GI-FOU-02-B', RULE, T)
    expect(store.deleteAll()).toEqual({ ok: true })
    expect(mem.getItem(TEAM_RULE_STORAGE_KEY)).toBeNull()
    expect(mem.getItem(STORAGE_KEY)).toBe('attempts')
    expect(mem.getItem(REVIEW_STORAGE_KEY)).toBe('reviews')
  })
  it('壊れた記録は読み込まず、保存する時に別のキーへ退避する', () => {
    const mem = new MemoryStorage()
    mem.setItem(TEAM_RULE_STORAGE_KEY, '{壊れた')
    const store = createTeamRuleStore(mem)
    expect(store.load()).toMatchObject({ status: 'unreadable', reason: 'broken-json', rules: {} })
    expect(store.save('GI-FOU-02-B', RULE, T)).toEqual({ ok: true })
    expect(mem.getItem(TEAM_RULE_BACKUP_KEY_PREFIX)).toBe('{壊れた')
    expect(store.load().rules).toEqual({ 'GI-FOU-02-B': RULE })
  })
  it('新しい形式の記録は上書きしない。保存できない時はエラーにせず結果で返す', () => {
    const mem = new MemoryStorage()
    mem.setItem(TEAM_RULE_STORAGE_KEY, JSON.stringify({ schemaVersion: 99, rules: [] }))
    expect(createTeamRuleStore(mem).save('GI-FOU-02-B', RULE, T)).toEqual({ ok: false, reason: 'newer-version' })
    const full = new MemoryStorage()
    full.failWrites = true
    expect(createTeamRuleStore(full).save('GI-FOU-02-B', RULE, T)).toEqual({ ok: false, reason: 'quota-or-error' })
    expect(createTeamRuleStore(null).load()).toEqual({ status: 'unavailable', rules: {}, profiles: [], byProfile: { '': {} } })
  })
  it('形の合わない記録（文が空・IDなし・日付が不正）は使わない', () => {
    const mem = new MemoryStorage()
    mem.setItem(
      TEAM_RULE_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        rules: [
          { questionId: 'A', text: '', updatedAt: T.toISOString() },
          { text: 'IDなし', updatedAt: T.toISOString() },
          { questionId: 'B', text: '日付が不正', updatedAt: 'きのう' },
          { questionId: 'C', text: '使える', updatedAt: T.toISOString() },
        ],
      }),
    )
    expect(createTeamRuleStore(mem).load().rules).toEqual({ C: '使える' })
  })
})

describe('相手ごとの約束（TeamRuleStore の profiles）', () => {
  it('相手を足して、その相手の約束を書ける。いつもの約束とは別に残る', () => {
    const mem = new MemoryStorage()
    const store = createTeamRuleStore(mem)
    store.save('GI-FOU-02-B', RULE, T)
    const added = store.addProfile('  背の高いチーム  ', T)
    expect(added.ok).toBe(true)
    const id = added.ok ? added.id : ''
    expect(store.save('GI-FOU-02-B', 'ブロックに跳ばず、ボックスアウト', T, id)).toEqual({ ok: true })
    const l = createTeamRuleStore(mem).load()
    expect(l.profiles).toEqual([{ id, name: '背の高いチーム', createdAt: T.toISOString() }])
    expect(l.rules).toEqual({ 'GI-FOU-02-B': RULE })
    expect(l.byProfile[id]).toEqual({ 'GI-FOU-02-B': 'ブロックに跳ばず、ボックスアウト' })
    // 相手の約束を消しても、いつもの約束は残る
    store.save('GI-FOU-02-B', '', T, id)
    expect(store.load().byProfile[id]).toEqual({})
    expect(store.load().rules).toEqual({ 'GI-FOU-02-B': RULE })
  })
  it('相手ごとの約束がない問題は、いつもの約束を使う', () => {
    const byProfile = { '': { A: 'いつも', B: 'いつもB' }, p1: { B: '相手B' } }
    expect(mergeTeamRules(byProfile, 'p1')).toEqual({ A: 'いつも', B: '相手B' })
    expect(mergeTeamRules(byProfile, '')).toEqual({ A: 'いつも', B: 'いつもB' })
  })
  it('相手を消すと、その相手の約束だけが消える。名前が空なら足さない。長い名前は上限で切る', () => {
    const mem = new MemoryStorage()
    const store = createTeamRuleStore(mem)
    expect(store.addProfile('   ', T)).toEqual({ ok: false, reason: 'empty-name' })
    const a = store.addProfile('速攻が多いチーム', T)
    const b = store.addProfile('あ'.repeat(TEAM_PROFILE_NAME_MAX_LENGTH + 10), T)
    if (!a.ok || !b.ok) throw new Error('add failed')
    expect(a.id).not.toBe(b.id) // 同じ時刻でも ID は重ならない
    store.save('GI-FOU-02-B', RULE, T)
    store.save('GI-FOU-02-B', '走って戻る', T, a.id)
    store.save('GI-FOU-02-B', '外を守る', T, b.id)
    expect(store.deleteProfile(a.id)).toEqual({ ok: true })
    const l = store.load()
    expect(l.profiles.map((x) => x.id)).toEqual([b.id])
    expect(l.profiles[0].name).toHaveLength(TEAM_PROFILE_NAME_MAX_LENGTH)
    expect(l.byProfile[a.id]).toBeUndefined()
    expect(l.byProfile[b.id]).toEqual({ 'GI-FOU-02-B': '外を守る' })
    expect(l.rules).toEqual({ 'GI-FOU-02-B': RULE })
    expect(JSON.parse(mem.getItem(TEAM_RULE_STORAGE_KEY)!).rules.some((r: { profile?: string }) => r.profile === a.id)).toBe(false)
  })
  it('今までの記録（相手なし）はそのまま「いつもの約束」として読める。ない相手の約束は保存しない・使わない', () => {
    const mem = new MemoryStorage()
    mem.setItem(TEAM_RULE_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, rules: [{ questionId: 'GI-FOU-02-B', text: RULE, updatedAt: T.toISOString() }, { questionId: 'GI-FOU-02-A', text: '消えた相手', updatedAt: T.toISOString(), profile: 'p-gone' }] }))
    const store = createTeamRuleStore(mem)
    expect(store.load()).toMatchObject({ status: 'ok', rules: { 'GI-FOU-02-B': RULE }, profiles: [] })
    expect(store.load().byProfile['p-gone']).toBeUndefined()
    expect(store.save('GI-FOU-02-B', 'x', T, 'p-nothing').ok).toBe(false)
  })
  it('すべて削除で、相手ごとの約束も消える', () => {
    const mem = new MemoryStorage()
    const store = createTeamRuleStore(mem)
    store.addProfile('背の高いチーム', T)
    store.deleteAll()
    expect(store.load().profiles).toEqual([])
  })
})

describe('課題URLのチームの約束（?team=）', () => {
  const page = 'https://oche0809.github.io/basketball-iq/#/coach'
  it('日本語の約束を URL に入れて、そのまま読み戻せる（URLに使える文字だけ）', () => {
    const team = encodeTeamRules({ 'GI-FOU-02-A': '1ファウルなら、追いついて手を上げる', 'GI-FOU-02-B': RULE })!
    expect(team).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeTeamRules(team, ['GI-FOU-02-A', 'GI-FOU-02-B'])).toEqual({ 'GI-FOU-02-A': '1ファウルなら、追いついて手を上げる', 'GI-FOU-02-B': RULE })
  })
  it('約束がなければ URL に team を付けない（今までの課題URLと同じ）', () => {
    expect(encodeTeamRules({})).toBeNull()
    expect(encodeTeamRules({ 'GI-FOU-02-B': '   ' })).toBeNull()
    expect(assignmentUrl(page, { type: 'set', id: 'SET-FOULS' }, null)).toBe('https://oche0809.github.io/basketball-iq/#/play/assignment/set/SET-FOULS')
  })
  it('team 付きの課題URLでも、課題の指定（セットID）は今までどおり読める', () => {
    const team = encodeTeamRules({ 'GI-FOU-02-B': RULE })!
    const url = assignmentUrl(page, { type: 'set', id: 'SET-FOULS' }, team)
    expect(url).toBe(`https://oche0809.github.io/basketball-iq/#/play/assignment/set/SET-FOULS?team=${team}`)
    const route = parseHash(new URL(url).hash)
    expect(parseAssignment(route.segments)).toEqual({ type: 'set', id: 'SET-FOULS' })
    expect(decodeTeamRules(route.params.get('team'), ['GI-FOU-02-A', 'GI-FOU-02-B'])).toEqual({ 'GI-FOU-02-B': RULE })
    expect(assignmentPath({ type: 'question', id: 'GI-FOU-02-B' }, team)).toBe(`#/play/assignment/q/GI-FOU-02-B?team=${team}`)
  })
  it('課題に入っていない問題の約束は読まない', () => {
    const team = encodeTeamRules({ 'GI-FOU-02-B': RULE, 'OF-DRV-01-A': 'ほかの問題' })!
    expect(decodeTeamRules(team, ['GI-FOU-02-B'])).toEqual({ 'GI-FOU-02-B': RULE })
  })
  it('壊れた・いたずらの値はエラーにせず「約束なし」。リンクにも持ち回さない', () => {
    for (const bad of [null, '', '!!!', '<script>', 'abc', 'x'.repeat(9000), encodeTeamRules({ A: 'x' })!.slice(0, -3) + '***']) {
      expect(decodeTeamRules(bad, ['A'])).toEqual({})
    }
    expect(cleanTeamParam('"><script>')).toBeNull()
    expect(cleanTeamParam('x'.repeat(9000))).toBeNull()
    // 形は正しいが中身が違う（版が違う・文字列でない・配列）
    const enc = (v: unknown) => btoa(JSON.stringify(v)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(decodeTeamRules(enc({ v: 2, r: { A: 'x' } }), ['A'])).toEqual({})
    expect(decodeTeamRules(enc({ v: 1, r: { A: 123 } }), ['A'])).toEqual({})
    expect(decodeTeamRules(enc({ v: 1, r: ['x'] }), ['0'])).toEqual({})
    // URL で届いた文も上限で切る
    expect(decodeTeamRules(encodeTeamRules({ A: 'あ'.repeat(TEAM_RULE_MAX_LENGTH) })!, ['A']).A).toHaveLength(TEAM_RULE_MAX_LENGTH)
  })
  it('文はデータとして扱い、HTML として解釈しない（読み戻しても文字のまま）', () => {
    const text = '<img src=x onerror=alert(1)>'
    expect(decodeTeamRules(encodeTeamRules({ A: text }), ['A'])).toEqual({ A: text })
  })
  it('選んだ教材の問題の約束だけを取り出す', () => {
    expect(pickTeamRules({ A: 'a', B: 'b', C: '' }, ['A', 'C', 'D'])).toEqual({ A: 'a' })
  })
})
