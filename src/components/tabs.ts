// 下部タブ（スマホ）と上部ナビ（PC）の項目。COACH はここに入れない（#/coach で直接開く）
export const TABS = [
  { key: 'home', href: '#/', label: 'HOME', sub: 'ホーム' },
  { key: 'play', href: '#/play', label: 'PLAY', sub: '考える' },
  { key: 'map', href: '#/map', label: 'MAP', sub: '知る' },
  { key: 'myiq', href: '#/my-iq', label: 'MY IQ', sub: '振り返る' },
] as const
export type TabKey = (typeof TABS)[number]['key'] | 'coach' | 'none'
