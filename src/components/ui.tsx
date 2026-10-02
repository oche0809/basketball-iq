import type { ReactNode } from 'react'
import type { Category, Difficulty } from '../types/content.ts'
import { CATEGORY_LABELS, DIFFICULTY_LABELS } from '../utils/labels.ts'

export function Chip({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'accent' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-bold ${tone === 'accent' ? 'bg-[var(--accent-soft)] text-[var(--accent-ink)]' : 'bg-[var(--hover)] text-[var(--ink)]'}`}
    >
      {children}
    </span>
  )
}

export const CategoryChip = ({ category }: { category: Category }) => (
  <Chip tone="accent">{category === 'GAME_IQ' ? 'GAME IQ' : category}・{CATEGORY_LABELS[category]}</Chip>
)
export const DifficultyChip = ({ difficulty }: { difficulty: Difficulty }) => <Chip>{DIFFICULTY_LABELS[difficulty]}</Chip>

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="mb-2 inline-flex min-h-11 items-center gap-1 text-base font-bold text-[var(--accent-ink)]">
      <span aria-hidden="true">‹</span>
      {children}
    </a>
  )
}
