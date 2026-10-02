import { useState } from 'react'
import { CategoryChip, Chip } from '../components/ui.tsx'
import { useContent } from '../content/context.ts'
import type { Category } from '../types/content.ts'
import { pickForDay } from '../utils/daily.ts'
import { SET_KIND_LABELS } from '../utils/labels.ts'

// 日付は画面を開いた時に1回だけ決める（表示中に変わらない）
export function HomePage({ date }: { date?: Date }) {
  const c = useContent()
  const [today] = useState(() => date ?? new Date())
  const set = pickForDay(c.questionSets, today)
  const categories = set ? ([...new Set(set.items.map((id) => c.byId.question.get(id)?.category).filter(Boolean))] as Category[]) : []
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-3xl bg-[var(--ink)] p-5 text-white" aria-labelledby="today-title">
        <p className="text-sm font-bold tracking-widest text-orange-300">BASKETBALL IQ</p>
        <h1 className="mt-1 text-2xl leading-snug font-extrabold">
          見る。判断する。
          <br />
          相手に合わせて、変える。
        </h1>

        {set ? (
          <div className="mt-4 rounded-2xl bg-white/10 p-4">
            <p className="text-sm font-bold text-orange-200">今日の問題</p>
            <h2 id="today-title" className="text-lg leading-snug font-extrabold">
              {set.title}
            </h2>
            <p className="mt-1 flex flex-wrap gap-1.5">
              <Chip>全{set.items.length}問</Chip>
              {categories.map((cat) => (
                <CategoryChip key={cat} category={cat} />
              ))}
            </p>
            {SET_KIND_LABELS[set.kind] && <p className="mt-2 text-base text-slate-200">{SET_KIND_LABELS[set.kind]}</p>}
            <a href={`#/play/set/${encodeURIComponent(set.id)}`} className="btn-primary mt-3 w-full text-lg">
              START
            </a>
          </div>
        ) : (
          <p id="today-title" className="mt-4 text-base text-slate-200">
            今日の問題はありません（問題セットが登録されていません）。
          </p>
        )}
      </section>

      <nav className="grid gap-3 sm:grid-cols-3" aria-label="学習メニュー">
        <HomeCard href="#/play" en="PLAY" ja="考える" text={`問題セット ${c.questionSets.length}・問題 ${c.questions.length}`} />
        <HomeCard href="#/map" en="MAP" ja="知る" text={`学習項目 ${c.curriculum.length}`} />
        <HomeCard href="#/my-iq" en="MY IQ" ja="振り返る" text="見る・判断・理由の記録" />
      </nav>
    </div>
  )
}

function HomeCard({ href, en, ja, text }: { href: string; en: string; ja: string; text: string }) {
  return (
    <a href={href} className="card flex min-h-20 items-center justify-between gap-3 active:bg-[var(--hover)]">
      <span>
        <span className="block text-lg font-extrabold">
          {en}
          <span className="ml-2 text-sm font-bold text-[var(--muted)]">{ja}</span>
        </span>
        <span className="block text-sm text-[var(--muted)]">{text}</span>
      </span>
      <span aria-hidden="true" className="text-2xl text-[var(--muted)]">
        ›
      </span>
    </a>
  )
}
