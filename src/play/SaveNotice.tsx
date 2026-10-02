import type { RecordOutcome } from './record.ts'

// 解説の上に出す、保存の結果。保存できなくても問題はそのまま続けられることを伝える
export function SaveNotice({ outcome }: { outcome: RecordOutcome | undefined }) {
  if (!outcome || outcome.status === 'skipped') return null
  if (outcome.status === 'saved')
    return (
      <p className="rounded-xl bg-[#f0fdf4] px-3 py-2 text-sm font-bold text-[#166534]" role="status">
        ✓ この回答を学習記録に保存しました（この端末の中だけ）
      </p>
    )
  return (
    <p className="rounded-xl bg-[#fef3c7] px-3 py-2 text-sm font-bold text-[#92400e]" role="status">
      {outcome.reason === 'newer-version'
        ? 'この端末に新しい形式の学習記録があるため、保存しませんでした。問題はそのまま続けられます。'
        : 'この端末では学習記録を保存できませんでした。問題はそのまま続けられます。'}
    </p>
  )
}
