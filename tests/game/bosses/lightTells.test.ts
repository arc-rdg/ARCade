import { ARC } from '@nfdi4plants/arctrl'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildProvenanceIndex } from '../../../src/arc/provenance/buildIndex'
import { STEP_MS } from '../../../src/game/contracts/constants'
import type { RunPlan, Segment } from '../../../src/game/contracts/run'
import { bossGenome, genomeAttacks, genomeMechanics } from '../../../src/game/model/content'
import { planRun } from '../../../src/game/model/run'
import { BEAM_CIRCLE_RADIUS, beamCircleOffsets, createRun, isFloorOnly } from '../../../src/game/phaser/bosses/attacks'
import { poseFormMs, poseProgress } from '../../../src/game/phaser/bosses/pose'
import { CAMP_HOLD_MS, CAMP_MS, createPerchWatch, isCamping, watchPerch } from '../../../src/game/phaser/bosses/reach'
import { createLead, leadMsFor, TELL_LEAD_MS, tickLead } from '../../../src/game/phaser/bosses/tellLead'
import { arenaPlatforms } from '../../../src/game/phaser/bosses/zones'
import { crateJson } from '../../helpers/sampleCrate'

let plan: RunPlan

beforeAll(() => {
  const planned = planRun(buildProvenanceIndex(ARC.fromROCrateJsonString(crateJson)), 'Talinum', 'light-tells')
  if (!planned) throw new Error('The sample ARC has no path')
  plan = planned
})

const segmentWith = (quality: number): Segment => ({ ...plan.segments[0], quality, telegraphMs: Math.round(80 + 820 * quality) })

describe('light attack wind-up', () => {
  it.each([
    { quality: 0, ms: 270 },
    { quality: 0.5, ms: 360 },
    { quality: 1, ms: 450 },
  ])('winds up for $ms ms at quality $quality, on every light attack of the boss and its phase shift', ({ quality, ms }) => {
    const genome = bossGenome(segmentWith(quality), 'sample')
    const lights = genomeAttacks(genome).filter((attack) => !attack.heavy)
    expect(lights.length).toBeGreaterThan(0)
    for (const attack of lights) expect(attack.telegraphMs).toBe(ms)
    // A phase shift swaps the light attacks and keeps the wind-up.
    const shifted = genomeMechanics({ ...genome, mechanics: [{ category: 'factor', sources: [], mechanic: 'phaseShift' }] })
    for (const attack of shifted.flatMap((spec) => spec.shiftAttacks)) expect(attack.telegraphMs).toBe(ms)
  })

  it('forms the pose within about 110 ms at the shortest wind-up and 120 ms at the longest, then holds it', () => {
    expect(poseFormMs(270)).toBe(108)
    expect(poseFormMs(450)).toBe(120)
    expect(poseProgress(108, 270)).toBe(1)
    expect(poseProgress(120, 450)).toBe(1)
    expect(poseProgress(50, 270)).toBeGreaterThan(0.5)
    expect(poseProgress(200, 270)).toBe(1)
  })
})

describe('aimed beam', () => {
  it.each([60, 137, 420])('keeps the union of its circles inside the drawn band for length %d', (length) => {
    const offsets = beamCircleOffsets(length)
    expect(offsets.length).toBeGreaterThan(1)
    // The circles sit on the line, so they never leave the band sideways; check the ends and the gaps.
    expect(offsets[0] - BEAM_CIRCLE_RADIUS).toBeGreaterThanOrEqual(0)
    expect(offsets[offsets.length - 1] + BEAM_CIRCLE_RADIUS).toBeLessThanOrEqual(length + 1e-6)
    for (let i = 1; i < offsets.length; i++) expect(offsets[i] - offsets[i - 1]).toBeLessThanOrEqual(2 * BEAM_CIRCLE_RADIUS)
    expect(2 * BEAM_CIRCLE_RADIUS).toBeLessThanOrEqual(16)
  })
})

describe('camping and floor-only attacks', () => {
  const platforms = arenaPlatforms(0, 1024, 0)
  const p = platforms[0]
  const stand = (watch: ReturnType<typeof createPerchWatch>, floorOnly: boolean, ms: number) => {
    for (let t = 0; t < ms; t += STEP_MS) watchPerch(watch, platforms, p.x + p.w / 2, p.top, true, STEP_MS, floorOnly)
  }

  it('does not count the time on a platform during a quake or flood, nor the 500 ms after it', () => {
    const watch = createPerchWatch()
    stand(watch, false, 1000)
    const before = watch.campMs
    stand(watch, true, 3000)
    stand(watch, false, CAMP_HOLD_MS - STEP_MS)
    expect(watch.campMs).toBe(before)
    stand(watch, false, 2 * STEP_MS)
    expect(watch.campMs).toBeGreaterThan(before)
    stand(watch, false, CAMP_MS)
    expect(isCamping(watch)).toBe(true)
  })

  it('a player who stays up during repeated quakes never counts as camping', () => {
    const watch = createPerchWatch()
    for (let i = 0; i < 6; i++) {
      stand(watch, true, 1500)
      stand(watch, false, 400)
    }
    expect(isCamping(watch)).toBe(false)
  })

  it('treats only the quake and the flood as floor-only, while they wind up or strike', () => {
    const run = createRun()
    const set = (kind: 'slam' | 'shockwave' | 'rain', variant: number, phase: 'windup' | 'active' | 'recovery' | 'none') => {
      run.spec = { ...run.spec, kind }
      run.variant = variant
      run.phase = phase
      return isFloorOnly(run)
    }
    expect(set('slam', 2, 'windup')).toBe(true)
    expect(set('slam', 2, 'active')).toBe(true)
    expect(set('shockwave', 1, 'windup')).toBe(true)
    expect(set('slam', 2, 'recovery')).toBe(false)
    expect(set('slam', 0, 'windup')).toBe(false)
    expect(set('shockwave', 0, 'active')).toBe(false)
    expect(set('rain', 1, 'windup')).toBe(false)
  })
})

describe('tell text', () => {
  it('shows 300 ms before the zone of a heavy attack, and only when there is a tell', () => {
    expect(leadMsFor(true, true)).toBe(300)
    expect(leadMsFor(true, false)).toBe(0)
    expect(leadMsFor(false, true)).toBe(0)
    const lead = createLead<string>()
    lead.spec = 'heavy'
    lead.ms = TELL_LEAD_MS
    let waited = 0
    let due: string | null = null
    while (!due) {
      due = tickLead(lead, STEP_MS)
      waited += STEP_MS
    }
    expect(due).toBe('heavy')
    expect(waited).toBeGreaterThanOrEqual(TELL_LEAD_MS)
    expect(waited).toBeLessThan(TELL_LEAD_MS + STEP_MS)
    expect(tickLead(lead, STEP_MS)).toBeNull()
  })
})
