import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { BasisBoxes } from '../components/BasisBoxes.tsx'
import { ChipGroup } from '../components/ChipGroup.tsx'
import { PageTitle } from '../components/PageTitle.tsx'
import { BackLink, CategoryChip, Chip, DifficultyChip } from '../components/ui.tsx'
import { useContent } from '../content/context.ts'
import type { Category, CurriculumItem, Difficulty } from '../types/content.ts'
import { CATEGORY_ORDER, DIFFICULTY_LABELS, gradeLabel } from '../utils/labels.ts'
import { EMPTY_FILTER, type MapFilter, difficultiesIn, filterCurriculum, filterFromParams, filterToQuery, gradesIn } from '../utils/mapFilter.ts'
import type { Route } from '../utils/router.ts'

// #/map?q=…&cat=…&diff=…&grade=…  … 一覧と絞り込み
// #/map/<項目ID>?（同じ条件）      … 項目の詳細（戻ると同じ絞り込みに戻る）
export function MapPage({ route }: { route: Route }) {
  const id = route.segments[1]
  const query = filterToQuery(filterFromParams(route.params))
  if (id) return <ItemDetail id={id} backHref={`#/map${query}`} />
  return <MapList key={query} initial={filterFromParams(route.params)} />
}

function MapList({ initial }: { initial: MapFilter }) {
  const c = useContent()
  const [f, setF] = useState<MapFilter>(initial)
  const results = useMemo(() => filterCurriculum(c.curriculum, f, (id) => c.byId.cue.get(id)?.name), [c, f])
  const difficulties = useMemo(() => difficultiesIn(c.curriculum), [c])
  const grades = useMemo(() => gradesIn(c.curriculum), [c])

  // 条件は URL にも残す（履歴を増やさない replaceState）。詳細から戻った時・直接開いた時に同じ条件になる
  // 続けて操作しても前の条件に戻らないよう、常に最新の条件をもとに変える
  const update = (patch: Partial<MapFilter>) => setF((prev) => ({ ...prev, ...patch }))
  useEffect(() => {
    history.replaceState(null, '', `#/map${filterToQuery(f)}`)
  }, [f])
  const query = filterToQuery(f)
  const active = f.q || f.cat || f.diff || f.grade !== null

  return (
    <>
      <PageTitle en="MAP" ja="知る">
        {c.curriculum.length}の学習項目から、試合で「何を見て、どう判断するか」を調べられます。
      </PageTitle>

      <div className="card flex flex-col gap-3" role="search">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold">キーワード</span>
          <input
            type="search"
            value={f.q}
            onChange={(e) => update({ q: e.target.value })}
            placeholder="例：ヘルプ、クローズアウト、2対1"
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
      </div>

      <div className="mt-4 mb-2 flex items-center justify-between gap-2">
        <p className="text-base font-bold" aria-live="polite">
          {results.length}件{active && ` ／ ${c.curriculum.length}件中`}
        </p>
        {active && (
          <button type="button" onClick={() => update(EMPTY_FILTER)} className="min-h-11 px-2 text-base font-bold text-[var(--accent-ink)]">
            条件をクリア
          </button>
        )}
      </div>

      {results.length === 0 ? (
        <p className="card text-base text-[var(--muted)]">条件に合う項目がありません。条件を減らしてみてください。</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {results.map((it) => (
            <li key={it.id}>
              <a href={`#/map/${encodeURIComponent(it.id)}${query}`} className="card flex h-full flex-col gap-1.5 active:bg-[var(--hover)]">
                <span className="font-bold leading-snug">{it.title}</span>
                <span className="flex flex-wrap gap-1.5">
                  <CategoryChip category={it.category} />
                  <DifficultyChip difficulty={it.difficulty} />
                  <Chip>{gradeLabel(it.grade)}</Chip>
                </span>
                <span className="text-sm text-[var(--muted)]">{it.learning_goal}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function ItemDetail({ id, backHref }: { id: string; backHref: string }) {
  const c = useContent()
  const it = c.byId.curriculum.get(id)
  if (!it)
    return (
      <>
        <BackLink href={backHref}>MAP へ戻る</BackLink>
        <p className="card text-base">学習項目「{id}」が見つかりません。</p>
      </>
    )
  const questions = c.questions.filter((q) => q.curriculum_id === it.id)
  return (
    <article className="flex flex-col gap-3">
      <div>
        <BackLink href={backHref}>MAP へ戻る</BackLink>
        <h1 className="text-xl leading-snug font-extrabold">{it.title}</h1>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <CategoryChip category={it.category} />
          <DifficultyChip difficulty={it.difficulty} />
          <Chip>{gradeLabel(it.grade)}</Chip>
          <Chip>{it.subcategory}</Chip>
        </div>
      </div>

      <Section title="学習目標">
        <p>{it.learning_goal}</p>
      </Section>
      <Section title="場面">
        <p>{it.situation}</p>
      </Section>

      <div className="grid gap-3 md:grid-cols-2">
        <Section title="① 何を見る？">
          <p className="font-bold">{it.sample_questions.recognition}</p>
        </Section>
        <Section title="② どう判断する？">
          <p className="font-bold">{it.sample_questions.decision}</p>
        </Section>
      </div>

      {questions.length > 0 && (
        <Section title="この項目の問題">
          <ul className="flex flex-col gap-2">
            {questions.map((q) => (
              <li key={q.id}>
                <a href={`#/play/q/${encodeURIComponent(q.id)}`} className="btn-secondary w-full justify-between">
                  <span className="text-left">{q.title}</span>
                  <span aria-hidden="true">›</span>
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <RelatedDrills item={it} />
      <RelatedTactics item={it} />
      <Basis item={it} />
    </article>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card text-base">
      <h2 className="mb-1 text-sm font-bold text-[var(--muted)]">{title}</h2>
      {children}
    </section>
  )
}

export function RelatedDrills({ item }: { item: CurriculumItem }) {
  const c = useContent()
  return (
    <Section title="関連する練習（練習メニュー倉庫）">
      {item.related_drills.length === 0 ? (
        <p className="text-[var(--muted)]">登録されている関連練習はありません。</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {item.related_drills.map((d) => {
            const drill = c.byId.drill.get(d)
            return (
              <li key={d}>
                {drill ? (
                  <>
                    <span className="mr-2 text-sm text-[var(--muted)]">{drill.id}</span>
                    {drill.title}
                  </>
                ) : (
                  <span className="text-[var(--muted)]">関連練習を表示できません（{d}）</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}

export function RelatedTactics({ item }: { item: CurriculumItem }) {
  if (item.related_tactics.length === 0) return null
  return (
    <Section title="関連する戦術（作戦盤）">
      <p className="flex flex-wrap gap-1.5">
        {item.related_tactics.map((t) => (
          <Chip key={t}>{t}</Chip>
        ))}
      </p>
      <p className="mt-1 text-sm text-[var(--muted)]">作戦盤の戦術ID・守備パターンIDです。名前と動きは作戦盤で確認できます。</p>
    </Section>
  )
}

// 根拠：教材内容の根拠だけを、種類ごとに分けて表示する（研究は「教え方」の根拠なので、ここには出さない）
export function Basis({ item }: { item: CurriculumItem }) {
  const c = useContent()
  return (
    <BasisBoxes
      practiceTitles={item.evidence.filter((e) => e.basis === 'COACHING_PRACTICE').map((e) => c.byId.source.get(e.source_id)?.title ?? e.source_id)}
      teamRule={item.evidence.some((e) => e.basis === 'TEAM_RULE')}
      rules={item.rule_refs
        .map((id) => c.byId.rule.get(id))
        .filter((r) => !!r)
        .map((rule) => ({ rule, sourceTitle: c.byId.source.get(rule.source_id)?.title ?? rule.source_id }))}
      reviewNote={item.verification.needs_coach_review ? 'この項目は先生の確認前です。' : '先生が確認した項目です。'}
    />
  )
}
