import type { ReactNode } from 'react'

import { TABS, type TabKey } from './tabs.ts'

const ICONS = { home: HomeIcon, play: PlayIcon, map: MapIcon, myiq: ChartIcon }

export function Layout({ current, title, children }: { current: TabKey; title?: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--ink)]">
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <a href="#/" className="flex min-h-11 shrink-0 items-center gap-2 font-extrabold tracking-tight" aria-label="Basketball IQ ホームへ">
            <BallIcon />
            <span className="text-lg">Basketball IQ</span>
          </a>
          {title && <span className="truncate border-l border-[var(--line)] pl-3 text-base font-bold text-[var(--muted)] md:hidden">{title}</span>}
          <nav className="ml-auto hidden gap-1 md:flex" aria-label="メインメニュー">
            {TABS.map((t) => (
              <a
                key={t.key}
                href={t.href}
                aria-current={current === t.key ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-bold ${current === t.key ? 'bg-[var(--accent-soft)] text-[var(--accent-ink)]' : 'text-[var(--muted)] hover:bg-[var(--hover)]'}`}
              >
                {t.label}
                <span className="ml-1 font-normal">{t.sub}</span>
              </a>
            ))}
            {/* COACH は PC の上部ナビにだけ出す（スマホの下部タブには出さない） */}
            <a
              href="#/coach"
              aria-current={current === 'coach' ? 'page' : undefined}
              className={`inline-flex min-h-11 items-center rounded-lg border border-[var(--line)] px-4 text-sm font-bold ${current === 'coach' ? 'bg-[var(--accent-soft)] text-[var(--accent-ink)]' : 'text-[var(--muted)] hover:bg-[var(--hover)]'}`}
            >
              COACH
              <span className="ml-1 font-normal">先生用</span>
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-12">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-[var(--line)] bg-[var(--surface)] md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="メインメニュー"
      >
        {TABS.map((t) => {
          const active = current === t.key
          const Icon = ICONS[t.key]
          return (
            <a
              key={t.key}
              href={t.href}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-bold ${active ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}`}
            >
              <Icon active={active} />
              <span>{t.label}</span>
            </a>
          )
        })}
      </nav>
    </div>
  )
}

function BallIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" fill="var(--accent)" />
      <path d="M1.5 12h21M12 1.5v21M5 4.5c3 3 3 12 0 15M19 4.5c-3 3-3 12 0 15" fill="none" stroke="var(--accent-line)" strokeWidth="1.4" />
    </svg>
  )
}
type IconProps = { active: boolean }
const iconCls = 'h-6 w-6'
function HomeIcon({ active }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={iconCls} aria-hidden="true" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
    </svg>
  )
}
function PlayIcon({ active }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={iconCls} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" fill={active ? 'currentColor' : 'none'} />
      <path d="M10 8.5v7l6-3.5z" fill={active ? 'var(--surface)' : 'currentColor'} stroke="none" />
    </svg>
  )
}
function MapIcon({ active }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={iconCls} aria-hidden="true" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" />
      <path d="M9 4v14M15 6v14" stroke={active ? 'var(--surface)' : 'currentColor'} />
    </svg>
  )
}
function ChartIcon({ active }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={iconCls} aria-hidden="true" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  )
}
