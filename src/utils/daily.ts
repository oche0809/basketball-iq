// 今日の問題セット：端末の日付（年月日）から決まる。乱数は使わない。
// 同じ日なら何度開いても同じ。日付が1日進むと、セットを順番に1つずつ進める（全セットを循環）。

// 年月日を「1970-01-01 からの日数」にする（時刻・時差の影響を受けない）
export function dayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000)
}

export function pickForDay<T>(list: readonly T[], date: Date): T | null {
  if (list.length === 0) return null
  const n = list.length
  return list[((dayNumber(date) % n) + n) % n]
}
