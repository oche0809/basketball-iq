import type { ReactNode } from 'react'

export function PageTitle({ en, ja, children }: { en: string; ja: string; children?: ReactNode }) {
  return (
    <div className="mb-4">
      <h1 className="text-2xl font-extrabold tracking-tight">
        {en}
        <span className="ml-2 text-base font-bold text-[var(--muted)]">{ja}</span>
      </h1>
      {children && <p className="mt-1 text-base text-[var(--muted)]">{children}</p>}
    </div>
  )
}

// まだ作っていない画面であることを、隠さずに示す
export function NotYet({ step, children }: { step: string; children: ReactNode }) {
  return (
    <div className="card border-dashed text-base">
      <p className="font-bold text-[var(--accent-ink)]">準備中（{step}で作ります）</p>
      <div className="mt-1 text-[var(--muted)]">{children}</div>
    </div>
  )
}
