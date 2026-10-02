// data/ の教材 JSON をまとめて読む（コマンド・テスト用）
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CONTENT_FILES, type RawContent } from '../src/types/content.ts'

export const DATA_DIR = join(import.meta.dirname, '..', 'data')

export function readRawContent(dir = DATA_DIR): RawContent {
  const raw: Record<string, unknown> = {}
  for (const [key, file] of Object.entries(CONTENT_FILES)) raw[key] = JSON.parse(readFileSync(join(dir, file), 'utf8'))
  return raw as RawContent
}
