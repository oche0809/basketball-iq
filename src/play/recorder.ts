// アプリ全体で1つの記録係（保存先はブラウザの学習記録）
import { attemptStore } from '../storage/attemptStore.ts'
import { createRecorder } from './record.ts'

let recorder: ReturnType<typeof createRecorder> | null = null
export function appRecorder() {
  if (!recorder) recorder = createRecorder(attemptStore())
  return recorder
}

// 「問題を開いて解く1回」ごとの鍵。開き直すと新しい鍵になる（＝解き直しは別の記録）
let n = 0
export function newSolveSessionId(): string {
  n += 1
  return `solve-${Date.now().toString(36)}-${n}`
}
