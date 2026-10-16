import { mountArcade } from '@arc-rdg/arcade'
import { readRoCrate } from '@arc-rdg/arcade/arc'
import { useEffect, useRef, useState } from 'react'
import type { Hub } from './hubs'
import { fetchCrate, fetchProject, NoArcJsonError } from './gitlab'
import { routeUrl } from './route'

interface Props {
  hub: Hub
  /** null plays the bundled sample. */
  projectId: number | null
  token: string | null
  seed: string | null
  onExpired: () => void
  navigate: (route: { view: 'picker' }) => void
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; title: string; provenance: ReturnType<typeof readRoCrate>['provenance']; link: string | null }

function safeOrigin(url: string): string | null {
  try { return new URL(url).origin } catch { return null }
}

const SAMPLE_URL = `${import.meta.env.BASE_URL}sample-arcs/facultative-cam-in-talinum/ro-crate-metadata.json`

export default function GameView({ hub, projectId, token, seed, onExpired, navigate }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const host = useRef<HTMLDivElement>(null)
  // Latest values for the load effect, which must restart only when the ARC changes.
  const latest = useRef({ token, onExpired })
  useEffect(() => { latest.current = { token, onExpired } })

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    void (async () => {
      try {
        let text: string
        let link: string | null = null
        if (projectId === null) {
          const response = await fetch(SAMPLE_URL, { signal, credentials: 'omit' })
          if (!response.ok) throw new Error('The sample ARC could not be loaded.')
          text = await response.text()
        } else {
          const session = { hub, token: latest.current.token }
          const [crate, project] = await Promise.all([
            fetchCrate(session, projectId, signal, latest.current.onExpired),
            fetchProject({ hub, token: null }, projectId, signal).catch(() => null),
          ])
          text = crate
          link = project && safeOrigin(project.web_url) === hub.origin ? project.web_url : null
        }
        const { title, provenance } = readRoCrate(text)
        if (!signal.aborted) setState({ status: 'ready', title, provenance, link })
      } catch (error) {
        if (signal.aborted) return
        const message = error instanceof NoArcJsonError
          ? 'This ARC has no ARC JSON yet. It may not be an ARC, or its CI has not run.'
          : error instanceof Error ? error.message : 'The ARC could not be loaded.'
        setState({ status: 'error', message })
      }
    })()
    return () => controller.abort()
  }, [hub, projectId])

  const ready = state.status === 'ready' ? state : null
  useEffect(() => {
    if (!ready || !host.current) return
    const arcade = mountArcade(host.current, {
      title: ready.title,
      provenance: ready.provenance,
      ...(seed ? { seed } : {}),
    })
    return () => arcade.destroy()
  }, [ready, seed])

  const back = (
    <a className="back" href={routeUrl({ view: 'picker' }, import.meta.env.BASE_URL)}
      onClick={(e) => { e.preventDefault(); navigate({ view: 'picker' }) }}>
      ← ARCs
    </a>
  )

  return (
    <div className="gameview">
      <header className="gamebar">
        {back}
        <span className="gametitle">{ready ? ready.title : projectId === null ? 'Talinum sample ARC' : 'ARC'}</span>
        {ready?.link && <a className="barlink" href={ready.link} target="_blank" rel="noopener noreferrer">View on GitLab</a>}
      </header>
      {state.status === 'loading' && <p className="notice" role="status">Loading the ARC…</p>}
      {state.status === 'error' && (
        <p className="notice error" role="alert">
          {state.message}{' '}
          <a href={routeUrl({ view: 'picker' }, import.meta.env.BASE_URL)}
            onClick={(e) => { e.preventDefault(); navigate({ view: 'picker' }) }}>Back to the ARCs to log in</a>
        </p>
      )}
      <div className="gamehost" ref={host} hidden={!ready} />
    </div>
  )
}
