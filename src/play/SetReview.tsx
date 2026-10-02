import { useState } from 'react'
import { useContent } from '../content/context.ts'
import type { DecisionOption, Question, QuestionSet, ReasonStage } from '../types/content.ts'
import { type QuestionAnswer, isFinished } from './answer.ts'
import { DIAGNOSIS_LABELS, FIT_LABELS, RECOGNITION_LABELS, diagnose, evaluateReasons, findOption } from './evaluate.ts'
import { Feedback } from './QuestionFlow.tsx'

// セットの振り返り：このページで答えた内容だけから、事実として言えることを表示する。
// 点数・得意／苦手・タイプ分けはしない（記録と集計は STEP 6 以降）。
export function SetReview({ set, items, answers, questionHref }: { set: QuestionSet; items: Question[]; answers: Record<string, QuestionAnswer>; questionHref: (id: string) => string }) {
  const c = useContent()
  const done = items.filter((q) => answers[q.id] && isFinished(q, answers[q.id]))
  const [closing, setClosing] = useState<string | null>(null)
  const looksKey = done.filter((q) => {
    const see = q.stages.find((s) => s.kind === 'RECOGNITION')
    return see && findOption(see.options, answers[q.id].look)?.value === 'key'
  }).length
  const decPriority = done.filter((q) => {
    const dec = q.stages.find((s) => s.kind === 'DECISION')
    return dec && findOption<DecisionOption>(dec.options, answers[q.id].decision)?.fit === 'priority'
  }).length
  const chosenClosing = set.closing.options.find((o) => o.id === closing)

  return (
    <section className="flex flex-col gap-3" aria-labelledby="review-title">
      <div className="card">
        <p className="text-sm font-bold text-[var(--accent-ink)]">振り返り</p>
        <h2 id="review-title" className="text-xl leading-snug font-extrabold">
          {set.title}
        </h2>
        <p className="mt-1 text-base">
          {items.length}問中 {done.length}問 終了
        </p>
      </div>

      {done.length === 0 ? (
        <div className="card text-base">
          <p className="font-bold">このページで答えた問題がありません。</p>
          <p className="text-[var(--muted)]">回答はページを閉じたり再読み込みしたりすると消えます。</p>
        </div>
      ) : (
        <>
          <div className="card text-base">
            <p>
              「見る」で決め手の情報を選んだ問題：<b>{looksKey}</b> / {done.length}
            </p>
            <p>
              「判断」で〈{FIT_LABELS.priority}〉を選んだ問題：<b>{decPriority}</b> / {done.length}
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">このセットの問題は、同じ場面で一部だけ条件が違います。問題ごとに、どの情報で判断が変わったかを見比べよう。</p>
          </div>
          <ol className="flex flex-col gap-2">
            {items.map((q, i) => {
              const a = answers[q.id]
              if (!a || !isFinished(q, a))
                return (
                  <li key={q.id} className="card text-base">
                    <p className="font-bold">
                      問題{i + 1}　{q.title}
                    </p>
                    <a href={questionHref(q.id)} className="mt-1 inline-flex min-h-11 items-center font-bold text-[var(--accent-ink)]">
                      まだ答えていません。解く ›
                    </a>
                  </li>
                )
              const see = q.stages.find((s) => s.kind === 'RECOGNITION')!
              const dec = q.stages.find((s) => s.kind === 'DECISION')!
              const why = q.stages.find((s): s is ReasonStage => s.kind === 'REASON')!
              const look = findOption(see.options, a.look)
              const d = findOption<DecisionOption>(dec.options, a.decision)
              const diag = d ? DIAGNOSIS_LABELS[diagnose(d.fit, evaluateReasons(why, d.id, a.reasons))] : null
              return (
                <li key={q.id} className="card text-base">
                  <p className="font-bold">
                    問題{i + 1}　{q.title}
                  </p>
                  {q.variant.what_changed && <p className="text-sm text-[var(--muted)]">この問題の条件：{q.variant.what_changed}</p>}
                  <ul className="mt-1 flex flex-col gap-0.5">
                    <li>見る：{look ? RECOGNITION_LABELS[look.value] : '—'}</li>
                    <li>判断：{d ? `${d.text}（${FIT_LABELS[d.fit]}）` : '—'}</li>
                    <li>なぜ：{diag ? diag.title : '—'}</li>
                  </ul>
                  <a href={questionHref(q.id)} className="mt-1 inline-flex min-h-11 items-center font-bold text-[var(--accent-ink)]">
                    解説を見直す ›
                  </a>
                </li>
              )
            })}
          </ol>
        </>
      )}

      <div className="card flex flex-col gap-2 text-base">
        <p className="font-bold">{set.closing.prompt}</p>
        <ul className="flex flex-col gap-2">
          {set.closing.options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                aria-pressed={closing === o.id}
                onClick={() => setClosing(o.id)}
                className={`flex min-h-12 w-full items-center rounded-xl border-2 px-3 text-left font-bold ${closing === o.id ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--line)] bg-[var(--surface)]'}`}
              >
                {o.text}
              </button>
            </li>
          ))}
        </ul>
        {chosenClosing && (
          <Feedback title={chosenClosing.correct ? 'そのとおり' : 'もう一度、問題を見比べよう'} tone={chosenClosing.correct ? 'good' : 'mid'}>
            {set.closing.options
              .filter((o) => o.correct)
              .map((o) => {
                const cue = o.cue_id ? c.byId.cue.get(o.cue_id) : undefined
                return (
                  <p key={o.id}>
                    判断を変えたのは「{o.text}」。{cue && `手がかり「${cue.name}」：${cue.meaning}`}
                  </p>
                )
              })}
          </Feedback>
        )}
      </div>
    </section>
  )
}
