import type { Court as CourtData, Point } from '../types/content.ts'
import { H, PLAYER_R, W, courtModel, toSvg } from './geometry.ts'
import type { CourtState, Trail } from './state.ts'

type Props = {
  court: CourtData
  // その時点の状態（src/court/state.ts で計算）。省略時は開始時の配置
  state?: CourtState | null
  // 旧来の指定（位置とボールを持つ選手）。state があればそちらを使う
  positions?: Record<string, Point>
  ballHolder?: string
  caption?: string
  // スマホで問題文と一緒に見られるよう、高さを画面の一定割合までに抑える
  compact?: boolean
  // 位置を選ぶ問題の候補（データの選択肢の spot）。A・B・C の印を描く
  spots?: { id: string; point: Point }[]
}

// 静的なハーフコート図。選手・ボール・矢印はデータにあるものだけを描く。
export function Court({ court, state, positions, ballHolder, caption, compact, spots }: Props) {
  const m = state ? courtModel(court, state.positions, state.ballHolder, state.ballAt) : courtModel(court, positions, ballHolder)
  const trails = state?.trails ?? []
  const you = m.players.find((p) => p.isYou)
  const label = `ハーフコート図。オフェンス${m.players.filter((p) => p.team === 'offense').length}人、ディフェンス${m.players.filter((p) => p.team === 'defense').length}人${you ? `。あなたは${you.team === 'offense' ? 'オフェンス' : 'ディフェンス'}の${you.label}` : ''}`
  const kinds = new Set(trails.map((t) => (t.kind === 'pass' ? 'pass' : t.kind === 'dribble' ? 'dribble' : 'move')))
  return (
    <figure className="m-0">
      <svg
        viewBox={`-2 -2 ${W + 4} ${H + 4}`}
        className="mx-auto block h-auto rounded-xl bg-[var(--court)]"
        style={{ width: compact ? `min(100%, calc(34dvh * ${(W + 4) / (H + 4)}))` : '100%' }}
        role="img"
        aria-label={label}
      >
        <defs>
          <marker id="arrow-move" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M0,0 L6,3 L0,6 z" fill="#334155" />
          </marker>
          <marker id="arrow-pass" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M0,0 L6,3 L0,6 z" fill="#ea580c" />
          </marker>
        </defs>
        <CourtLines middleLine={m.showMiddleLine} />
        {trails.map((t, i) => (
          <TrailLine key={i} trail={t} />
        ))}
        {m.players.map((p) => (
          <g key={p.id} transform={`translate(${p.x} ${p.y})`}>
            {/* あなた：青い二重の輪（文字は近くの選手と重なるので出さない） */}
            {p.isYou && <circle r={PLAYER_R + 2.4} fill="#bfdbfe" stroke="#2563eb" strokeWidth="1.6" />}
            {p.team === 'offense' ? (
              <circle r={PLAYER_R} fill="#1e3a8a" stroke="#0b1b4d" strokeWidth="0.6" />
            ) : p.team === 'defense' ? (
              <circle r={PLAYER_R} fill="#ffffff" stroke="#b91c1c" strokeWidth="1.1" />
            ) : (
              <circle r={PLAYER_R} fill="#e5e7eb" stroke="#4b5563" strokeWidth="0.8" strokeDasharray="1.5 1" />
            )}
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={p.label.length > 1 ? 4 : 5.2}
              fontWeight="700"
              fill={p.team === 'offense' ? '#ffffff' : p.team === 'defense' ? '#b91c1c' : '#374151'}
            >
              {p.label}
            </text>
          </g>
        ))}
        {spots?.map((sp) => {
          const p = toSvg(sp.point)
          return (
            <g key={sp.id} transform={`translate(${p.x} ${p.y})`}>
              <circle r={PLAYER_R} fill="#fef3c7" stroke="#b45309" strokeWidth="0.9" strokeDasharray="1.6 1" opacity="0.95" />
              <text textAnchor="middle" dominantBaseline="central" fontSize="5" fontWeight="800" fill="#92400e">
                {sp.id}
              </text>
            </g>
          )
        })}
        {m.ball && <circle cx={m.ball.x} cy={m.ball.y} r="2.4" fill="#f59e0b" stroke="#92400e" strokeWidth="0.6" />}
      </svg>
      <figcaption className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-0.5 text-sm leading-snug text-[var(--muted)]">
        <Legend color="#1e3a8a" text="オフェンス" />
        <Legend color="#ffffff" border="#b91c1c" text="ディフェンス" />
        <Legend color="#f59e0b" text="ボール" small />
        <span className="font-bold text-[#1d4ed8]">◯ あなた</span>
        {kinds.has('move') && <span>━ 移動</span>}
        {kinds.has('dribble') && <span>┅ ドリブル</span>}
        {kinds.has('pass') && <span className="text-[#c2410c]">╍ パス</span>}
        {caption && <span className="w-full text-center">{caption}</span>}
      </figcaption>
    </figure>
  )
}

// 矢印は選手の円にかからないよう、両端を少し短くする
function shorten(a: { x: number; y: number }, b: { x: number; y: number }, startGap: number, endGap: number) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  return { x1: a.x + ux * startGap, y1: a.y + uy * startGap, x2: b.x - ux * endGap, y2: b.y - uy * endGap, len }
}

function TrailLine({ trail }: { trail: Trail }) {
  if (trail.kind === 'pass') {
    const s = shorten(toSvg(trail.fromPos), toSvg(trail.toPos), PLAYER_R + 0.5, PLAYER_R + 1.5)
    if (s.len < PLAYER_R * 2) return null
    return <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="#ea580c" strokeWidth="1.1" strokeDasharray="2.5 1.8" markerEnd="url(#arrow-pass)" />
  }
  const s = shorten(toSvg(trail.from), toSvg(trail.to), 0, PLAYER_R + 1)
  if (s.len < PLAYER_R * 1.5) return null
  return (
    <line
      x1={s.x1}
      y1={s.y1}
      x2={s.x2}
      y2={s.y2}
      stroke="#334155"
      strokeWidth="1"
      strokeDasharray={trail.kind === 'dribble' ? '1 1.4' : undefined}
      strokeLinecap="round"
      markerEnd="url(#arrow-move)"
      opacity="0.75"
    />
  )
}

function Legend({ color, border, text, small }: { color: string; border?: string; text: string; small?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        aria-hidden="true"
        className={`inline-block rounded-full ${small ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5'}`}
        style={{ background: color, border: `1.5px solid ${border ?? color}` }}
      />
      {text}
    </span>
  )
}

// コートの線（練習メニュー倉庫と同じ寸法。単位は10cm）
function CourtLines({ middleLine }: { middleLine: boolean }) {
  return (
    <g fill="none" stroke="var(--court-line)" strokeWidth="0.6" aria-hidden="true">
      <rect x="0.3" y="0.3" width={W - 0.6} height={H - 0.6} />
      <rect x="50.5" y="0.3" width="49" height="57.7" />
      <path d="M 57 58 A 18 18 0 0 0 93 58" />
      <path d="M 57 58 A 18 18 0 0 1 93 58" strokeDasharray="2 2" />
      <path d="M 9 0.3 L 9 29.9 A 67.5 67.5 0 0 0 141 29.9 L 141 0.3" />
      <path d="M 62.5 15.75 A 12.5 12.5 0 0 0 87.5 15.75" />
      <path d="M 57 139.7 A 18 18 0 0 1 93 139.7" />
      <line x1="66" y1="12" x2="84" y2="12" stroke="#475569" strokeWidth="1" />
      <line x1="75" y1="12" x2="75" y2="13.5" stroke="#ea580c" />
      <circle cx="75" cy="15.75" r="2.25" stroke="#ea580c" strokeWidth="0.8" />
      {middleLine && <line x1="75" y1="0.3" x2="75" y2={H - 0.3} stroke="#6b7280" strokeWidth="0.6" strokeDasharray="2.5 2" />}
    </g>
  )
}
