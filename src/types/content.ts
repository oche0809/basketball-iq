// v2 教材データの型（data/*.json と同じ形）。仕様は docs/02_design.md 11章

export type Category = 'OFFENSE' | 'DEFENSE' | 'TRANSITION' | 'ADVANTAGE' | 'GAME_IQ'
export type Difficulty = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
export type Basis = 'RESEARCH' | 'OFFICIAL_RULE' | 'OFFICIAL_COACHING' | 'COACHING_PRACTICE' | 'TEAM_RULE'

// ---- コート図（練習メニュー倉庫と同じ 0〜100 のハーフコート。リングは {x:50, y:11.25}） ----
export type Point = { x: number; y: number }
export type Player = { id: string; label: string; team: 'offense' | 'defense' | 'neutral'; start: Point }
export type CourtAction =
  | { type: 'move' | 'cut' | 'dribble' | 'screen'; player: string; to: Point }
  | { type: 'pass'; from: string; to: string }
  | { type: 'shoot' | 'rebound'; player: string }
  | { type: 'wait' }
export type CourtStep = { text: string; actions: CourtAction[] }
export type Hud = { quarter?: number; game_clock?: string; shot_clock?: number; score?: { us: number; them: number } }
export type Court = {
  court: 'half'
  you: string
  ball: string
  players: Player[]
  steps: CourtStep[]
  show_middle_line?: boolean
  hud?: Hud
}

// ---- 問題の段階（見る → 判断 → なぜ → 相手の反応） ----
export type RecognitionValue = 'key' | 'useful' | 'not_now' | 'irrelevant'
export type Fit = 'priority' | 'conditional' | 'situational' | 'low'
export type ReasonQuality = 'key' | 'supporting' | 'misconception' | 'irrelevant'

export type RecognitionOption = { id: string; text: string; value: RecognitionValue; cue_id?: string; feedback: string }
export type DecisionOption = { id: string; text: string; fit: Fit; condition?: string; feedback: string; spot?: Point; cue_id?: string }
export type ReasonOption = { id: string; text: string; quality: ReasonQuality; supports: string[]; cue_id?: string; note?: string }

type StageBase = { id: string; prompt: string; show_until_step?: number }
export type RecognitionStage = StageBase & { kind: 'RECOGNITION'; mode: 'WHAT_TO_LOOK' | 'WHAT_HAPPENED'; options: RecognitionOption[] }
export type DecisionStage = StageBase & { kind: 'DECISION'; mode: 'CHOICE' | 'PRIORITY'; spot?: boolean; options: DecisionOption[] }
export type ReasonStage = StageBase & { kind: 'REASON'; max_select: number; free_text?: boolean; options: ReasonOption[] }
export type ReactionStage = StageBase & { kind: 'REACTION'; mode: 'CHOICE'; options: DecisionOption[] }
export type Stage = RecognitionStage | DecisionStage | ReasonStage | ReactionStage

export type Evidence = {
  part: string
  claim?: string
  basis: Basis
  source_id: string
  rule_id?: string
  locator?: string
  status?: string
}
export type RuleNote = { rule_id: string; text: string }
export type Verification = { status: 'draft' | 'coach_reviewed' | 'published'; reviewed_by?: string | null; reviewed_at?: string | null; note?: string }

export type Question = {
  schema_version: 2
  id: string
  curriculum_id: string
  set_id: string | null
  scenario_id: string
  variant: { label: string; what_changed: string }
  title: string
  category: Category
  difficulty: Difficulty
  grade: number[]
  presentation: 'ANIMATION' | 'STATIC'
  cues: string[]
  situation: string
  court: Court | null
  stages: Stage[]
  debrief: {
    decision_rule: string
    explanation: string
    if_defense_changes: { change: string; then: string; question_id?: string }[]
  }
  related_drills: string[]
  related_tactics: string[]
  evidence: Evidence[]
  rule_notes: RuleNote[]
  verification: Verification
  visibility: 'public' | 'team' | 'hidden'
  created_at: string
  updated_at: string
}

export type QuestionSet = {
  id: string
  kind: string
  scenario_id: string
  title: string
  order: 'fixed' | 'shuffle'
  intro: string
  items: string[]
  closing: { prompt: string; options: { id: string; text: string; cue_id?: string; correct: boolean }[] }
  mastery_rule: string
}

// ---- カリキュラム ----
export type CurriculumItem = {
  id: string
  category: Category
  subcategory: string
  title: string
  grade: number[]
  difficulty: Difficulty
  learning_goal: string
  situation: string
  decision_point: { look_at: string; decide: string }
  common_mistakes: string[]
  presentation: 'ANIMATION' | 'STATIC'
  decision_type: 'CHOICE' | 'PRIORITY' | 'SPOT' | 'YESNO'
  cues: string[]
  rule_refs: string[]
  source_types: Basis[]
  sources: string[]
  evidence: Evidence[]
  sample_questions: { recognition: string; decision: string }
  memorization_risk: { level: string; mitigation: string | null }
  question_set: string | null
  related_drills: string[]
  related_tactics: string[]
  review: { verdict: string; note: string | null }
  verification: { status: string; needs_coach_review: boolean; rule_check: string | null }
}
export type PlannedSet = { id: string; kind: string; title: string; learning_point: string; curriculum_items: string[] }
export type RetiredItem = { id: string; verdict: string; into: string; issue: string; reason: string }

// ---- 登録簿 ----
export type Cue = { id: string; group: string; name: string; look_at: string; meaning: string }
export type Rule = {
  id: string
  group: string
  scope: string
  source_id: string
  article: string
  text: string
  verified: boolean
  interpretation_note?: string
}
export type Source = {
  id: string
  source_type: Basis
  title: string
  url: string | null
  verified_content: string | null
  not_verified?: string
  publisher?: string
  author?: string
  year?: number
  accessed?: string
  superseded_by?: string
  limitations?: string
}
export type Drill = { id: string; title: string }

// ---- ファイルそのものの形 ----
export type CurriculumFile = { schema_version: 2; items: CurriculumItem[]; planned_sets: PlannedSet[]; retired: RetiredItem[] }
export type QuestionsFile = { schema_version: 2; question_sets: QuestionSet[]; questions: Question[] }
export type CuesFile = { schema_version: number; cues: Cue[] }
export type RulesFile = { schema_version: number; rules: Rule[] }
export type SourcesFile = { schema_version: number; sources: Source[] }
export type DrillsFile = { drills: Drill[] }

export type RawContent = {
  curriculum: CurriculumFile
  questions: QuestionsFile
  cues: CuesFile
  rules: RulesFile
  sources: SourcesFile
  drills: DrillsFile
}

// アプリで使う形（ID で引けるように索引を付けたもの）
export type Content = {
  curriculum: CurriculumItem[]
  plannedSets: PlannedSet[]
  retired: RetiredItem[]
  questions: Question[]
  questionSets: QuestionSet[]
  cues: Cue[]
  rules: Rule[]
  sources: Source[]
  drills: Drill[]
  byId: {
    question: Map<string, Question>
    questionSet: Map<string, QuestionSet>
    curriculum: Map<string, CurriculumItem>
    cue: Map<string, Cue>
    rule: Map<string, Rule>
    source: Map<string, Source>
    drill: Map<string, Drill>
  }
}

// data/ にあるファイルと、読み込み時に使う名前の対応
export const CONTENT_FILES = {
  curriculum: 'curriculum.json',
  questions: 'sample_questions.json',
  cues: 'cues.json',
  rules: 'rules.json',
  sources: 'sources.json',
  drills: 'links_drills.json',
} as const satisfies Record<keyof RawContent, string>
