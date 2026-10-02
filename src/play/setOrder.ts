import type { QuestionSet } from '../types/content.ts'
import { seededShuffle } from './shuffle.ts'

// セットの出題順：fixed はデータの順、shuffle はセットIDから決まる順（毎回同じ。Math.random は使わない）
export const orderedItems = (set: QuestionSet): string[] => (set.order === 'shuffle' ? seededShuffle(set.items, `set|${set.id}`) : [...set.items])
