import { useMemo, useState } from 'react'
import { type AssignmentTarget, assignmentPath, assignmentUrl, copyText } from '../coach/assignment.ts'
import { filterQuestions, filterSets } from '../coach/coachFilter.ts'
import { encodeTeamRules, pickTeamRules } from '../coach/teamRuleParam.ts'
import { DEFAULT_PROFILE, mergeTeamRules } from '../storage/teamRule.ts'
import { teamRuleStore } from '../storage/teamRuleStore.ts'
import { ChipGroup } from '../components/ChipGroup.tsx'
import { PageTitle } from '../components/PageTitle.tsx'
import { CategoryChip, Chip, DifficultyChip } from '../components/ui.tsx'
import { useContent } from '../content/context.ts'
import { orderedItems } from '../play/setOrder.ts'
import type { Category, Difficulty } from '../types/content.ts'
import { CATEGORY_ORDER, DIFFICULTY_LABELS, SET_KIND_LABELS, gradeLabel } from '../utils/labels.ts'
import { EMPTY_FILTER, type MapFilter, difficultiesIn, gradesIn } from '../utils/mapFilter.ts'

// 先生用：問題かセットを1つ選び、生徒に配る課題URLを作る。
// URLには教材のIDと、先生が選んだ場合のチームの約束だけを入れる。生徒の回答は先生に送られない（各自の端末にだけ記録される）。
export function CoachPage() {
  const c = useContent()
  const [f, setF] = useState<MapFilter>(EMPTY_FILTER)
  const [selected, setSelected] = useState<AssignmentTarget | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [copy, setCopy] = useState<'idle' | 'ok' | 'failed'>('idle')
  const [teamLoaded] = useState(() => teamRuleStore().load()) // このブラウザに保存したチームの約束
  const [withTeam, setWithTeam] = useState(true)
  // どの約束を入れるか（相手ごとの約束がない問題は、いつもの約束を使う）
  const [profile, setProfile] = useState(DEFAULT_PROFILE)
  const teamRules = useMemo(() => mergeTeamRules(teamLoaded.byProfile, profile), [teamLoaded, profile])
  const update = (patch: Partial<MapFilter>) => setF((prev) => ({ ...prev, ...patch }))
  const sets = useMemo(() => filterSets(c, f), [c, f])
  const questions = useMemo(() => filterQuestions(c, f), [c, f])
  // 難易度・学年の選択肢は、問題のデータにある値だけ
  const difficulties = useMemo(() => difficultiesIn(c.questions), [c])
  const grades = useMemo(() => gradesIn(c.questions), [c])

  const select = (t: AssignmentTarget) => {
    setSelected(t)
    setUrl(null)
    setCopy('idle')
  }
  const selectedTitle = selected ? (selected.type === 'set' ? c.byId.questionSet.get(selected.id)?.title : c.byId.question.get(selected.id)?.title) : null
  // 選んだ教材の問題に、チームの約束があれば URL に入れられる
  const selectedIds = selected ? (selected.type === 'set' ? (c.byId.questionSet.get(selected.id)?.items ?? []) : [selected.id]) : []
  const teamCount = Object.keys(pickTeamRules(teamRules, selectedIds)).length
  const team = withTeam ? encodeTeamRules(pickTeamRules(teamRules, selectedIds)) : null
  const isSel = (t: AssignmentTarget) => selected?.type === t.type && selected.id === t.id
  const doCopy = async () => {
    if (!url) return
    setCopy((await copyText(url)) ? 'ok' : 'failed')
  }

  return (
    <>
      <PageTitle en="COACH" ja="先生用">
        問題かセットを1つ選んで、生徒に配る課題URLを作ります。
      </PageTitle>
      <a href="#/coach/review" className="btn-secondary mb-3 w-full justify-between">
        <span>教材レビュー（問題・カリキュラムを確認して記録）</span>
        <span aria-hidden="true">›</span>
      </a>
      <p className="mb-3 rounded-xl bg-[var(--hover)] px-3 py-2 text-sm">
        URLには教材のIDと、選んだ場合はチームの約束だけが入ります（名前などの個人情報は入りません）。生徒の回答は先生には送られず、それぞれの端末の中だけに記録されます。チームの約束（いつもの約束・相手ごとの約束）は、教材レビューの問題のページで書けます。相手ごとの約束の名前はURLに入りません。
      </p>

      <div className="card flex flex-col gap-3" role="search">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold">キーワード</span>
          <input
            type="search"
            value={f.q}
            onChange={(e) => update({ q: e.target.value })}
            placeholder="例：ドライブ、2対1、ショットクロック"
            className="min-h-12 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 text-base"
          />
        </label>
        <ChipGroup
          label="カテゴリー"
          value={f.cat}
          options={[{ value: '' as const, text: 'すべて' }, ...CATEGORY_ORDER.map((cat) => ({ value: cat, text: cat === 'GAME_IQ' ? 'GAME IQ' : cat }))]}
          onChange={(cat) => update({ cat: cat as Category | '' })}
        />
        <ChipGroup
          label="難易度"
          value={f.diff}
          options={[{ value: '' as const, text: 'すべて' }, ...difficulties.map((d) => ({ value: d, text: DIFFICULTY_LABELS[d] }))]}
          onChange={(diff) => update({ diff: diff as Difficulty | '' })}
        />
        <ChipGroup
          label="学年"
          value={f.grade === null ? '' : String(f.grade)}
          options={[{ value: '', text: 'すべて' }, ...grades.map((g) => ({ value: String(g), text: `${g}年` }))]}
          onChange={(g) => update({ grade: g ? Number(g) : null })}
        />
        <p className="text-sm text-[var(--muted)]">条件はすべて満たすもの（AND）を表示します。セットは、条件をすべて満たす問題が1問以上入っているものを表示します。</p>
      </div>

      <h2 className="mt-5 mb-2 text-lg font-bold" aria-live="polite">
        セット（{sets.length}）
      </h2>
      {sets.length === 0 ? (
        <p className="card text-base text-[var(--muted)]">条件に合うセットはありません。</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2" aria-label="セットの一覧">
          {sets.map((s) => {
            const t: AssignmentTarget = { type: 'set', id: s.id }
            const cats = [...new Set(s.items.map((id) => c.byId.question.get(id)?.category).filter(Boolean))] as Category[]
            return (
              <li key={s.id}>
                <button type="button" aria-pressed={isSel(t)} onClick={() => select(t)} className={pickCls(isSel(t))}>
                  <span className="font-bold">{s.title}</span>
                  <span className="flex flex-wrap gap-1.5">
                    <Chip>全{s.items.length}問</Chip>
                    {cats.map((cat) => (
                      <CategoryChip key={cat} category={cat} />
                    ))}
                  </span>
                  {SET_KIND_LABELS[s.kind] && <span className="text-sm text-[var(--muted)]">{SET_KIND_LABELS[s.kind]}</span>}
                  <span className="text-sm text-[var(--muted)]">
                    {s.id}　出題順：{orderedItems(s).join(' → ')}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <h2 className="mt-5 mb-2 text-lg font-bold" aria-live="polite">
        問題（1問だけ出す）（{questions.length}）
      </h2>
      {questions.length === 0 ? (
        <p className="card text-base text-[var(--muted)]">条件に合う問題はありません。</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2" aria-label="問題の一覧">
          {questions.map((q) => {
            const t: AssignmentTarget = { type: 'question', id: q.id }
            const set = q.set_id ? c.byId.questionSet.get(q.set_id) : undefined
            return (
              <li key={q.id}>
                <button type="button" aria-pressed={isSel(t)} onClick={() => select(t)} className={pickCls(isSel(t))}>
                  <span className="font-bold">{q.title}</span>
                  <span className="flex flex-wrap gap-1.5">
                    <CategoryChip category={q.category} />
                    <DifficultyChip difficulty={q.difficulty} />
                    <Chip>{gradeLabel(q.grade)}</Chip>
                  </span>
                  <span className="text-sm text-[var(--muted)]">
                    {q.id}
                    {set && `　セット「${set.title}」の問題`}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* 選んだ教材と課題URL（画面下に固定。スマホは下部タブの上） */}
      <div className="h-4" />
      <section
        aria-label="課題URL"
        className="sticky bottom-[calc(4rem+1px+env(safe-area-inset-bottom))] z-20 -mx-4 border-t border-[var(--line)] bg-[var(--bg)]/95 px-4 py-2 backdrop-blur md:bottom-0"
      >
        <div className="mx-auto flex max-w-5xl flex-col gap-1.5">
          <p className="truncate text-sm">
            {selected ? (
              <>
                選択中：<b>{selected.type === 'set' ? 'セット' : '問題'}「{selectedTitle}」</b>
              </>
            ) : (
              'セットか問題を1つ選んでください。'
            )}
          </p>
          {selected && teamLoaded.profiles.length > 0 && (
            <label className="flex items-center gap-2 text-sm font-bold">
              <span className="shrink-0">入れる約束</span>
              <select
                value={profile}
                onChange={(e) => {
                  setProfile(e.target.value)
                  setUrl(null)
                  setCopy('idle')
                }}
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-2 text-base"
              >
                <option value={DEFAULT_PROFILE}>いつもの約束</option>
                {teamLoaded.profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    相手ごと：{p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {teamCount > 0 && (
            <label className="flex min-h-11 items-center gap-2 text-sm font-bold">
              <input
                type="checkbox"
                checked={withTeam}
                onChange={(e) => {
                  setWithTeam(e.target.checked)
                  setUrl(null)
                  setCopy('idle')
                }}
                className="size-5"
              />
              チームの約束（{teamCount}問分）もURLに入れる
            </label>
          )}
          {!url ? (
            <button type="button" disabled={!selected} onClick={() => selected && setUrl(assignmentUrl(window.location.href, selected, team))} className="btn-primary w-full disabled:opacity-40">
              課題URLを作成
            </button>
          ) : (
            <>
              <label className="flex flex-col gap-0.5">
                <span className="sr-only">課題URL（長押し・選択してコピーもできます）</span>
                <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-describedby="copy-status" className="min-h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-sm" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={doCopy} className="btn-primary px-2" aria-label="課題URLをコピー">
                  URLをコピー
                </button>
                <a href={selected ? assignmentPath(selected, team) : '#/coach'} className="btn-secondary px-2">
                  開いて確認
                </a>
              </div>
              <p id="copy-status" role="status" aria-live="polite" className="text-sm leading-snug font-bold empty:hidden">
                {copy === 'ok' && '✓ コピーしました。LINE や Classroom などに貼って配れます。'}
                {copy === 'failed' && '自動でコピーできませんでした。上のURLを長押し（PCは選択）してコピーしてください。'}
              </p>
            </>
          )}
        </div>
      </section>
    </>
  )
}

const pickCls = (on: boolean) =>
  `flex min-h-14 w-full flex-col items-start gap-1 rounded-xl border-2 p-3 text-left text-base ${on ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--line)] bg-[var(--surface)]'}`
