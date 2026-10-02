// 教材データのチェック（npm run check）。1件でも問題があれば失敗する（ビルド・公開も止まる）。
import { validateContent } from '../src/content/validate.ts'
import { readRawContent } from './read-data.ts'

const raw = readRawContent()
const errors = validateContent(raw)
if (errors.length) {
  console.error(`教材データに ${errors.length} 件の問題があります：`)
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}
console.log(
  `教材データ OK：問題 ${raw.questions.questions.length}・問題セット ${raw.questions.question_sets.length}・カリキュラム ${raw.curriculum.items.length}・` +
    `手がかり ${raw.cues.cues.length}・ルール ${raw.rules.rules.length}・出典 ${raw.sources.sources.length}・練習メニュー ${raw.drills.drills.length}`,
)
