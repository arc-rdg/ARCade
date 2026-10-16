import { useEffect, useMemo, useState } from 'react'
import mage from '../../src/game/assets/ARCMage.png'
import { clearToken } from './auth'
import { gitlabSource, type GitLabProject } from './gitlab'
import { HUBS, findHub, type Hub } from './hubs'
import { LoginDialog } from './LoginDialog'
import { routeUrl } from './route'

interface Props {
  hub: Hub
  onHub: (hub: Hub) => void
  token: string | null
  onAuthChange: () => void
  expired: boolean
  onExpired: () => void
  navigate: (route: { view: 'sample' } | { view: 'arc'; hub: Hub; projectId: number }) => void
}

const BASE = import.meta.env.BASE_URL

function excerpt(text: string | null | undefined): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim()
  return clean.length > 200 ? `${clean.slice(0, 200)}…` : clean
}

function formatDate(iso: string | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function Picker({ hub, onHub, token, onAuthChange, expired, onExpired, navigate }: Props) {
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [mine, setMine] = useState(false)
  const [data, setData] = useState<{ key: string; page: number; items: GitLabProject[]; nextPage: number | null } | null>(null)
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null)
  const [retry, setRetry] = useState(0)
  const [login, setLogin] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => setQuery(input), 300)
    return () => clearTimeout(id)
  }, [input])

  const session = useMemo(() => ({ hub, token }), [hub, token])
  const source = useMemo(() => gitlabSource(session, { mine, onExpired }), [session, mine, onExpired])
  const mineActive = mine && token !== null

  // A new query, hub, token or filter restarts at page 1; a page bump appends.
  const key = `${hub.id}|${token ?? ''}|${mineActive}|${query}`
  const [paging, setPaging] = useState({ key, n: 1 })
  const pageNow = paging.key === key ? paging.n : 1
  useEffect(() => {
    const ctl = new AbortController()
    source.search(query, pageNow, ctl.signal).then((result) => {
      if (ctl.signal.aborted) return
      setFailure(null)
      setData((prev) => ({
        key,
        page: pageNow,
        items: pageNow === 1 || prev?.key !== key ? result.items : [...prev.items, ...result.items],
        nextPage: result.nextPage,
      }))
    }, (e: unknown) => {
      if (ctl.signal.aborted) return
      setFailure({ key, message: e instanceof Error ? e.message : 'The search failed.' })
    })
    return () => ctl.abort()
  }, [key, pageNow, source, query, retry])

  const current = data?.key === key ? data : null
  const items = current?.items ?? []
  const nextPage = current?.nextPage ?? null
  const error = failure?.key === key ? failure.message : null
  const status = error && !current ? 'error' : current ? 'ready' : 'loading'
  const more = current !== null && current.page < pageNow && !error

  const open = (event: React.MouseEvent, project: GitLabProject) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
    event.preventDefault()
    navigate({ view: 'arc', hub, projectId: project.id })
  }

  return (
    <main className="page">
      <header className="top">
        <div className="brand">
          <span className="mage" aria-hidden="true"><img src={mage} alt="" /></span>
          <h1 className="logo">ARC<span>ade</span></h1>
        </div>
        <div className="auth">
          {token ? (
            <button type="button" className="btn" onClick={() => { clearToken(hub); setMine(false); onAuthChange() }}>Log out</button>
          ) : (
            <button type="button" className="btn" onClick={() => setLogin(true)}>Log in</button>
          )}
        </div>
      </header>
      <p className="lead">Pick an ARC and play its provenance as a game.</p>

      {expired && !token && (
        <p className="notice error" role="alert">
          Your login expired. Log in again.{' '}
          <button type="button" className="btn" onClick={() => setLogin(true)}>Log in</button>
        </p>
      )}

      <a className="sample" href={routeUrl({ view: 'sample' }, BASE)}
        onClick={(e) => { e.preventDefault(); navigate({ view: 'sample' }) }}>
        <strong>Play the sample ARC (Talinum)</strong>
        <span>Facultative CAM in Talinum, bundled, no login needed.</span>
      </a>

      <form className="controls" role="search" onSubmit={(e) => { e.preventDefault(); setQuery(input) }}>
        {HUBS.length > 1 && (
          <label className="field">
            <span>Hub</span>
            <select value={hub.id} onChange={(e) => { const next = findHub(e.target.value); if (next) { setMine(false); onHub(next) } }}>
              {HUBS.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </label>
        )}
        <label className="field grow">
          <span>Search ARCs</span>
          <input type="search" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Name or description" />
        </label>
        {token && (
          <label className="check">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
            <span>My ARCs</span>
          </label>
        )}
      </form>

      {status === 'loading' && <p className="notice" role="status">Searching {hub.name}…</p>}
      {status === 'error' && <p className="notice error" role="alert">{error}</p>}
      {status === 'ready' && error && <p className="notice error" role="alert">{error}</p>}
      {status === 'ready' && items.length === 0 && <p className="notice">No ARCs found.</p>}

      <ul className="results">
        {items.map((project) => (
          <li key={project.id}>
            <a className="card" href={routeUrl({ view: 'arc', hub, projectId: project.id }, BASE)} onClick={(e) => open(e, project)}>
              <span className="cardtitle">{project.name}</span>
              <span className="meta">
                {project.namespace?.full_path ?? project.path_with_namespace}
                {project.last_activity_at ? ` · ${formatDate(project.last_activity_at)}` : ''}
                {project.visibility && project.visibility !== 'public' && <span className="badge">{project.visibility}</span>}
              </span>
              {project.description && <span className="desc">{excerpt(project.description)}</span>}
            </a>
          </li>
        ))}
      </ul>

      {nextPage !== null && status === 'ready' && (
        <button type="button" className="btn more" disabled={more} onClick={() => { setPaging({ key, n: nextPage }); setRetry((n) => n + 1) }}>
          {more ? 'Loading…' : 'Load more'}
        </button>
      )}

      {login && <LoginDialog hub={hub} onClose={() => setLogin(false)} onDone={() => { setLogin(false); onAuthChange() }} />}
    </main>
  )
}
