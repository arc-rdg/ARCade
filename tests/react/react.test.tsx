import { cleanup, render } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ArcadeProvenance } from '../../src/index'

const live = new Set<object>()
const mountArcade = vi.fn()
const mountArcadeBanner = vi.fn()

vi.mock('../../src/shell/arcade', () => ({ mountArcade: (...args: unknown[]) => mountArcade(...args) }))
vi.mock('../../src/shell/banner', () => ({ mountArcadeBanner: (...args: unknown[]) => mountArcadeBanner(...args) }))

const { Arcade, ArcadeBanner } = await import('../../src/react')

const provenance = (): ArcadeProvenance => ({ nodes: [], rows: [], processes: [], datasets: [] })

beforeEach(() => {
  live.clear()
  mountArcade.mockImplementation(() => {
    const handle = { update: vi.fn(), requestFullscreen: vi.fn(), destroy: vi.fn(() => live.delete(handle)) }
    live.add(handle)
    return handle
  })
  mountArcadeBanner.mockImplementation(() => {
    const handle = { destroy: vi.fn(() => live.delete(handle)) }
    live.add(handle)
    return handle
  })
})
afterEach(cleanup)

describe('Arcade', () => {
  it('leaves exactly one live arcade under StrictMode', () => {
    render(
      <StrictMode>
        <Arcade title="A" provenance={provenance()} />
      </StrictMode>,
    )
    expect(live.size).toBe(1)
    expect(mountArcade.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('updates instead of remounting when title, provenance or seed change', () => {
    const first = provenance()
    const { rerender } = render(<Arcade title="A" provenance={first} />)
    expect(mountArcade).toHaveBeenCalledTimes(1)
    const handle = mountArcade.mock.results[0].value
    rerender(<Arcade title="A" provenance={first} className="x" />)
    expect(handle.update).not.toHaveBeenCalled()
    const next = provenance()
    rerender(<Arcade title="B" provenance={next} seed="s" />)
    expect(mountArcade).toHaveBeenCalledTimes(1)
    expect(handle.update).toHaveBeenCalledWith({ title: 'B', provenance: next, seed: 's' })
  })

  it('does not remount when the callback changes and calls the latest one', () => {
    const one = vi.fn()
    const two = vi.fn()
    const { rerender } = render(<Arcade title="A" provenance={provenance()} onEvent={one} />)
    rerender(<Arcade title="A" provenance={provenance()} onEvent={two} />)
    expect(mountArcade).toHaveBeenCalledTimes(1)
    const options = mountArcade.mock.calls[0][1]
    options.onEvent({ type: 'x' })
    expect(one).not.toHaveBeenCalled()
    expect(two).toHaveBeenCalledWith({ type: 'x' })
  })

  it('destroys on unmount', () => {
    const { unmount } = render(<Arcade title="A" provenance={provenance()} />)
    const handle = mountArcade.mock.results[0].value
    unmount()
    expect(handle.destroy).toHaveBeenCalledTimes(1)
    expect(live.size).toBe(0)
  })
})

describe('ArcadeBanner', () => {
  it('mounts once under StrictMode and destroys on unmount', () => {
    const { unmount } = render(
      <StrictMode>
        <ArcadeBanner />
      </StrictMode>,
    )
    expect(live.size).toBe(1)
    unmount()
    expect(live.size).toBe(0)
  })
})
