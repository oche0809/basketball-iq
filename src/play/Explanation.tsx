import type { ReactNode } from 'react'
import { BasisBoxes } from '../components/BasisBoxes.tsx'
import { Chip } from '../components/ui.tsx'
import { useContent } from '../content/context.ts'
import type { DecisionOption, Question, ReasonStage, RecognitionStage } from '../types/content.ts'
import type { QuestionAnswer } from './answer.ts'
import { DIAGNOSIS_LABELS, FIT_LABELS, QUALITY_LABELS, RECOGNITION_LABELS, diagnose, evaluateReasons, findOption } from './evaluate.ts'

// 解説：教材データの内容だけを、決まった順で表示する（データにない条件・理由は作らない）
// answer が null の時（先生の教材レビュー）は「あなたの回答」を出さない。生徒の画面では常に回答を渡す
export function Explanation({ question: q, answer, linkTo }: { question: Question; answer: QuestionAnswer | null; linkTo: (id: string) => string }) {
  const c = useContent()
  const see = q.stages.find((s): s is RecognitionStage => s.kind === 'RECOGNITION')
  const dec = q.stages.find((s) => s.kind === 'DECISION')
  const why = q.stages.find((s): s is ReasonStage => s.kind === 'REASON')
  const react = q.stages.find((s) => s.kind === 'REACTION')
  if (!see || !dec || !why) return null
  const decOptions: DecisionOption[] = dec.options
  const priority = decOptions.find((o) => o.fit === 'priority')
  const others = decOptions.filter((o) => o.fit !== 'priority')
  const myLook = answer ? findOption(see.options, answer.look) : null
  const myDec = answer ? findOption(decOptions, answer.decision) : null
  const myReasons = answer && myDec ? evaluateReasons(why, myDec.id, answer.reasons) : []
  const diagnosis = myDec ? DIAGNOSIS_LABELS[diagnose(myDec.fit, myReasons)] : null
  const myReact = react && answer ? findOption<DecisionOption>(react.options, answer.reaction) : null
  const keyLooks = see.options.filter((o) => o.value === 'key')
  const keyReasons = priority ? why.options.filter((r) => r.quality === 'key' && r.supports.includes(priority.id)) : []

  const ruleIds = [...new Set([...q.rule_notes.map((r) => r.rule_id), ...q.evidence.flatMap((e) => (e.rule_id ? [e.rule_id] : []))])]
  const rules = ruleIds
    .map((id) => c.byId.rule.get(id))
    .filter((r) => !!r)
    .map((rule) => ({
      rule,
      // 問題ごとのルール枠の文（データの rule_notes）があればそれを使う
      text: q.rule_notes.find((n) => n.rule_id === rule.id)?.text.replace(/^【ルール】/, ''),
      sourceTitle: c.byId.source.get(rule.source_id)?.title ?? rule.source_id,
    }))

  return (
    <section aria-labelledby="explain-title" className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-bold text-[var(--accent-ink)]">解説</p>
        <h2 id="explain-title" className="text-xl leading-snug font-extrabold">
          {q.debrief.decision_rule}
        </h2>
      </div>

      {answer && (
      <Block title="あなたの回答">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
          <dt className="font-bold">見る</dt>
          <dd>
            {myLook?.text}
            {myLook && <span className="block text-sm text-[var(--muted)]">{RECOGNITION_LABELS[myLook.value]}</span>}
          </dd>
          <dt className="font-bold">判断</dt>
          <dd>
            {myDec?.text}
            {myDec && <span className="block text-sm font-bold">{FIT_LABELS[myDec.fit]}</span>}
          </dd>
          <dt className="font-bold">なぜ</dt>
          <dd>
            <ul>
              {myReasons.map((r) => (
                <li key={r.option.id}>
                  {r.option.text}
                  <span className="ml-1 text-sm text-[var(--muted)]">
                    （{QUALITY_LABELS[r.quality]}・{r.supportsChosen ? 'あなたの判断を説明' : r.option.supports.length ? '別の判断を説明' : 'どの判断の説明にもならない'}）
                  </span>
                </li>
              ))}
            </ul>
          </dd>
          {react && (
            <>
              <dt className="font-bold">次の判断</dt>
              <dd>
                {myReact?.text}
                {myReact && <span className="block text-sm font-bold">{FIT_LABELS[myReact.fit]}</span>}
              </dd>
            </>
          )}
        </dl>
        {diagnosis && (
          <p className="mt-2 rounded-lg bg-[var(--accent-soft)] p-2 text-base">
            <span className="font-bold">{diagnosis.title}</span>　{diagnosis.text}
          </p>
        )}
      </Block>
      )}

      <Block title="① この状況で、何を見るべきだったか">
        {keyLooks.map((o) => {
          const cue = o.cue_id ? c.byId.cue.get(o.cue_id) : undefined
          return (
            <div key={o.id}>
              <p className="font-bold">{o.text}</p>
              <p>{o.feedback}</p>
              {cue && (
                <p className="mt-1 text-sm text-[var(--muted)]">
                  手がかり「{cue.name}」：{cue.look_at} → {cue.meaning}
                </p>
              )}
            </div>
          )
        })}
      </Block>

      <Block title="② 判断の決め手">
        <p className="font-bold">{q.debrief.decision_rule}</p>
        {keyReasons.length > 0 && (
          <ul className="mt-1 list-disc pl-5">
            {keyReasons.map((r) => (
              <li key={r.id}>{r.text}</li>
            ))}
          </ul>
        )}
      </Block>

      {priority && (
        <Block title="③ この状況で優先する判断">
          <p className="font-bold">
            {priority.text}
            <span className="ml-2">
              <Chip tone="accent">{FIT_LABELS.priority}</Chip>
            </span>
          </p>
          <p>{priority.feedback}</p>
          <p className="mt-2">{q.debrief.explanation}</p>
        </Block>
      )}

      <Block title="④ ほかの選択肢は、どんな時に有効か">
        <ul className="flex flex-col gap-2">
          {others.map((o) => (
            <li key={o.id} className="rounded-lg border border-[var(--line)] p-2">
              <p className="font-bold">
                {o.text}　<span className="text-sm">［{FIT_LABELS[o.fit]}］</span>
              </p>
              {o.condition && <p>有効になる条件：{o.condition}</p>}
              <p className="text-sm text-[var(--muted)]">{o.feedback}</p>
            </li>
          ))}
        </ul>
      </Block>

      {q.debrief.if_defense_changes.length > 0 && (
        <Block title="相手が変えたら">
          <ul className="flex flex-col gap-2">
            {q.debrief.if_defense_changes.map((x) => (
              <li key={x.change}>
                <p>
                  <span className="font-bold">{x.change}</span> → {x.then}
                </p>
                {x.question_id && c.byId.question.get(x.question_id) && (
                  <a href={linkTo(x.question_id)} className="mt-1 inline-flex min-h-11 items-center font-bold text-[var(--accent-ink)]">
                    その問題を見る：{c.byId.question.get(x.question_id)!.title} ›
                  </a>
                )}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {(q.court?.steps.length ?? 0) > 0 && (
        <Block title="場面の流れ（データの動き）">
          <ol className="list-decimal pl-5">
            {q.court!.steps.map((s, i) => (
              <li key={i}>{s.text}</li>
            ))}
          </ol>
        </Block>
      )}

      <BasisBoxes
        practiceTitles={q.evidence.filter((e) => e.basis === 'COACHING_PRACTICE').map((e) => c.byId.source.get(e.source_id)?.title ?? e.source_id)}
        teamRule={q.evidence.some((e) => e.basis === 'TEAM_RULE')}
        rules={rules}
        reviewNote={q.verification.status === 'draft' ? 'この問題は先生の確認前です。' : '先生が確認した問題です。'}
      />

      {q.related_drills.length > 0 && (
        <Block title="関連する練習（練習メニュー倉庫）">
          <ul className="flex flex-col gap-1">
            {q.related_drills.map((d) => {
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
        </Block>
      )}

      {q.related_tactics.length > 0 && (
        <Block title="関連する戦術（作戦盤）">
          <p className="flex flex-wrap gap-1.5">
            {q.related_tactics.map((t) => (
              <Chip key={t}>{t}</Chip>
            ))}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">作戦盤の戦術ID・守備パターンIDです。名前と動きは作戦盤で確認できます。</p>
        </Block>
      )}

    </section>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card text-base">
      <h3 className="mb-1 text-sm font-bold text-[var(--muted)]">{title}</h3>
      {children}
    </section>
  )
}
