import { useEffect, useState } from 'react'

// ライブラリを増やさないための、#/path?query 形式の簡易ルーター（GitHub Pages でも再読み込みで 404 にならない）
export type Route = { segments: string[]; params: URLSearchParams }

export function parseHash(hash: string): Route {
  const [path, query = ''] = (hash.replace(/^#/, '') || '/').split('?')
  return { segments: path.split('/').filter(Boolean), params: new URLSearchParams(query) }
}

export function useHashRoute(): Route {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const onChange = () => {
      setHash(window.location.hash)
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return parseHash(hash)
}

export function navigate(to: string) {
  window.location.hash = to
}
