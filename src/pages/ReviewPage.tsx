import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChipGroup } from '../components/ChipGroup.tsx'
import { PageTitle } from '../components/PageTitle.tsx'
import { BackLink, CategoryChip, Chip, DifficultyChip } from '../components/ui.tsx'
import { useContent } from '../content/context.ts'
import { Court } from '../court/Court.tsx'
import { getCourtState } from '../court/state.ts'
import { FIT_LABELS, QUALITY_LABELS, RECOGNITION_LABELS } from '../play/evaluate.ts'
import { Explanation } from '../play/Explanation.tsx'
import { STAGE_NAMES } from '../play/labels.ts'
import { HudBar } from '../play/QuestionFlow.tsx'
import {
  EMPTY_REVIEW_FILTER,
  type ReviewFilter,
  type ReviewTab,
  filterCurriculumForReview,
  filterQuestionsForReview,
  makeReviewRecord,
  neighbors,
  reviewDetailPath,
  reviewOf,
  reviewQuery,
  reviewStateFromParams,
  statusOf,
  summarize,
} from '../review/reviewModel.ts'
import { REVIEW_STATUSES, REVIEW_STATUS_LABELS, type ReviewRecord, type ReviewStatus } from '../storage/review.ts'
import { type ReviewLoadResult, reviewStore } from '../storage/reviewStore.ts'
import type { Category, CurriculumItem, DecisionOption, Difficulty, Question } from '../types/content.ts'
import { CATEGORY_ORDER, DIFFICULTY_LABELS, gradeLabel } from '../utils/labels.ts'
import { difficultiesIn, gradesIn } from '../utils/mapFilter.ts'
import type { Route } from '../utils/router.ts'
import { Basis, RelatedDrills, RelatedTactics } from './MapPage.tsx'

// 先生の教材レビュー。教材データ（data/）は変更せず、先生のレビュー結果だけをこのブラウザに保存する。
// レビュー結果は、生徒の画面（HOME・PLAY・MAP・課題・MY IQ）の表示には使わない。
// #/coach/review?tab=…&…                 … 一覧（問題・カリキュラム）
// #/coach/review/question/<問題ID>?…      … 問題の詳細
// #/coach/review/curriculum/<項目ID>?…    … カリキュラムの詳細
export function ReviewPage({ route }: { route: Route }) {
  const store = reviewStore()
  const [loaded, setLoaded] = useState<ReviewLoadResult>(() => store.load())
  const reload = () => setLoaded(store.load())
  const [, , kind, rawId] = route.segments
  const { tab, filter } = reviewStateFromParams(route.params)
  const query = reviewQuery(tab, filter)

  if (kind) {
    let id = rawId ?? ''
    try {
      id = decodeURIComponent(id)
    } catch {
      // 壊れたエンコードはそのまま（見つからない ID として扱う）
    }
    if ((kind === 'question' || kind === 'curriculum') && id)
      return <ReviewDetail key={`${kind}|${id}`} kind={kind} id={id} filter={filter} query={query} loaded={loaded} onSaved={reload} />
    return <NotFound id={route.segments.slice(2).join('/')} backHref={`#/coach/review${query}`} />
  }
  return <ReviewList key={query} tab={tab} initial={filter} loaded={loaded} onChanged={reload} />
}

// ---------------- 一覧 ----------------

function ReviewList({ tab: initialTab, initial, loaded, onChanged }: { tab: ReviewTab; initial: ReviewFilter; loaded: ReviewLoadResult; onChanged: () => void }) {
  const c = useContent()
  const [tab, setTab] = useState<ReviewTab>(initialTab)
  const [f, setF] = useState<ReviewFilter>(initial)
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const records = loaded.records
  const update = (patch: Partial<ReviewFilter>) => setF((prev) => ({ ...prev, ...patch }))
  const query = reviewQuery(tab, f)
  // 条件と対象は URL にも残す（履歴を増やさない）。詳細から戻った時・再読み込みした時に同じ一覧になる
  useEffect(() => {
    history.replaceState(null, '', `#/coach/review${query}`)
  }, [query])

  const qSummary = useMemo(() => summarize(c.questions.map((q) => q.id), records, 'question'), [c, records])
  const cSummary = useMemo(() => summarize(c.curriculum.map((i) => i.id), records, 'curriculum'), [c, records])
  const summary = tab === 'question' ? qSummary : cSummary
  const items: { id: string; title: string; category: Category; difficulty: Difficulty; grade: number[] }[] = useMemo(
    () => (tab === 'question' ? filterQuestionsForReview(c, f, records) : filterCurriculumForReview(c, f, records)),
    [c, f, records, tab],
  )
  const source = tab === 'question' ? c.questions : c.curriculum
  const difficulties = useMemo(() => difficultiesIn(source), [source])
  const grades = useMemo(() => gradesIn(source), [source])

  const remove = () => {
    const r = reviewStore().deleteAll()
    setConfirming(false)
    setMessage(r.ok ? 'レビュー記録をすべて削除しました（学習記録は消していません）。' : 'この端末ではレビュー記録を削除できませんでした。')
    onChanged()
  }

  return (
    <>
      <BackLink href="#/coach">COACH へ戻る</BackLink>
      <PageTitle en="COACH" ja="教材レビュー">
        問題とカリキュラムの内容を確かめて、レビューの結果とメモを記録します。
      </PageTitle>
      <p className="mb-3 rounded-xl bg-[var(--hover)] px-3 py-2 text-sm">
        レビューの記録はこのブラウザの中だけに保存されます。教材データは変更しません。生徒の画面（PLAY・MAP・課題・MY IQ）にも影響しません。
      </p>
      {message && (
        <p className="mb-3 rounded-xl bg-[var(--accent-soft)] px-3 py-2 text-base font-bold" role="status">
          {message}
        </p>
      )}
      <LoadNotice loaded={loaded} />

      <div className="grid grid-cols-2 gap-2" role="group" aria-label="レビューする教材">
        {(
          [
            ['question', '問題', qSummary.total],
            ['curriculum', 'カリキュラム', cSummary.total],
          ] as const
        ).map(([key, label, n]) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            className={`min-h-12 rounded-xl border-2 text-base font-bold ${tab === key ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]' : 'border-[var(--line)] bg-[var(--surface)]'}`}
          >
            {label} {n}
          </button>
        ))}
      </div>

      <section className="card mt-3 text-base" aria-label="レビューの進み具合">
        <p className="font-bold">
          {tab === 'question' ? '問題' : 'カリキュラム'}：{summary.reviewed} / {summary.total} 確認済み
        </p>
        <p className="mt-1 text-sm text-[var(--muted)]">（問題とカリキュラムは別々に数えています。「確認済み」は未確認以外）</p>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {REVIEW_STATUSES.map((s) => (
            <li key={s}>
              <Chip tone={s === 'unreviewed' ? 'accent' : 'plain'}>
                {REVIEW_STATUS_LABELS[s]} {s === 'unreviewed' ? `${summary.counts[s]} / ${summary.total}` : summary.counts[s]}
              </Chip>
            </li>
          ))}
        </ul>
        <button
          type="button"
          aria-pressed={f.status === 'unreviewed'}
          onClick={() => update({ status: f.status === 'unreviewed' ? '' : 'unreviewed' })}
          className={`mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-xl border-2 text-base font-bold ${f.status === 'unreviewed' ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--line)] bg-[var(--surface)]'}`}
        >
          {f.status === 'unreviewed' ? '✓ 未確認のみ（解除する）' : '未確認のみ表示'}
        </button>
      </section>

      <div className="card mt-3 flex flex-col gap-3" role="search">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold">キーワード</span>
          <input
            type="search"
            value={f.q}
            onChange={(e) => update({ q: e.target.value })}
            placeholder="例：ドライブ、ヘルプ、OF-DRV"
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
        <ChipGroup
          label="レビュー状態"
          value={f.status}
          options={[{ value: '' as const, text: 'すべて' }, ...REVIEW_STATUSES.map((s) => ({ value: s, text: REVIEW_STATUS_LABELS[s] }))]}
          onChange={(s) => update({ status: s as ReviewStatus | '' })}
        />
        <p className="text-sm text-[var(--muted)]">条件はすべて満たすもの（AND）を表示します。</p>
      </div>

      <h2 className="mt-5 mb-2 text-lg font-bold" aria-live="polite">
        {tab === 'question' ? '問題' : 'カリキュラム'}（{items.length} / {summary.total}）
      </h2>
      {items.length === 0 ? (
        <p className="card text-base text-[var(--muted)]">条件に合う教材はありません。</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2" aria-label={tab === 'question' ? '問題の一覧' : 'カリキュラムの一覧'}>
          {items.map((it) => {
            const st = statusOf(records, tab, it.id)
            return (
              <li key={it.id}>
                <a href={`${reviewDetailPath(tab, it.id)}${query}`} className="card flex h-full flex-col gap-1.5 active:bg-[var(--hover)]">
                  <span className="text-sm text-[var(--muted)]">{it.id}</span>
                  <span className="font-bold leading-snug">{it.title}</span>
                  <span className="flex flex-wrap gap-1.5">
                    <CategoryChip category={it.category} />
                    <DifficultyChip difficulty={it.difficulty} />
                    <Chip>{gradeLabel(it.grade)}</Chip>
                    <Chip tone={st === 'unreviewed' ? 'plain' : 'accent'}>レビュー：{REVIEW_STATUS_LABELS[st]}</Chip>
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      )}

      <section className="card mt-4 text-base" aria-labelledby="review-delete-title">
        <h2 id="review-delete-title" className="text-sm font-bold text-[var(--muted)]">
          レビュー記録の管理
        </h2>
        <p className="text-sm text-[var(--muted)]">消えるのはレビュー記録（状態とメモ）だけです。生徒の学習記録や教材データは消えません。</p>
        {confirming ? (
          <div className="mt-2 rounded-xl border-2 border-[#b91c1c] p-3" role="alertdialog" aria-labelledby="review-delete-confirm">
            <p id="review-delete-confirm" className="font-bold">
              このブラウザに保存されているレビュー記録（問題・カリキュラムの状態とメモ）をすべて削除します。元に戻せません。
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirming(false)} className="btn-secondary">
                やめる
              </button>
              <button type="button" onClick={remove} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#b91c1c] px-4 font-bold text-white">
                削除する
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => (setMessage(null), setConfirming(true))} className="btn-secondary mt-2 w-full">
            レビュー記録をすべて削除
          </button>
        )}
      </section>
    </>
  )
}

function LoadNotice({ loaded }: { loaded: ReviewLoadResult }) {
  const text =
    loaded.status === 'unavailable'
      ? 'この端末ではレビュー記録を読み書きできません（ブラウザの設定によって使えないことがあります）。教材の確認はできます。'
      : loaded.status === 'unreadable'
        ? loaded.reason === 'newer-version'
          ? 'この端末に新しい形式のレビュー記録があるため、表示できません。記録は消さずに残しています。'
          : 'レビュー記録を読み込めませんでした。新しい記録から開始します。（読み込めなかった記録は消さずに残しています）'
        : loaded.invalidCount > 0
          ? `形が壊れていて使えなかったレビュー記録が ${loaded.invalidCount} 件あります（記録は消さずに残しています）。`
          : null
  if (!text) return null
  return (
    <p className="mb-3 rounded-xl bg-[#fef3c7] px-3 py-2 text-base font-bold text-[#92400e]" role="status">
      {text}
    </p>
  )
}

function NotFound({ id, backHref }: { id: string; backHref: string }) {
  return (
    <>
      <BackLink href={backHref}>一覧に戻る</BackLink>
      <div className="card text-base" role="alert">
        <p className="font-bold">指定された教材が見つかりません。</p>
        <p className="mt-1 text-sm break-all text-[var(--muted)]">指定されたID：{id || '（指定なし）'}</p>
        <a href={backHref} className="btn-secondary mt-3">
          レビューの一覧に戻る
        </a>
      </div>
    </>
  )
}

// ---------------- 詳細 ----------------

function ReviewDetail({
  kind,
  id,
  filter,
  query,
  loaded,
  onSaved,
}: {
  kind: ReviewTab
  id: string
  filter: ReviewFilter
  query: string
  loaded: ReviewLoadResult
  onSaved: () => void
}) {
  const c = useContent()
  const item = kind === 'question' ? c.byId.question.get(id) : c.byId.curriculum.get(id)
  const backHref = `#/coach/review${query}`
  if (!item) return <NotFound id={`${kind}/${id}`} backHref={backHref} />
  const records = loaded.records
  const all = kind === 'question' ? c.questions : c.curriculum
  const filtered = kind === 'question' ? filterQuestionsForReview(c, filter, records) : filterCurriculumForReview(c, filter, records)
  const nav = neighbors<{ id: string; title: string }>(all, filtered, id)
  const stillListed = filtered.some((x) => x.id === id)
  const reviewHref = (t: ReviewTab, x: string) => `${reviewDetailPath(t, x)}${reviewQuery(t, t === kind ? filter : EMPTY_REVIEW_FILTER)}`

  return (
    <article className="flex flex-col gap-3">
      <BackLink href={backHref}>一覧に戻る</BackLink>
      <div>
        <p className="text-sm font-bold text-[var(--accent-ink)]">
          {kind === 'question' ? '問題のレビュー' : 'カリキュラムのレビュー'}　{nav.index + 1} / {nav.total}
        </p>
        <p className="text-sm text-[var(--muted)]">{item.id}</p>
        <h1 className="text-xl leading-snug font-extrabold">{item.title}</h1>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <CategoryChip category={item.category} />
          <DifficultyChip difficulty={item.difficulty} />
          <Chip>{gradeLabel(item.grade)}</Chip>
        </div>
      </div>

      <ReviewPanel kind={kind} id={id} record={reviewOf(records, kind, id)} onSaved={onSaved} stillListed={stillListed} filtered={!!filter.status} />

      <nav aria-label="前後の教材" className="grid grid-cols-2 gap-2">
        {nav.prev ? (
          <a href={reviewHref(kind, nav.prev.id)} className="btn-secondary px-2 text-sm">
            ← 前の教材
          </a>
        ) : (
          <span className="flex min-h-12 items-center justify-center text-sm text-[var(--muted)]">（最初の教材）</span>
        )}
        {nav.next ? (
          <a href={reviewHref(kind, nav.next.id)} className="btn-primary px-2 text-sm">
            次の教材 →
          </a>
        ) : (
          <a href={backHref} className="btn-secondary px-2 text-sm">
            一覧に戻る
          </a>
        )}
      </nav>

      {kind === 'question' ? <QuestionReview q={item as Question} reviewHref={reviewHref} /> : <CurriculumReview item={item as CurriculumItem} reviewHref={reviewHref} />}
    </article>
  )
}

const formatTime = (iso: string) => new Date(iso).toLocaleString('ja-JP')
const SAVE_ERROR = 'この端末ではレビュー記録を保存できませんでした。'

function ReviewPanel({
  kind,
  id,
  record,
  onSaved,
  stillListed,
  filtered,
}: {
  kind: ReviewTab
  id: string
  record: ReviewRecord | null
  onSaved: () => void
  stillListed: boolean
  filtered: boolean
}) {
  const status = record?.status ?? 'unreviewed'
  const [note, setNote] = useState(record?.note ?? '')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const dirty = note !== (record?.note ?? '')
  const save = (next: { status: ReviewStatus; note: string }, okText: string) => {
    const r = reviewStore().save(makeReviewRecord(kind, id, next.status, next.note))
    if (r.ok) {
      setMessage({ ok: true, text: okText })
      onSaved()
    } else
      setMessage({
        ok: false,
        text: r.reason === 'newer-version' ? `${SAVE_ERROR}新しい形式のレビュー記録があるため、上書きしていません。` : `${SAVE_ERROR}ブラウザの設定や空き容量を確かめてください。`,
      })
  }
  return (
    <section className="card flex flex-col gap-3 border-2 border-[var(--accent)] text-base" aria-labelledby="review-panel-title">
      <h2 id="review-panel-title" className="text-sm font-bold text-[var(--accent-ink)]">
        先生のレビュー（このブラウザだけに保存）
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="レビュー結果">
        {REVIEW_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            onClick={() => save({ status: s, note: record?.note ?? '' }, `レビュー結果を「${REVIEW_STATUS_LABELS[s]}」にしました。`)}
            className={`min-h-12 rounded-xl border-2 text-base font-bold ${status === s ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--line)] bg-[var(--surface)]'}`}
          >
            {status === s ? '✓ ' : ''}
            {REVIEW_STATUS_LABELS[s]}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-bold">先生用メモ</span>
        <textarea
          value={note}
          maxLength={2000}
          rows={3}
          onChange={(e) => setNote(e.target.value)}
          placeholder="例：選択肢Bの条件を要確認／3年生には少し難しい"
          className="min-h-24 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-base"
        />
      </label>
      <button type="button" disabled={!dirty} onClick={() => save({ status, note }, 'メモを保存しました。')} className="btn-secondary disabled:opacity-40">
        メモを保存
      </button>
      <p className="text-sm text-[var(--muted)]" aria-live="polite">
        {dirty ? 'メモに保存していない変更があります。' : record ? `最終更新：${formatTime(record.updatedAt)}` : 'まだレビューしていません（未確認）。'}
      </p>
      {message && (
        <p role="status" className={`rounded-lg px-3 py-2 text-sm font-bold ${message.ok ? 'bg-[#f0fdf4] text-[#166534]' : 'bg-[#fef3c7] text-[#92400e]'}`}>
          {message.text}
          {message.ok && filtered && !stillListed && '（今の絞り込みの一覧からは外れました。「次の教材」で続けられます）'}
        </p>
      )}
    </section>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card text-base">
      <h2 className="mb-1 text-sm font-bold text-[var(--muted)]">{title}</h2>
      {children}
    </section>
  )
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-bold whitespace-nowrap">{k}</dt>
          <dd className="break-words">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

// 問題の内容。データの順のまま（生徒の画面のように並べ替えない）、評価・条件・根拠もデータのまま表示する
function QuestionReview({ q, reviewHref }: { q: Question; reviewHref: (t: ReviewTab, id: string) => string }) {
  const c = useContent()
  const set = q.set_id ? c.byId.questionSet.get(q.set_id) : undefined
  const cur = c.byId.curriculum.get(q.curriculum_id)
  const moments = ['start', ...q.stages.filter((s) => s.show_until_step !== undefined).map((s) => s.id), 'end']
  const [moment, setMoment] = useState('start')
  const state = useMemo(() => getCourtState(q, moment), [q, moment])
  const hasMotion = (q.court?.steps.length ?? 0) > 0
  const spotStage = q.stages.find((s): s is Extract<Question['stages'][number], { kind: 'DECISION' }> => s.kind === 'DECISION' && !!s.spot)
  const momentLabel = (m: string) => (m === 'start' ? '開始時' : m === 'end' ? '最後まで' : `${STAGE_NAMES[q.stages.find((s) => s.id === m)!.kind]}の場面`)
  const cueName = (id?: string) => (id ? (c.byId.cue.get(id)?.name ?? id) : null)

  return (
    <>
      <Block title="基本情報">
        <Facts
          rows={[
            ['問題ID', q.id],
            ['学習項目', cur ? <a key="cur" href={reviewHref('curriculum', cur.id)} className="inline-flex min-h-11 items-center font-bold text-[var(--accent-ink)] underline">{`${cur.id} ${cur.title}`}</a> : q.curriculum_id],
            ['セット', set ? `${set.title}（${set.id}）` : 'なし（単独の問題）'],
            ['問題の条件', `${q.variant.label}：${q.variant.what_changed}`],
            ['提示', q.presentation === 'ANIMATION' ? '動き（アニメーション）' : '静止'],
            ['手がかり', q.cues.map((x) => cueName(x)).join('、')],
            ['教材データの確認状況', `${q.verification.status}${q.verification.note ? `（${q.verification.note}）` : ''}`],
          ]}
        />
      </Block>

      {set && (
        <Block title="同じセットの問題">
          <ul className="flex flex-col gap-1">
            {set.items.map((x) => (
              <li key={x}>
                {x === q.id ? (
                  <span className="font-bold">{x}（この問題）</span>
                ) : (
                  <a href={reviewHref('question', x)} className="inline-flex min-h-11 items-center font-bold text-[var(--accent-ink)] underline">
                    {x} {c.byId.question.get(x)?.title}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </Block>
      )}

      <Block title="問題の状況">
        <p>{q.situation}</p>
        {q.court?.hud && (
          <div className="mt-2">
            <HudBar hud={q.court.hud} />
          </div>
        )}
        {q.court ? (
          <div className="mt-2 flex flex-col gap-2">
            {hasMotion && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="コート図の時点">
                {moments.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={moment === m}
                    onClick={() => setMoment(m)}
                    className={`min-h-11 rounded-full border px-3 text-sm font-bold ${moment === m ? 'border-[var(--ink)] bg-[var(--ink)] text-white' : 'border-[var(--line)] bg-[var(--surface)]'}`}
                  >
                    {momentLabel(m)}
                  </button>
                ))}
              </div>
            )}
            <Court
              court={q.court}
              state={state}
              compact
              spots={spotStage ? spotStage.options.map((o) => ({ id: o.id, point: o.spot! })) : undefined}
              caption={hasMotion ? `${momentLabel(moment)}（動き ${state?.step ?? 0}/${q.court.steps.length}）` : '動きのない場面です'}
            />
          </div>
        ) : (
          <p className="mt-2 text-[var(--muted)]">この問題のコート図のデータはありません。</p>
        )}
      </Block>

      {q.stages.map((s) => (
        <Block key={s.id} title={`段階「${STAGE_NAMES[s.kind]}」（${s.kind}${'mode' in s ? `・${s.mode}` : ''}${s.show_until_step !== undefined ? `・動き${s.show_until_step}まで` : ''}）`}>
          <p className="font-bold">{s.prompt}</p>
          {s.kind === 'REASON' && <p className="text-sm text-[var(--muted)]">選べる理由の数：{s.max_select}つまで</p>}
          <ul className="mt-2 flex flex-col gap-2">
            {s.kind === 'RECOGNITION' &&
              s.options.map((o) => (
                <Option key={o.id} id={o.id} text={o.text}>
                  <p className="text-sm font-bold">{RECOGNITION_LABELS[o.value]}</p>
                  {o.cue_id && <p className="text-sm">手がかり：{cueName(o.cue_id)}</p>}
                  <p className="text-sm text-[var(--muted)]">{o.feedback}</p>
                </Option>
              ))}
            {(s.kind === 'DECISION' || s.kind === 'REACTION') &&
              (s.options as DecisionOption[]).map((o) => (
                <Option key={o.id} id={o.id} text={o.text}>
                  <p className="text-sm font-bold">{FIT_LABELS[o.fit]}</p>
                  {o.condition && <p className="text-sm">有効になる条件：{o.condition}</p>}
                  {o.cue_id && <p className="text-sm">手がかり：{cueName(o.cue_id)}</p>}
                  <p className="text-sm text-[var(--muted)]">{o.feedback}</p>
                </Option>
              ))}
            {s.kind === 'REASON' &&
              s.options.map((o) => {
                const dec = q.stages.find((x) => x.kind === 'DECISION')
                const supported = o.supports.map((x) => {
                  const d = (dec?.options as DecisionOption[] | undefined)?.find((y) => y.id === x)
                  return d ? `${x}「${d.text}」（${FIT_LABELS[d.fit]}）` : x
                })
                return (
                  <Option key={o.id} id={o.id} text={o.text}>
                    <p className="text-sm font-bold">理由の質：{QUALITY_LABELS[o.quality]}</p>
                    <p className="text-sm">説明する判断：{supported.length ? supported.join('、') : 'なし（どの判断の説明にもならない）'}</p>
                    {o.cue_id && <p className="text-sm">手がかり：{cueName(o.cue_id)}</p>}
                    {o.note && <p className="text-sm text-[var(--muted)]">{o.note}</p>}
                  </Option>
                )
              })}
          </ul>
        </Block>
      ))}

      <section aria-label="解説（生徒が見る内容）" className="flex flex-col gap-3">
        <p className="text-sm font-bold text-[var(--muted)]">▼ 生徒が見る解説（PLAY と同じ表示）</p>
        <Explanation question={q} answer={null} linkTo={(x) => reviewHref('question', x)} />
      </section>
    </>
  )
}

function Option({ id, text, children }: { id: string; text: string; children: ReactNode }) {
  return (
    <li className="rounded-xl border border-[var(--line)] p-3">
      <p className="font-bold">
        <span className="mr-2 text-[var(--muted)]">{id}</span>
        <span>{text}</span>
      </p>
      {children}
    </li>
  )
}

// カリキュラムの内容（データにある項目をそのまま）
function CurriculumReview({ item, reviewHref }: { item: CurriculumItem; reviewHref: (t: ReviewTab, id: string) => string }) {
  const c = useContent()
  const questions = c.questions.filter((q) => q.curriculum_id === item.id)
  const planned = item.question_set ? c.plannedSets.find((s) => s.id === item.question_set) : undefined
  return (
    <>
      <Block title="基本情報">
        <Facts
          rows={[
            ['項目ID', item.id],
            ['分類', item.subcategory],
            ['提示', item.presentation === 'ANIMATION' ? '動き（アニメーション）' : '静止'],
            ['判断の形式', item.decision_type],
            ['手がかり', item.cues.map((x) => c.byId.cue.get(x)?.name ?? x).join('、')],
            ['暗記の危険', `${item.memorization_risk.level}${item.memorization_risk.mitigation ? `（${item.memorization_risk.mitigation}）` : ''}`],
            ['問題セットの計画', planned ? `${planned.title}（${planned.id}）` : (item.question_set ?? 'なし')],
            ['教材データの確認状況', `${item.verification.status}${item.verification.rule_check ? `（${item.verification.rule_check}）` : ''}`],
          ]}
        />
      </Block>
      <Block title="学習目標">
        <p>{item.learning_goal}</p>
      </Block>
      <Block title="場面">
        <p>{item.situation}</p>
      </Block>
      <div className="grid gap-3 md:grid-cols-2">
        <Block title="① 何を見る？（見る問い）">
          <p className="font-bold">{item.sample_questions.recognition}</p>
        </Block>
        <Block title="② どう判断する？（判断の問い）">
          <p className="font-bold">{item.sample_questions.decision}</p>
        </Block>
      </div>
      <Block title="判断ポイント（見る → 判断）">
        <p>
          見る：{item.decision_point.look_at} → {item.decision_point.decide}
        </p>
      </Block>
      <Block title="よくある間違い">
        <ul className="list-disc pl-5">
          {item.common_mistakes.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </Block>
      <Block title="この項目の問題">
        {questions.length === 0 ? (
          <p className="text-[var(--muted)]">この項目の問題は、まだ教材データにありません。</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {questions.map((q) => (
              <li key={q.id}>
                <a href={reviewHref('question', q.id)} className="inline-flex min-h-11 items-center font-bold text-[var(--accent-ink)] underline">
                  {q.id} {q.title}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Block>
      <RelatedDrills item={item} />
      <RelatedTactics item={item} />
      <Basis item={item} />
      <Block title="v2 設計レビューでの判定（教材データにある内容）">
        <p>
          {item.review.verdict}
          {item.review.note && `：${item.review.note}`}
        </p>
        <p className="mt-1 text-sm text-[var(--muted)]">これは教材を作った時の設計レビューの記録です。上の「先生のレビュー」とは別のものです。</p>
      </Block>
    </>
  )
}
