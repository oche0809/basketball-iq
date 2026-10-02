import { createContext, use } from 'react'
import type { Content } from '../types/content.ts'

export const ContentContext = createContext<Content | null>(null)

// 読み込んだ教材データを使う（ContentProvider の中だけで使える）
export function useContent(): Content {
  const c = use(ContentContext)
  if (!c) throw new Error('useContent は ContentProvider の中で使う')
  return c
}
