// 教材 JSON の読み込み。原本は data/ にあり、起動・ビルドの前に public/data/ へコピーされる（scripts/sync-data.ts）。
// 教材の本文は画面のコードに書かず、ここで読み込んだデータだけを使う。
import { CONTENT_FILES, type Content, type RawContent } from '../types/content.ts'
import { validateContent } from './validate.ts'

export class ContentError extends Error {
  details: string[]
  constructor(message: string, details: string[] = []) {
    super(message)
    this.name = 'ContentError'
    this.details = details
  }
}

type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

export async function fetchRawContent(baseUrl: string, fetcher: Fetcher = fetch): Promise<RawContent> {
  const entries = await Promise.all(
    (Object.keys(CONTENT_FILES) as (keyof RawContent)[]).map(async (key) => {
      const url = `${baseUrl}data/${CONTENT_FILES[key]}`
      let res
      try {
        res = await fetcher(url)
      } catch {
        throw new ContentError(`教材データを読み込めませんでした（通信エラー）：${CONTENT_FILES[key]}`)
      }
      if (!res.ok) throw new ContentError(`教材データが見つかりません（${res.status}）：${CONTENT_FILES[key]}`)
      try {
        return [key, await res.json()] as const
      } catch {
        throw new ContentError(`教材データの形式が正しくありません：${CONTENT_FILES[key]}`)
      }
    }),
  )
  return Object.fromEntries(entries) as unknown as RawContent
}

// チェックしてから、ID で引ける形にする。チェックに失敗したデータは使わない（間違った教材を出さないため）。
export function buildContent(raw: RawContent): Content {
  const errors = validateContent(raw)
  if (errors.length) throw new ContentError(`教材データに ${errors.length} 件の問題があります`, errors)
  const index = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]))
  return {
    curriculum: raw.curriculum.items,
    plannedSets: raw.curriculum.planned_sets,
    retired: raw.curriculum.retired,
    questions: raw.questions.questions,
    questionSets: raw.questions.question_sets,
    cues: raw.cues.cues,
    rules: raw.rules.rules,
    sources: raw.sources.sources,
    drills: raw.drills.drills,
    byId: {
      question: index(raw.questions.questions),
      questionSet: index(raw.questions.question_sets),
      curriculum: index(raw.curriculum.items),
      cue: index(raw.cues.cues),
      rule: index(raw.rules.rules),
      source: index(raw.sources.sources),
      drill: index(raw.drills.drills),
    },
  }
}

export async function loadContent(baseUrl: string, fetcher?: Fetcher): Promise<Content> {
  return buildContent(await fetchRawContent(baseUrl, fetcher))
}
