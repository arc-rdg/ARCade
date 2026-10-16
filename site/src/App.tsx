import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { loadToken, type Session } from './auth'
import { DEFAULT_HUB, type Hub } from './hubs'
import { Picker } from './Picker'
import { parseRoute, routeUrl, type Route } from './route'

const GameView = lazy(() => import('./GameView'))

const BASE = import.meta.env.BASE_URL

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.search))
  const [hub, setHub] = useState<Hub>(() => {
    const initial = parseRoute(window.location.search)
    return initial.view === 'arc' ? initial.hub : DEFAULT_HUB
  })
  const [, bump] = useState(0)

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.search))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useCallback((next: Parameters<typeof routeUrl>[0]) => {
    window.history.pushState(null, '', routeUrl(next, BASE))
    setRoute(parseRoute(window.location.search))
  }, [])

  const activeHub = route.view === 'arc' ? route.hub : hub
  const token = loadToken(activeHub)
  const session: Session = useMemo(() => ({ hub: activeHub, token }), [activeHub, token])

  if (route.view === 'error') {
    return (
      <main className="page">
        <h1 className="logo">ARC<span>ade</span></h1>
        <p className="notice error" role="alert">{route.message}</p>
        <a className="btn" href={routeUrl({ view: 'picker' }, BASE)} onClick={(e) => { e.preventDefault(); navigate({ view: 'picker' }) }}>Back to the ARCs</a>
      </main>
    )
  }

  if (route.view === 'picker') {
    return <Picker hub={hub} onHub={setHub} token={token} onAuthChange={() => bump((n) => n + 1)} navigate={navigate} />
  }

  return (
    <Suspense fallback={<p className="notice" role="status">Loading the game…</p>}>
      <GameView
        key={route.view === 'arc' ? `${route.hub.id}:${route.projectId}` : 'sample'}
        source={route.view === 'arc' ? { kind: 'arc', session, projectId: route.projectId } : { kind: 'sample' }}
        seed={route.view === 'arc' ? route.seed : null}
        navigate={navigate}
      />
    </Suspense>
  )
}
