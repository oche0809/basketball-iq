import { useEffect, useState, type ReactNode } from 'react'
import type { Content } from '../types/content.ts'
import { ContentContext } from './context.ts'
import { ContentError, loadContent } from './load.ts'

type State = { status: 'loading' } | { status: 'ready'; content: Content } | { status: 'error'; message: string; details: string[] }

// 教材データを1回だけ読み込み、読み込み中・失敗・成功で表示を分ける
export function ContentProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    loadContent(import.meta.env.BASE_URL)
      .then((content) => !cancelled && setState({ status: 'ready', content }))
      .catch((e: unknown) => {
        if (cancelled) return
        const details = e instanceof ContentError ? e.details : []
        setState({ status: 'error', message: e instanceof Error ? e.message : '教材データを読み込めませんでした', details })
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  if (state.status === 'loading')
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-lg text-slate-600" role="status">
        教材を読み込んでいます…
      </div>
    )
  if (state.status === 'error')
    return (
      <div className="mx-auto max-w-xl p-6" role="alert">
        <h1 className="text-xl font-bold text-red-700">教材を表示できません</h1>
        <p className="mt-2 text-base">{state.message}</p>
        {state.details.length > 0 && (
          <ul className="mt-3 max-h-64 list-disc overflow-auto pl-5 text-sm text-slate-700">
            {state.details.slice(0, 30).map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        )}
        <button type="button" onClick={() => (setState({ status: 'loading' }), setAttempt((n) => n + 1))} className="btn-primary mt-5">
          もう一度読み込む
        </button>
      </div>
    )
  return <ContentContext value={state.content}>{children}</ContentContext>
}

