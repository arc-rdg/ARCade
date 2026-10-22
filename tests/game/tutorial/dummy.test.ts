import { describe, expect, it } from 'vitest'
import {
  COMBO_GAP_MS,
  createReadout,
  createSwingCycle,
  createWobble,
  DPS_WINDOW_MS,
  READOUT_INTERVAL_MS,
  SWING_ACTIVE_MS,
  SWING_CYCLE_MS,
  SWING_TELEGRAPH_MS,
} from '../../../src/game/model/tutorial/dummy'

describe('readout', () => {
  it('counts a combo of hits that follow each other closely and drops it after a pause', () => {
    const readout = createReadout()
    readout.hit(10, 0)
    readout.hit(10, 500)
    readout.hit(10, 1000)
    readout.update(1000)
    expect(readout.combo()).toBe(3)

    readout.update(1000 + COMBO_GAP_MS + READOUT_INTERVAL_MS)
    expect(readout.combo()).toBe(0)
    readout.hit(10, 5000)
    readout.update(5000)
    expect(readout.combo()).toBe(1)
  })

  it('reports damage per second over the window and lets it decay', () => {
    const readout = createReadout()
    readout.hit(30, 0)
    readout.hit(30, 1000)
    readout.update(1000)
    expect(readout.dps()).toBe(20)

    readout.update(DPS_WINDOW_MS + 500)
    expect(readout.dps()).toBe(10)
    readout.update(DPS_WINDOW_MS + 1500)
    expect(readout.dps()).toBe(0)
  })

  it('only changes its shown numbers a few times a second', () => {
    const readout = createReadout()
    readout.hit(10, 0)
    expect(readout.update(0)).toBe(true)
    expect(readout.update(50)).toBe(false)
    expect(readout.update(READOUT_INTERVAL_MS)).toBe(false)
  })

  it('survives ten thousand hits', () => {
    const readout = createReadout()
    for (let i = 0; i < 10_000; i++) readout.hit(5, i * 20)
    readout.update(10_000 * 20)
    expect(readout.combo()).toBe(10_000)
    expect(readout.dps()).toBeGreaterThan(0)
    expect(Number.isFinite(readout.dps())).toBe(true)
  })
})

describe('wobble', () => {
  it('leans away from a hit, swings back and settles', () => {
    const wobble = createWobble()
    wobble.impulse(1, 20)
    wobble.step(16)
    expect(wobble.angle()).toBeGreaterThan(0)
    expect(wobble.settled()).toBe(false)

    for (let i = 0; i < 300; i++) wobble.step(16)
    expect(wobble.settled()).toBe(true)
    expect(wobble.angle()).toBe(0)
  })

  it('leans the other way for a hit from the other side and caps a huge hit', () => {
    const wobble = createWobble()
    wobble.impulse(-1, 100000)
    let lowest = 0
    for (let i = 0; i < 100; i++) {
      wobble.step(16)
      lowest = Math.min(lowest, wobble.angle())
    }
    expect(lowest).toBeLessThan(0)
    expect(lowest).toBeGreaterThan(-1.2)
  })
})

describe('swing cycle', () => {
  function run(cycle: ReturnType<typeof createSwingCycle>, ms: number) {
    const seen: string[] = []
    for (let t = 0; t < ms; t += 10) {
      const phase = cycle.step(10)
      if (seen.at(-1) !== phase) seen.push(phase)
    }
    return seen
  }

  it('stays idle until enabled', () => {
    const cycle = createSwingCycle()
    expect(run(cycle, 3000)).toEqual(['idle'])
  })

  it('goes through telegraph, active and recovery, and repeats while enabled', () => {
    const cycle = createSwingCycle()
    cycle.enable(true)
    expect(run(cycle, SWING_CYCLE_MS * 2 - 20)).toEqual(['telegraph', 'active', 'recover', 'telegraph', 'active', 'recover'])
  })

  it('times the phases from the start of the cycle', () => {
    const cycle = createSwingCycle()
    cycle.enable(true)
    cycle.step(0)
    expect(cycle.step(SWING_TELEGRAPH_MS - 10)).toBe('telegraph')
    expect(cycle.step(20)).toBe('active')
    expect(cycle.startedActive()).toBe(true)
    expect(cycle.step(SWING_ACTIVE_MS)).toBe('recover')
    expect(cycle.startedActive()).toBe(false)
  })

  it('finishes the swing that runs when disabled and then goes idle', () => {
    const cycle = createSwingCycle()
    cycle.enable(true)
    cycle.step(0)
    cycle.step(300)
    cycle.enable(false)
    expect(run(cycle, SWING_CYCLE_MS)).toEqual(['telegraph', 'active', 'recover', 'idle'])
  })
})
