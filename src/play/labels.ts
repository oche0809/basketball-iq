import type { Stage } from '../types/content.ts'

export const STAGE_NAMES: Record<Stage['kind'], string> = { RECOGNITION: '見る', DECISION: '判断', REASON: 'なぜ', REACTION: '次の判断' }
export const STAGE_HEADINGS: Record<Stage['kind'], string> = {
  RECOGNITION: 'まず、何を見る？',
  DECISION: 'この状況なら、どうする？',
  REASON: 'なぜ、そう判断した？',
  REACTION: '相手が動いた。次は？',
}
