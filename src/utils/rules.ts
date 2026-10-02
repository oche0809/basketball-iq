import type { Rule } from '../types/content.ts'

// 条文ではない登録（例：P&R の守り方は基準規則に名前が出てこない）かどうか
export const isNotInRules = (r: Rule) => r.article.includes('該当条文なし')
