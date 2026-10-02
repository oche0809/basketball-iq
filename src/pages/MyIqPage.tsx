import { useMemo, useState, type ReactNode } from 'react'
import { MIN_ATTEMPTS_FOR_TREND, RECENT_WINDOW, aggregate } from '../analytics/aggregate.ts'
import { PageTitle } from '../components/PageTitle.tsx'
import { useContent } from '../content/context.ts'
import { DIAGNOSIS_LABELS, FIT_LABELS, QUALITY_LABELS } from '../play/evaluate.ts'
import { type LoadResult, attemptStore } from '../storage/attemptStore.ts'
import type { Fit, ReasonQuality } from '../types/content.ts'

const FITS: Fit[] = ['priority', 'conditional', 'situational', 'low']
const QUALITIES: ReasonQuality[] = ['key', 'supporting', 'misconception', 'irrelevant']
const formatTime = (iso: string) => new Date(iso).toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

// これまでの回答から確認できる事実だけを表示する。点数・正解率・ランク・「得意／苦手」は出さない。
// 集計は開くたびに記録（attempt）から計算する（集計結果は保存しない）。
export function MyIqPage() {
  const c = useContent()
  const store = attemptStore()
  const [loaded, setLoaded] = useState<LoadResult>(() => store.load())
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const agg = useMemo(() => aggregate(loaded.attempts), [loaded])
  const cueName = (id: string) => c.byId.cue.get(id)?.name ?? `${id}（現在の教材にない手がかり）`
  const qTitle = (id: string) => c.byId.question.get(id)?.title ?? `${id}（現在の教材にない問題）`
  const setTitle = (id: string) => c.byId.questionSet.get(id)?.title ?? `${id}（現在の教材にないセット）`

  const remove = () => {
    const r = store.deleteAll()
    setConfirming(false)
    setMessage(r.ok ? '学習記録をすべて削除しました。' : 'この端末では学習記録を削除できませんでした。')
    setLoaded(store.load())
  }

  return (
    <>
      <PageTitle en="MY IQ" ja="振り返る">
        これまでの回答から確認できる学習の様子です。点数や順位はつけません。
      </PageTitle>

      {message && (
        <p className="mb-3 rounded-xl bg-[var(--accent-soft)] px-3 py-2 text-base font-bold" role="status">
          {message}
        </p>
      )}
      <LoadNotice loaded={loaded} />

      {agg.totalAttempts === 0 ? (
        <div className="card text-base">
          <p className="text-lg font-bold">まだ学習記録がありません</p>
          <p className="mt-1">問題を解説まで解くと、ここに回答の様子が表示されます。</p>
          <p className="mt-1 text-[var(--muted)]">「何を見る？」「どうする？」「なぜ？」を分けて振り返れます。</p>
          <a href="#/play" className="btn-primary mt-4 w-full">
            PLAY で問題を解く
          </a>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Section title="学習記録">
            <Facts
              rows={[
                ['回答した回数', `${agg.totalAttempts}回`, '解き直しも1回として数えます'],
                ['解いた問題', `${agg.distinctQuestions}問`, '同じ問題の解き直しは1問として数えます'],
                ['解いたセット', `${agg.distinctSets}セット`, 'セットから解いた分です'],
                ['最近の回答', agg.lastCompletedAt ? formatTime(agg.lastCompletedAt) : '—'],
              ]}
            />
            {agg.totalAttempts < MIN_ATTEMPTS_FOR_TREND && (
              <p className="mt-2 text-sm text-[var(--muted)]">まだ回答数が少ないため、傾向は表示していません（{MIN_ATTEMPTS_FOR_TREND}回以上で表示します）。</p>
            )}
          </Section>

          <Section title="「見る」の記録（手がかり別）">
            <p>
              見る問いで決め手の情報を選択：<b>{agg.look.key}</b> / {agg.totalAttempts}回
            </p>
            <ul className="mt-2 flex flex-col gap-2">
              {agg.byCue.map((s) => (
                <li key={s.cueId} className="rounded-xl border border-[var(--line)] p-3">
                  <p className="font-bold">{cueName(s.cueId)}</p>
                  <p className="text-sm text-[var(--muted)]">この手がかりが関係する問題の回答：{s.attempts}回</p>
                  <p>
                    見る問いで決め手の情報を選択：<b>{s.lookKey}</b> / {s.attempts}回
                  </p>
                  <p>
                    判断で〈{FIT_LABELS.priority}〉を選択：<b>{s.decisionFits.priority}</b> / {s.attempts}回
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {s.recent
                      ? `最近の${s.recent.attempts}回では、見る問いで決め手の情報を選んだ回答が${s.recent.lookKey}回、判断で〈${FIT_LABELS.priority}〉を選んだ回答が${s.recent.decisionPriority}回です。`
                      : `回答が${MIN_ATTEMPTS_FOR_TREND}回未満のため、傾向の文は表示していません。`}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-[var(--muted)]">1問に複数の手がかりがある時は、それぞれの手がかりに数えています（手がかりと問題の関係は教材データのとおり）。</p>
          </Section>

          <Section title="「判断」の記録">
            <ul className="flex flex-col gap-1">
              {FITS.map((f) => (
                <li key={f}>
                  〈{FIT_LABELS[f]}〉を選択：<b>{agg.decision[f]}</b> / {agg.totalAttempts}回
                </li>
              ))}
            </ul>
            {agg.reaction.attempts > 0 && (
              <>
                <p className="mt-2 font-bold">「次の判断」（相手が動いた後）</p>
                <ul className="flex flex-col gap-1">
                  {FITS.map((f) => (
                    <li key={f}>
                      〈{FIT_LABELS[f]}〉を選択：<b>{agg.reaction.fits[f]}</b> / {agg.reaction.attempts}回
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Section>

          <Section title="「なぜ」の記録">
            <p>選んだ理由の数：{agg.reasons.selected}個（1問につき2つまで）</p>
            <ul className="mt-1 flex flex-col gap-1">
              {QUALITIES.map((q) => (
                <li key={q}>
                  理由の質〈{QUALITY_LABELS[q]}〉：<b>{agg.reasons.qualities[q]}</b> / {agg.reasons.selected}個
                </li>
              ))}
            </ul>
            <p className="mt-2">
              自分の判断を説明する理由として選ばれた数：<b>{agg.reasons.supportsChosen}</b> / {agg.reasons.selected}個
            </p>
          </Section>

          {agg.bySet.length > 0 && (
            <Section title="セット別">
              <ul className="flex flex-col gap-2">
                {agg.bySet.map((s) => {
                  const total = c.byId.questionSet.get(s.setId)?.items.length
                  return (
                    <li key={s.setId} className="rounded-xl border border-[var(--line)] p-3">
                      <p className="font-bold">{setTitle(s.setId)}</p>
                      <p>
                        解いた問題：{s.answeredQuestions}
                        {total !== undefined && ` / ${total}`}問（回答 {s.attempts}回）
                      </p>
                      <p>
                        各問題の最新の回答で〈{FIT_LABELS.priority}〉を選んだ問題：<b>{s.latestPriorityQuestions}</b> / {s.answeredQuestions}問
                      </p>
                      <p className="text-sm text-[var(--muted)]">最後に解いた日時：{formatTime(s.lastCompletedAt)}</p>
                    </li>
                  )
                })}
              </ul>
            </Section>
          )}

          <Section title={`最近の回答（新しい順・${Math.min(RECENT_WINDOW, agg.recent.length)}件）`}>
            <ul className="flex flex-col gap-2">
              {agg.recent.slice(0, RECENT_WINDOW).map((a) => (
                <li key={a.attemptId} className="rounded-xl border border-[var(--line)] p-3">
                  <p className="text-sm text-[var(--muted)]">
                    {formatTime(a.completedAt)}　{a.setId ? setTitle(a.setId) : '単独の問題'}
                  </p>
                  <p className="font-bold">{qTitle(a.questionId)}</p>
                  <p className="text-sm">
                    判断：〈{FIT_LABELS[a.decision.fit]}〉　なぜ：{DIAGNOSIS_LABELS[a.reasons.diagnosis]?.title ?? a.reasons.diagnosis}
                  </p>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      {(agg.totalAttempts > 0 || loaded.status === 'unreadable') && (
        <section className="card mt-4 text-base" aria-labelledby="delete-title">
          <h2 id="delete-title" className="text-sm font-bold text-[var(--muted)]">
            学習記録の管理
          </h2>
          <p className="text-sm text-[var(--muted)]">学習記録はこの端末のブラウザの中だけにあり、どこにも送信していません。</p>
          {confirming ? (
            <div className="mt-2 rounded-xl border-2 border-[#b91c1c] p-3" role="alertdialog" aria-labelledby="delete-confirm">
              <p id="delete-confirm" className="font-bold">
                端末に保存されている学習記録をすべて削除します。元に戻せません。
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
              学習記録を削除
            </button>
          )}
        </section>
      )}
    </>
  )
}

function LoadNotice({ loaded }: { loaded: LoadResult }) {
  if (loaded.status === 'unavailable')
    return <Notice>この端末では学習記録を読み書きできません（ブラウザの設定によって使えないことがあります）。問題を解くことはできます。</Notice>
  if (loaded.status === 'unreadable')
    return (
      <Notice>
        {loaded.reason === 'newer-version'
          ? 'この端末に新しい形式の学習記録があるため、表示できません。記録は消さずに残しています。'
          : '学習記録を読み込めませんでした。新しい記録から開始します。（読み込めなかった記録は消さずに残しています）'}
      </Notice>
    )
  if (loaded.invalidCount > 0) return <Notice>形が壊れていて集計に使えなかった記録が {loaded.invalidCount} 件あります（記録は消さずに残しています）。</Notice>
  return null
}

const Notice = ({ children }: { children: ReactNode }) => (
  <p className="mb-3 rounded-xl bg-[#fef3c7] px-3 py-2 text-base font-bold text-[#92400e]" role="status">
    {children}
  </p>
)

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card text-base">
      <h2 className="mb-1 text-sm font-bold text-[var(--muted)]">{title}</h2>
      {children}
    </section>
  )
}

function Facts({ rows }: { rows: [string, string, string?][] }) {
  return (
    <dl className="flex flex-col gap-1.5">
      {rows.map(([k, v, note]) => (
        <div key={k}>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="font-bold">{k}</dt>
            <dd className="text-lg font-extrabold">{v}</dd>
          </div>
          {note && <p className="text-sm text-[var(--muted)]">{note}</p>}
        </div>
      ))}
    </dl>
  )
}
