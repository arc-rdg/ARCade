import { useEffect, useRef, type CSSProperties } from 'react'
import { mountArcade, type ArcadeHandle, type ArcadeOptions } from '../shell/arcade'
import { mountArcadeBanner } from '../shell/banner'

export type { ArcadeHandle, ArcadeOptions, ArcadeProvenance, GameEvent, RunPlan } from '../index'

export interface ArcadeProps extends ArcadeOptions {
  className?: string
  style?: CSSProperties
}

// Fills its parent. The game is mounted once per mount of the component; a new title, provenance or
// seed goes through handle.update, the other options are read when the game mounts.
export function Arcade({ className, style, onEvent, ...options }: ArcadeProps) {
  const host = useRef<HTMLDivElement>(null)
  const handle = useRef<ArcadeHandle | null>(null)
  const latest = useRef({ options, onEvent })
  const { title, provenance, seed } = options

  // Declared before the mount effect so that effect sees the props of this render.
  useEffect(() => {
    latest.current = { options, onEvent }
  })

  useEffect(() => {
    const el = host.current
    if (!el) return
    const { options: first } = latest.current
    handle.current = mountArcade(el, { ...first, onEvent: (event) => latest.current.onEvent?.(event) })
    return () => {
      handle.current?.destroy()
      handle.current = null
    }
  }, [])

  const mounted = useRef({ title, provenance, seed })
  useEffect(() => {
    const before = mounted.current
    if (before.title === title && before.provenance === provenance && before.seed === seed) return
    mounted.current = { title, provenance, seed }
    handle.current?.update({ title, provenance, seed })
  }, [title, provenance, seed])

  return <div ref={host} className={className} style={{ width: '100%', height: '100%', ...style }} />
}

// The compact tile banner. Fills its parent.
export function ArcadeBanner({ className, style }: { className?: string; style?: CSSProperties }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = host.current
    if (!el) return
    const banner = mountArcadeBanner(el)
    return () => banner.destroy()
  }, [])
  return <div ref={host} className={className} style={{ width: '100%', height: '100%', ...style }} />
}
