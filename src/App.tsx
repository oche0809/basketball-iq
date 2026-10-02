import type { JSX } from 'react'
import { Layout } from './components/Layout.tsx'
import type { TabKey } from './components/tabs.ts'
import { ContentProvider } from './content/ContentContext.tsx'
import { CoachPage } from './pages/CoachPage.tsx'
import { HomePage } from './pages/HomePage.tsx'
import { MapPage } from './pages/MapPage.tsx'
import { MyIqPage } from './pages/MyIqPage.tsx'
import { PlayPage } from './pages/PlayPage.tsx'
import { type Route, useHashRoute } from './utils/router.ts'

const PAGES: Record<string, { tab: TabKey; title: string; render: (r: Route) => JSX.Element }> = {
  '': { tab: 'home', title: '', render: () => <HomePage /> },
  play: { tab: 'play', title: 'PLAY', render: (r) => <PlayPage route={r} /> },
  map: { tab: 'map', title: 'MAP', render: (r) => <MapPage route={r} /> },
  'my-iq': { tab: 'myiq', title: 'MY IQ', render: () => <MyIqPage /> },
  myiq: { tab: 'myiq', title: 'MY IQ', render: () => <MyIqPage /> }, // 旧URL（STEP 3）も開けるように
  coach: { tab: 'coach', title: 'COACH', render: () => <CoachPage /> },
}

export default function App() {
  const route = useHashRoute()
  const page = PAGES[route.segments[0] ?? '']
  return (
    <ContentProvider>
      {page ? (
        <Layout current={page.tab} title={page.title}>
          {page.render(route)}
        </Layout>
      ) : (
        <Layout current="none" title="">
          <div className="card text-base">
            <p className="font-bold">ページが見つかりません。</p>
            <a href="#/" className="btn-secondary mt-3">
              HOME へ戻る
            </a>
          </div>
        </Layout>
      )}
    </ContentProvider>
  )
}
