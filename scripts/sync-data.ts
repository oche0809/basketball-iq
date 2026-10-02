// 原本 data/*.json を public/data/ にコピーする（画面はこのコピーを読み込む）。原本は変更しない。
import { copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { CONTENT_FILES } from '../src/types/content.ts'
import { DATA_DIR } from './read-data.ts'

const out = join(import.meta.dirname, '..', 'public', 'data')
mkdirSync(out, { recursive: true })
for (const file of Object.values(CONTENT_FILES)) copyFileSync(join(DATA_DIR, file), join(out, file))
console.log(`教材データを public/data/ にコピーしました（${Object.values(CONTENT_FILES).length} ファイル）`)
