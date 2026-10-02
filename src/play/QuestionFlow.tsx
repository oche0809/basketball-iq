import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Court } from '../court/Court.tsx'
import { getCourtState } from '../court/state.ts'
import type { DecisionOption, Question, ReasonStage, Stage } from '../types/content.ts'
import { type QuestionAnswer, answerStage, isStageAnswered, toggleReason } from './answer.ts'
import { DIAGNOSIS_LABELS, FIT_LABELS, QUALITY_LABELS, RECOGNITION_LABELS, diagnose, evaluateReasons, findOption } from './evaluate.ts'
import { Explanation } from './Explanation.tsx'
import { STAGE_HEADINGS, STAGE_NAMES } from './labels.ts'
import { optionSeed, seededShuffle } from './shuffle.ts'

type Props = {
  question: Question
  answer: QuestionAnswer
  onChange: (a: QuestionAnswer) => void
  linkTo: (questionId: string) => string // 「相手が変えたら」から別の問題へ
  finish: ReactNode // 解説の後に出すボタン（次の問題・振り返り・PLAYへ）
  notice?: ReactNode // 解説の上に出すお知らせ（学習記録の保存の結果など）
}

// 1問を「見る → 判断 → なぜ →（次の判断）→ 解説」の順に、1段階ずつ表示する
export function QuestionFlow({ question: q, answer, onChange, linkTo, finish, notice }: Props) {
  const total = q.stages.length
  const idx = Math.min(answer.stageIndex, total)
  const stage: Stage | undefined = q.stages[idx]
  const [pending, setPending] = useState<Record<string, string[]>>({})
  // 「開始時」を表示している段階（段階が変わると自動で「この場面」に戻る）
  const [startShownAt, setStartShownAt] = useState<number | null>(null)
  const showStart = startShownAt === idx
  const setShowStart = (on: boolean) => setStartShownAt(on ? idx : null)
  const topRef = useRef<HTMLDivElement>(null)

  // 段階が変わったら、問いの先頭が見えるようにする（開いた直後は動かさない。画面の外の操作だけで、状態は変えない）
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    topRef.current?.scrollIntoView({ block: 'start' })
  }, [idx, q.id])

  const moment = stage ? stage.id : 'end'
  const courtState = useMemo(() => getCourtState(q, showStart ? 'start' : moment), [q, moment, showStart])
  const hasMotion = (q.court?.steps.length ?? 0) > 0
  const decision = findOption(q.stages.find((s) => s.kind === 'DECISION')?.options ?? [], answer.decision)
  const spotStage = q.stages.find((s): s is Extract<Stage, { kind: 'DECISION' }> => s.kind === 'DECISION' && !!s.spot)
  const showSpots = !!spotStage && (stage?.kind === 'DECISION' || !stage)

  const answered = stage ? isStageAnswered(stage, answer) : true
  const sel = stage ? (pending[stage.id] ?? []) : []
  const go = (i: number) => onChange({ ...answer, stageIndex: i })
  const confirm = () => {
    if (!stage || sel.length === 0) return
    onChange(answerStage(stage, answer, stage.kind === 'REASON' ? sel : sel[0]))
  }
  const choose = (id: string) => {
    if (!stage || answered) return
    setPending((p) => ({ ...p, [stage.id]: stage.kind === 'REASON' ? toggleReason(p[stage.id] ?? [], id, stage.max_select) : [id] }))
  }

  return (
    <div ref={topRef} className="scroll-mt-16">
      <StageProgress q={q} idx={idx} answer={answer} />

      {stage && (
        <div className="mt-2">
          <p className="text-sm font-bold text-[var(--accent-ink)]">
            STEP {idx + 1}　{STAGE_NAMES[stage.kind]}
          </p>
          <h2 id={`stage-${stage.id}`} className="text-xl leading-snug font-extrabold">
            {STAGE_HEADINGS[stage.kind]}
          </h2>
          <p className="text-base font-bold">{stage.prompt}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">状況：{q.situation}</p>
        </div>
      )}

      <div className="mt-2 flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start">
        <div className="flex flex-col gap-2 md:sticky md:top-16">
          {q.court?.hud && <HudBar hud={q.court.hud} />}
          {q.court ? (
            <Court
              court={q.court}
              state={courtState}
              compact
              spots={showSpots && spotStage ? spotStage.options.map((o) => ({ id: o.id, point: o.spot! })) : undefined}
              caption={
                !hasMotion
                  ? '動きのない場面です'
                  : showStart
                    ? '開始時の配置'
                    : `${stage ? `${STAGE_NAMES[stage.kind]}の場面` : '最後まで'}（動き ${courtState?.step ?? 0}/${q.court.steps.length}）`
              }
            />
          ) : (
            <p className="card text-base text-[var(--muted)]">この問題のコート図は準備中です。</p>
          )}
          {hasMotion && (
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="コート図の時点">
              <button type="button" aria-pressed={showStart} onClick={() => setShowStart(true)} className={toggleCls(showStart)}>
                開始時
              </button>
              <button type="button" aria-pressed={!showStart} onClick={() => setShowStart(false)} className={toggleCls(!showStart)}>
                {stage ? 'この場面' : '最後まで'}
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {stage ? (
            <section aria-labelledby={`stage-${stage.id}`} className="flex flex-col gap-3">
              <OptionList q={q} stage={stage} answer={answer} selected={sel} answered={answered} onChoose={choose} />
              {answered && <StageFeedback stage={stage} answer={answer} decision={decision} />}
            </section>
          ) : (
            <>
              {notice}
              <Explanation question={q} answer={answer} linkTo={linkTo} />
            </>
          )}
        </div>
      </div>

      <ActionBar>
        {idx > 0 ? (
          <button type="button" onClick={() => go(idx - 1)} className="btn-secondary flex-1">
            ‹ 戻る
          </button>
        ) : (
          <span className="flex-1" />
        )}
        {stage ? (
          answered ? (
            <button type="button" onClick={() => go(idx + 1)} className="btn-primary flex-[2]">
              {idx + 1 < total ? `次へ（${STAGE_NAMES[q.stages[idx + 1].kind]}）` : '解説を見る'} ›
            </button>
          ) : (
            <button type="button" onClick={confirm} disabled={sel.length === 0} className="btn-primary flex-[2] disabled:opacity-40">
              {sel.length === 0 ? (stage.kind === 'REASON' ? '理由を選ぶ' : '選ぶ') : '決定'}
            </button>
          )
        ) : (
          <div className="flex flex-[2] gap-2">{finish}</div>
        )}
      </ActionBar>
    </div>
  )
}

const toggleCls = (on: boolean) =>
  `min-h-11 rounded-xl border text-sm font-bold ${on ? 'border-[var(--ink)] bg-[var(--ink)] text-white' : 'border-[var(--line)] bg-[var(--surface)]'}`

// 画面下に固定（スマホは下部タブの上、ホームバーとも重ならない）
function ActionBar({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="h-4" />
      <div className="sticky bottom-[calc(4rem+1px+env(safe-area-inset-bottom))] z-20 -mx-4 border-t border-[var(--line)] bg-[var(--bg)]/95 px-4 py-2 backdrop-blur md:bottom-0">
        <div className="mx-auto flex max-w-5xl gap-2">{children}</div>
      </div>
    </>
  )
}

function StageProgress({ q, idx, answer }: { q: Question; idx: number; answer: QuestionAnswer }) {
  const items = [...q.stages.map((s) => ({ key: s.id, name: STAGE_NAMES[s.kind], done: isStageAnswered(s, answer) })), { key: 'explain', name: '解説', done: false }]
  return (
    <ol className="flex flex-wrap items-center gap-1 text-sm font-bold" aria-label="段階">
      {items.map((it, i) => (
        <li key={it.key} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden="true" className="text-[var(--muted)]">→</span>}
          <span
            aria-current={i === idx ? 'step' : undefined}
            className={`rounded-full px-2.5 py-0.5 ${i === idx ? 'bg-[var(--accent)] text-white' : it.done ? 'bg-[var(--accent-soft)] text-[var(--accent-ink)]' : 'bg-[var(--hover)] text-[var(--muted)]'}`}
          >
            {it.done && i !== idx ? '✓ ' : ''}
            {it.name}
          </span>
        </li>
      ))}
    </ol>
  )
}

function OptionList({
  q,
  stage,
  answer,
  selected,
  answered,
  onChoose,
}: {
  q: Question
  stage: Stage
  answer: QuestionAnswer
  selected: string[]
  answered: boolean
  onChoose: (id: string) => void
}) {
  // 並び順は問題ID・段階IDから決まる（リロードしても同じ。Math.random は使わない）
  const options = useMemo(() => seededShuffle<{ id: string; text: string }>(stage.options, optionSeed(q.id, stage.id)), [q.id, stage])
  const chosen = answered ? chosenIds(stage, answer) : selected
  const isReason = stage.kind === 'REASON'
  const max = isReason ? (stage as ReasonStage).max_select : 1
  const full = isReason && !answered && selected.length >= max
  const showLetter = stage.kind === 'DECISION' && !!stage.spot
  return (
    <div>
      {isReason && (
        <p className="mb-1 text-sm font-bold text-[var(--muted)]" aria-live="polite">
          {max}つまで選べます（{chosen.length}/{max}）{full && '　外すには、もう一度押します'}
        </p>
      )}
      <ul className="flex flex-col gap-2" role="list">
        {options.map((o) => {
          const on = chosen.includes(o.id)
          const disabled = answered || (full && !on)
          return (
            <li key={o.id}>
              <button
                type="button"
                aria-pressed={on}
                aria-disabled={disabled}
                onClick={() => !disabled && onChoose(o.id)}
                className={`flex min-h-14 w-full items-center gap-3 rounded-xl border-2 px-3 py-2 text-left text-base font-bold ${
                  on ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--line)] bg-[var(--surface)]'
                } ${disabled && !on ? 'opacity-55' : ''}`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-6 w-6 shrink-0 items-center justify-center border-2 text-sm ${isReason ? 'rounded-md' : 'rounded-full'} ${on ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--muted)]'}`}
                >
                  {on ? '✓' : ''}
                </span>
                {showLetter && <span className="text-[var(--muted)]">{o.id}</span>}
                <span className="flex-1">{o.text}</span>
                {on && <span className="text-sm text-[var(--accent-ink)]">選択中</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function chosenIds(stage: Stage, a: QuestionAnswer): string[] {
  switch (stage.kind) {
    case 'RECOGNITION':
      return a.look ? [a.look] : []
    case 'DECISION':
      return a.decision ? [a.decision] : []
    case 'REASON':
      return a.reasons
    case 'REACTION':
      return a.reaction ? [a.reaction] : []
  }
}

// 答えた直後の評価（その段階の分だけ。全体の解説は最後）
function StageFeedback({ stage, answer, decision }: { stage: Stage; answer: QuestionAnswer; decision: DecisionOption | null }) {
  if (stage.kind === 'RECOGNITION') {
    const o = findOption(stage.options, answer.look)
    if (!o) return null
    return (
      <Feedback title={RECOGNITION_LABELS[o.value]} tone={o.value === 'key' ? 'good' : o.value === 'useful' ? 'mid' : 'low'}>
        <p>{o.feedback}</p>
      </Feedback>
    )
  }
  if (stage.kind === 'DECISION' || stage.kind === 'REACTION') {
    const o = findOption<DecisionOption>(stage.options, stage.kind === 'DECISION' ? answer.decision : answer.reaction)
    if (!o) return null
    return (
      <Feedback title={FIT_LABELS[o.fit]} tone={o.fit === 'priority' ? 'good' : o.fit === 'low' ? 'low' : 'mid'}>
        <p>{o.feedback}</p>
        {o.condition && <p className="mt-1 font-bold">有効になる条件：{o.condition}</p>}
      </Feedback>
    )
  }
  if (!decision) return null
  const results = evaluateReasons(stage, decision.id, answer.reasons)
  const d = DIAGNOSIS_LABELS[diagnose(decision.fit, results)]
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {results.map((r) => (
          <li key={r.option.id} className="card text-base">
            <p className="font-bold">{r.option.text}</p>
            <p className="mt-1 flex flex-wrap gap-1.5 text-sm">
              <span className="rounded-full bg-[var(--hover)] px-2 py-0.5 font-bold">理由の質：{QUALITY_LABELS[r.quality]}</span>
              <span className="rounded-full bg-[var(--hover)] px-2 py-0.5 font-bold">
                {r.supportsChosen ? 'あなたの判断を説明する理由' : r.option.supports.length ? '別の判断を説明する理由' : 'どの判断の説明にもならない理由'}
              </span>
            </p>
            {r.option.note && <p className="mt-1 text-sm text-[var(--muted)]">{r.option.note}</p>}
          </li>
        ))}
      </ul>
      <Feedback title={d.title} tone="info">
        <p>{d.text}</p>
        <p className="mt-1 text-sm text-[var(--muted)]">あなたの判断：{decision.text}（{FIT_LABELS[decision.fit]}）</p>
      </Feedback>
    </div>
  )
}

export function Feedback({ title, tone, children }: { title: string; tone: 'good' | 'mid' | 'low' | 'info'; children: ReactNode }) {
  const cls = {
    good: 'border-[#15803d] bg-[#f0fdf4]',
    mid: 'border-[#1d4ed8] bg-[#eff6ff]',
    low: 'border-[#6b7280] bg-[#f3f4f6]',
    info: 'border-[var(--accent)] bg-[var(--accent-soft)]',
  }[tone]
  return (
    <div className={`rounded-xl border-l-4 p-3 text-base ${cls}`} role="status">
      <p className="font-extrabold">{title}</p>
      {children}
    </div>
  )
}

export function HudBar({ hud }: { hud: NonNullable<NonNullable<Question['court']>['hud']> }) {
  const items = [
    hud.quarter !== undefined && `第${hud.quarter}クォーター`,
    hud.game_clock && `残り ${hud.game_clock}`,
    hud.score && `自チーム ${hud.score.us}－${hud.score.them} 相手`,
    hud.shot_clock !== undefined && `ショットクロック ${hud.shot_clock}秒`,
  ].filter(Boolean) as string[]
  return (
    <p className="flex flex-wrap gap-1.5" aria-label="試合の状況">
      {items.map((t) => (
        <span key={t} className="rounded-lg bg-[var(--ink)] px-2.5 py-1 text-sm font-bold text-white">
          {t}
        </span>
      ))}
    </p>
  )
}
