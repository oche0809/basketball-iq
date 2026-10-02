import type { Rule } from '../types/content.ts'
import { isNotInRules } from '../utils/rules.ts'

// 根拠の表示。種類を混ぜない：
//   【この教材で扱う判断原則】（コーチング）／【チームの約束】／【JBAルール】（条文）／【JBAルールに書かれていないこと】
// 研究は「教え方」の根拠なので、ここには出さない（docs/02_design.md 9章）。
export type RuleEntry = { rule: Rule; text?: string; sourceTitle: string }

export function BasisBoxes({
  practiceTitles,
  teamRule,
  rules,
  reviewNote,
}: {
  practiceTitles: string[]
  teamRule: boolean
  rules: RuleEntry[]
  reviewNote: string
}) {
  const articles = rules.filter((r) => !isNotInRules(r.rule))
  const notIn = rules.filter((r) => isNotInRules(r.rule))
  return (
    <section className="card flex flex-col gap-3 text-base" aria-label="根拠・出典">
      <h2 className="text-sm font-bold text-[var(--muted)]">根拠・出典</h2>
      {practiceTitles.length > 0 && (
        <div>
          <p className="font-bold">【この教材で扱う判断原則】</p>
          {[...new Set(practiceTitles)].map((t) => (
            <p key={t} className="text-[var(--muted)]">
              {t}
            </p>
          ))}
        </div>
      )}
      {teamRule && (
        <div>
          <p className="font-bold">【チームの約束】</p>
          <p className="text-[var(--muted)]">チームによって答えが変わる部分があります。チームの約束はまだ登録されていません。</p>
        </div>
      )}
      {articles.length > 0 && (
        <div className="rounded-xl border-2 border-[#1d4ed8]/30 bg-[#eff6ff] p-3">
          <p className="font-bold text-[#1e3a8a]">【JBAルール】</p>
          <ul className="mt-1 flex flex-col gap-2">
            {articles.map((r) => (
              <li key={r.rule.id}>
                <p>{r.text ?? r.rule.text}</p>
                <p className="text-sm text-[var(--muted)]">
                  {r.sourceTitle}　{r.rule.article}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-[var(--muted)]">ルールそのものです。判断原則（コーチング）とは別のものです。</p>
        </div>
      )}
      {notIn.length > 0 && (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3">
          <p className="font-bold">【JBAルールに書かれていないこと】</p>
          {notIn.map((r) => (
            <div key={r.rule.id} className="mt-1">
              <p>{r.rule.text}</p>
              <p className="text-sm text-[var(--muted)]">確認した資料：{r.sourceTitle}</p>
            </div>
          ))}
          <p className="mt-2 text-sm text-[var(--muted)]">条文ではありません。JBA がこの守り方を推奨・禁止しているという意味ではありません。</p>
        </div>
      )}
      <p className="text-sm text-[var(--muted)]">{reviewNote}</p>
    </section>
  )
}
