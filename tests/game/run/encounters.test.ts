import { describe, expect, it } from 'vitest'
import { CHANCE_ENCOUNTERS, ENCOUNTER_SLOTS, REPEAT_FACTOR, rollEncounters } from '../../../src/game/model/run'

describe('rollEncounters', () => {
  it('always meets the FAIR trader first, in every waystation of every run', () => {
    for (const seed of ['storybook', 'a', 'b', 'Talinum']) {
      for (let index = 0; index < 8; index++) expect(rollEncounters(seed, index)[0]).toBe('trader')
    }
  })

  it('meets at most one chance encounter per waystation, in the slot between the trader and the exit', () => {
    for (let i = 0; i < 3000; i++) {
      const kinds = rollEncounters(`one-${i}`, i % 7)
      expect(kinds.length).toBeLessThanOrEqual(2)
      expect(kinds[0]).toBe('trader')
      expect(kinds.includes('datenkrake') && kinds.includes('swate')).toBe(false)
    }
    expect(ENCOUNTER_SLOTS[1]).toBe('right')
  })

  it('meets each encounter at its own chance the first time: Datenkrake 40%, SWATE 25%, neither 35%', () => {
    expect(CHANCE_ENCOUNTERS).toEqual([
      { kind: 'datenkrake', chance: 0.4 },
      { kind: 'swate', chance: 0.25 },
    ])
    const counts = { datenkrake: 0, swate: 0, none: 0 }
    const rolls = 8000
    for (let i = 0; i < rolls; i++) {
      const kinds = rollEncounters(`first-${i}`, 0)
      if (kinds.includes('datenkrake')) counts.datenkrake++
      else if (kinds.includes('swate')) counts.swate++
      else counts.none++
    }
    expect(counts.datenkrake / rolls).toBeGreaterThan(0.37)
    expect(counts.datenkrake / rolls).toBeLessThan(0.43)
    expect(counts.swate / rolls).toBeGreaterThan(0.22)
    expect(counts.swate / rolls).toBeLessThan(0.28)
    expect(counts.none / rolls).toBeGreaterThan(0.32)
    expect(counts.none / rolls).toBeLessThan(0.38)
  })

  it('meets an encounter far less often once it has appeared in the run, kind by kind', () => {
    expect(REPEAT_FACTOR).toBe(0.2)
    // Waystation 5 of runs where the kind showed up at waystation 0, against runs where it never did.
    const tally = (kind: 'datenkrake' | 'swate') => {
      const repeat = { met: 0, runs: 0 }
      const first = { met: 0, runs: 0 }
      for (let i = 0; i < 20000; i++) {
        const seed = `again-${i}`
        const seen = Array.from({ length: 5 }, (_, index) => rollEncounters(seed, index).includes(kind))
        const bucket = seen[0] ? repeat : seen.some(Boolean) ? null : first
        if (!bucket) continue
        bucket.runs++
        if (rollEncounters(seed, 5).includes(kind)) bucket.met++
      }
      return { repeat: repeat.met / repeat.runs, first: first.met / first.runs }
    }
    const kraken = tally('datenkrake')
    expect(kraken.first).toBeGreaterThan(0.33)
    expect(kraken.repeat).toBeLessThan(0.12)
    expect(kraken.repeat).toBeGreaterThan(0.04)
    const swate = tally('swate')
    expect(swate.first).toBeGreaterThan(0.2)
    expect(swate.repeat).toBeLessThan(0.08)
    expect(swate.repeat).toBeGreaterThan(0.02)
  })

  it('lets the two encounters repeat independently: a seen kraken does not change SWATE', () => {
    let withKraken = 0
    let withKrakenSwate = 0
    let without = 0
    let withoutSwate = 0
    for (let i = 0; i < 6000; i++) {
      const seed = `indep-${i}`
      const first = rollEncounters(seed, 0)
      const second = rollEncounters(seed, 1)
      if (first.includes('swate')) continue
      if (first.includes('datenkrake')) {
        withKraken++
        if (second.includes('swate')) withKrakenSwate++
      } else {
        without++
        if (second.includes('swate')) withoutSwate++
      }
    }
    expect(Math.abs(withKrakenSwate / withKraken - withoutSwate / without)).toBeLessThan(0.05)
  })

  it('rolls each waystation of a run on its own', () => {
    const pattern = Array.from({ length: 12 }, (_, index) => rollEncounters('one run', index).includes('datenkrake'))
    expect(pattern).toContain(true)
    expect(pattern).toContain(false)
  })

  it('meets the same encounters for the same run and waystation', () => {
    for (let index = 0; index < 8; index++) expect(rollEncounters('again', index)).toEqual(rollEncounters('again', index))
  })

  it('never meets more encounters than the room has slots, nor one twice', () => {
    for (let index = 0; index < 20; index++) {
      const kinds = rollEncounters(`slots-${index}`, index)
      expect(kinds.length).toBeLessThanOrEqual(ENCOUNTER_SLOTS.length)
      expect(new Set(kinds).size).toBe(kinds.length)
    }
    expect(new Set(ENCOUNTER_SLOTS).size).toBe(3)
    expect(ENCOUNTER_SLOTS[0]).toBe('centre')
  })
})
