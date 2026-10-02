import { useState } from 'react'
import { type AssignmentTarget, assignmentPath, assignmentSource, parseAssignment } from '../coach/assignment.ts'
import { PageTitle } from '../components/PageTitle.tsx'
import { BackLink, CategoryChip, Chip, DifficultyChip } from '../components/ui.tsx'
import { useContent } from '../content/context.ts'
import { emptyAnswer, isFinished, type QuestionAnswer } from '../play/answer.ts'
import { QuestionFlow } from '../play/QuestionFlow.tsx'
import type { RecordOutcome } from '../play/record.ts'
import { appRecorder, newSolveSessionId } from '../play/recorder.ts'
import { SaveNotice } from '../play/SaveNotice.tsx'
import { SetReview } from '../play/SetReview.tsx'
import { orderedItems } from '../play/setOrder.ts'
import type { Question, QuestionSet } from '../types/content.ts'
import { SET_KIND_LABELS, gradeLabel } from '../utils/labels.ts'
import type { Route } from '../utils/router.ts'

// #/play                     … 問題セット一覧・単独問題一覧
// #/play/set/<セットID>?q=<問題ID> … セットの問題を順に解く（最後は ?review=1 で振り返り）
// #/play/q/<問題ID>           … 単独で解く
// #/play/assignment/set/<セットID>・#/play/assignment/q/<問題ID> … 先生の課題URL（解き方は同じ。記録の source だけが変わる）
// どれも「見る → 判断 → なぜ →（次の判断）→ 解説」の順
export function PlayPage({ route }: { route: Route }) {
  const [, kind, id] = route.segments
  const target = parseAssignment(route.segments)
  if (target) {
    const entry: Entry = { kind: 'assignment', target }
    if (target.type === 'set')
      return <SetView key={`a|${target.id}`} setId={target.id} questionId={route.params.get('q')} review={route.params.get('review') === '1'} entry={entry} />
    return <SingleView key={`a|${target.id}`} questionId={target.id} entry={entry} />
  }
  if (kind === 'assignment') return <Missing what="課題" id={route.segments.slice(2).join('/') || '（指定なし）'} assignment />
  if (kind === 'set' && id) return <SetView key={id} setId={id} questionId={route.params.get('q')} review={route.params.get('review') === '1'} entry={PRACTICE} />
  if (kind === 'q' && id) return <SingleView key={id} questionId={id} entry={PRACTICE} />
  return <PlayList />
}

// 入口：通常の練習か、先生の課題URLか。QuestionFlow には渡さない（変わるのは記録の source とリンク先だけ）
type Entry = { kind: 'practice' } | { kind: 'assignment'; target: AssignmentTarget }
const PRACTICE: Entry = { kind: 'practice' }
const sourceOf = (e: Entry) => (e.kind === 'assignment' ? assignmentSource(e.target) : ({ type: 'practice' } as const))

function AssignmentBanner({ entry, title }: { entry: Entry; title: string }) {
  if (entry.kind !== 'assignment') return null
  return (
    <p className="mb-2 rounded-xl bg-[var(--ink)] px-3 py-2 text-sm font-bold text-white">
      先生からの課題：{entry.target.type === 'set' ? 'セット' : '問題'}「{title}」
    </p>
  )
}

function PlayList() {
  const c = useContent()
  const singles = c.questions.filter((q) => !q.set_id)
  return (
    <>
      <PageTitle en="PLAY" ja="考える">
        問題セットは、同じ場面で少しだけ条件が違う問題を続けて解きます。
      </PageTitle>

      <h2 className="mt-2 mb-2 text-lg font-bold">問題セット（{c.questionSets.length}）</h2>
      <ul className="grid gap-3 md:grid-cols-2">
        {c.questionSets.map((s) => (
          <li key={s.id} className="card flex flex-col gap-2">
            <p className="text-lg leading-snug font-extrabold">{s.title}</p>
            <div className="flex flex-wrap gap-1.5">
              <Chip>全{s.items.length}問</Chip>
              {SET_KIND_LABELS[s.kind] && <Chip tone="accent">{SET_KIND_LABELS[s.kind]}</Chip>}
            </div>
            <p className="text-base text-[var(--muted)]">{s.intro}</p>
            <a href={`#/play/set/${encodeURIComponent(s.id)}`} className="btn-primary mt-auto w-full">
              START
            </a>
          </li>
        ))}
      </ul>

      <h2 className="mt-6 mb-2 text-lg font-bold">単独の問題（{singles.length}）</h2>
      <ul className="grid gap-2 md:grid-cols-2">
        {singles.map((q) => (
          <li key={q.id}>
            <a href={`#/play/q/${encodeURIComponent(q.id)}`} className="card flex min-h-16 items-center justify-between gap-3 active:bg-[var(--hover)]">
              <span className="min-w-0">
                <span className="block font-bold">{q.title}</span>
                <span className="mt-1 flex flex-wrap gap-1.5">
                  <CategoryChip category={q.category} />
                  <DifficultyChip difficulty={q.difficulty} />
                </span>
                <span className="mt-1 block text-sm text-[var(--muted)]">{q.id}</span>
              </span>
              <span aria-hidden="true" className="text-2xl text-[var(--muted)]">
                ›
              </span>
            </a>
          </li>
        ))}
      </ul>
    </>
  )
}

// セットの中の問題を順に解く。回答はこの画面の中だけで持つ（保存は STEP 6）
function SetView({ setId, questionId, review, entry }: { setId: string; questionId: string | null; review: boolean; entry: Entry }) {
  const c = useContent()
  const [answers, setAnswers] = useState<Record<string, QuestionAnswer>>({})
  const [saved, setSaved] = useState<Record<string, RecordOutcome>>({})
  const [session] = useState(newSolveSessionId) // このセットを開いた1回（開き直すと別の回）
  const set = c.byId.questionSet.get(setId)
  if (!set) return <Missing what="セット" id={setId} assignment={entry.kind === 'assignment'} />
  const items = orderedItems(set)
    .map((id) => c.byId.question.get(id))
    .filter((q): q is Question => !!q)
  // 課題URLから開いた時は、課題のURLのまま問題を進める
  const base = entry.kind === 'assignment' ? assignmentPath({ type: 'set', id: set.id }) : `#/play/set/${encodeURIComponent(set.id)}`
  const href = (id: string) => `${base}?q=${encodeURIComponent(id)}`
  const reviewHref = `${base}?review=1`
  const linkTo = (id: string) => (items.some((q) => q.id === id) ? href(id) : `#/play/q/${encodeURIComponent(id)}`)

  if (review)
    return (
      <>
        <BackLink href="#/play">PLAY へ戻る</BackLink>
        <AssignmentBanner entry={entry} title={set.title} />
        <SetReview set={set} items={items} answers={answers} questionHref={href} />
        <a href={href(items[0].id)} className="btn-secondary mt-3 w-full">
          最初の問題に戻る
        </a>
      </>
    )

  const current = items.find((q) => q.id === questionId) ?? items[0]
  const index = items.indexOf(current)
  const next = items[index + 1]
  return (
    <>
      <BackLink href="#/play">PLAY へ戻る</BackLink>
      <AssignmentBanner entry={entry} title={set.title} />
      <SetHeader set={set} />
      <nav aria-label="セットの問題" className="mt-2 flex gap-2">
        {items.map((q, i) => (
          <a
            key={q.id}
            href={href(q.id)}
            aria-current={q.id === current.id ? 'true' : undefined}
            className={`flex min-h-11 flex-1 items-center justify-center rounded-xl border text-sm font-bold ${q.id === current.id ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]' : 'border-[var(--line)] bg-[var(--surface)]'}`}
          >
            {answers[q.id] && isFinished(q, answers[q.id]) ? '✓ ' : ''}問題{i + 1}
          </a>
        ))}
      </nav>
      <h2 className="mt-3 text-lg leading-snug font-extrabold">
        問題{index + 1}／{items.length}　{current.title}
      </h2>
      <QuestionFlow
        key={current.id}
        question={current}
        answer={answers[current.id] ?? emptyAnswer()}
        onChange={(a) => {
          setAnswers((prev) => ({ ...prev, [current.id]: a }))
          // 解説まで終えた時点で1回だけ保存（同じ回の同じ問題は二重に保存しない）
          const outcome = appRecorder().complete(`${session}|${current.id}`, current, a, { setId: set.id, questionIndex: index + 1, source: sourceOf(entry) })
          if (outcome.status !== 'skipped') setSaved((prev) => ({ ...prev, [current.id]: outcome }))
        }}
        notice={<SaveNotice outcome={saved[current.id]} />}
        linkTo={linkTo}
        finish={
          next ? (
            <a href={href(next.id)} className="btn-primary w-full">
              次の問題 ›
            </a>
          ) : (
            <a href={reviewHref} className="btn-primary w-full">
              振り返りへ ›
            </a>
          )
        }
      />
    </>
  )
}

function SetHeader({ set }: { set: QuestionSet }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
      <h1 className="text-lg leading-snug font-extrabold">
        {set.title}
        <span className="ml-2 text-sm font-bold text-[var(--accent-ink)]">全{set.items.length}問</span>
      </h1>
      <p className="text-sm">{set.intro}</p>
    </div>
  )
}

// 単独で開いた問題（セットの問題でも、ここではセットとして進めない）
function SingleView({ questionId, entry }: { questionId: string; entry: Entry }) {
  const c = useContent()
  const [answer, setAnswer] = useState<QuestionAnswer>(emptyAnswer)
  const [saved, setSaved] = useState<RecordOutcome>()
  const [session] = useState(newSolveSessionId) // この問題を開いた1回（開き直すと別の回）
  const q = c.byId.question.get(questionId)
  if (!q) return <Missing what="問題" id={questionId} assignment={entry.kind === 'assignment'} />
  const set = q.set_id ? c.byId.questionSet.get(q.set_id) : undefined
  return (
    <>
      <BackLink href="#/play">PLAY へ戻る</BackLink>
      <AssignmentBanner entry={entry} title={q.title} />
      <div className="flex flex-wrap items-center gap-1.5">
        <CategoryChip category={q.category} />
        <DifficultyChip difficulty={q.difficulty} />
        <Chip>{gradeLabel(q.grade)}</Chip>
        {q.verification.status === 'draft' && <Chip>先生の確認前</Chip>}
      </div>
      <h1 className="mt-1 text-xl leading-snug font-extrabold">{q.title}</h1>
      <QuestionFlow
        question={q}
        answer={answer}
        onChange={(a) => {
          setAnswer(a)
          const outcome = appRecorder().complete(`${session}|${q.id}`, q, a, { setId: null, questionIndex: null, source: sourceOf(entry) })
          if (outcome.status !== 'skipped') setSaved(outcome)
        }}
        notice={<SaveNotice outcome={saved} />}
        linkTo={(id) => `#/play/q/${encodeURIComponent(id)}`}
        finish={
          entry.kind === 'assignment' ? (
            <a href="#/play" className="btn-primary w-full">
              課題はここまで。PLAY へ
            </a>
          ) : set ? (
            <a href={`#/play/set/${encodeURIComponent(set.id)}?q=${encodeURIComponent(q.id)}`} className="btn-primary w-full">
              このセットで解く ›
            </a>
          ) : (
            <a href="#/play" className="btn-primary w-full">
              PLAY へ戻る
            </a>
          )
        }
      />
    </>
  )
}

// 見つからない時は、似た教材や今日の問題に置き換えない。何が見つからないかをそのまま伝える
function Missing({ what, id, assignment }: { what: string; id: string; assignment?: boolean }) {
  return (
    <div className="card text-base" role="alert">
      <p className="font-bold">この{what}は見つかりませんでした。</p>
      <p className="mt-1 text-sm break-all text-[var(--muted)]">指定されたID：{id}</p>
      {assignment && <p className="mt-1">課題のURLが正しいか、先生に確認してください。</p>}
      <a href="#/play" className="btn-secondary mt-3">
        PLAY へ戻る
      </a>
    </div>
  )
}
