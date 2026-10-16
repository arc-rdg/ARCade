import { mountArcade } from '@arc-rdg/arcade'
import { readRoCrate } from '@arc-rdg/arcade/arc'
import { useEffect, useRef, useState } from 'react'
import type { Session } from './auth'
import { fetchCrate, fetchProject, NoArcJsonError } from './gitlab'
import { routeUrl } from './route'

type Source = { kind: 'sample' } | { kind: 'arc'; session: Session; projectId: number }

interface Props {
  source: Source
  seed: string | null
  navigate: (route: { view: 'picker' }) => void
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; title: string; provenance: ReturnType<typeof readRoCrate>['provenance']; link: string | null }

const SAMPLE_URL = `${import.meta.env.BASE_URL}sample-arcs/facultative-cam-in-talinum/ro-crate-metadata.json`

export default function GameView({ source, seed, navigate }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    void (async () => {
      try {
        let text: string
        let link: string | null = null
        if (source.kind === 'sample') {
          const response = await fetch(SAMPLE_URL, { signal, credentials: 'omit' })
          if (!response.ok) throw new Error('The sample ARC could not be loaded.')
          text = await response.text()
        } else {
          const [crate, project] = await Promise.all([
            fetchCrate(source.session, source.projectId, signal),
            fetchProject(source.session, source.projectId, signal),
          ])
          text = crate
          link = project?.web_url ?? null
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
  }, [source])

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
        <span className="gametitle">{ready ? ready.title : source.kind === 'sample' ? 'Talinum sample ARC' : 'ARC'}</span>
        {ready?.link && <a className="barlink" href={ready.link} target="_blank" rel="noopener noreferrer">View on GitLab</a>}
      </header>
      {state.status === 'loading' && <p className="notice" role="status">Loading the ARC…</p>}
      {state.status === 'error' && <p className="notice error" role="alert">{state.message}</p>}
      <div className="gamehost" ref={host} hidden={!ready} />
    </div>
  )
}
