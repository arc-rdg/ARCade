import { ARC } from '@nfdi4plants/arctrl'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildProvenanceIndex } from '../../../src/arc/provenance/buildIndex'
import type { RunPlan } from '../../../src/game/contracts/run'
import { planRun } from '../../../src/game/model/run'
import { historyRow, runRecap, statStacks } from '../../../src/game/phaser/scenes/levelHistory'
import { RunDirector } from '../../../src/game/phaser/scenes/RunDirector'
import { crateJson } from '../../helpers/sampleCrate'

let plan: RunPlan

beforeAll(() => {
  const found = planRun(buildProvenanceIndex(ARC.fromROCrateJsonString(crateJson)), 'Talinum', 'swate')
  if (!found) throw new Error('No plan')
  plan = found
})

// A run after its first boss with two Impact Factor stacks and Data Aggregation.
function inWaystation(): RunDirector {
  const director = new RunDirector(plan, { emit: () => {}, enter: () => {} })
  director.start()
  for (const cardId of ['stat.sharpened', 'weapon.wand', 'stat.sharpened', 'mechanic.centrifugeSpin']) {
    director.creditXp(1000)
    director.rollOffer()
    director.chooseCard(cardId)
    while (director.pendingLevelUps > 0) director.chooseCard(null)
  }
  director.completeStretch()
  director.defeatBoss()
  return director
}

describe('SWATE (deprecated) in a run', () => {
  it('has as many swaps as bosses slain, and the first waystation follows the first boss', () => {
    const director = inWaystation()
    expect(director.stage).toEqual({ kind: 'waystation', index: 0 })
    expect(director.swapsLeft(0)).toBe(1)
    expect(director.swapsLeft(1)).toBe(2)
    expect(director.swapsLeft(3)).toBe(4)
  })

  it('pays twice the trader price, swaps the cards and writes the history and the recap', () => {
    const director = inWaystation()
    director.fragments = 25
    const result = director.refine(0, 'stat.sharpened', 'stat.swiftFeet')
    expect(result?.cost).toBe(10)
    expect(director.fragments).toBe(15)
    expect(director.swapsLeft(0)).toBe(0)
    expect(director.build.weapons.light.id).toBe('wand')
    const last = director.levelHistory.at(-1)
    expect(last && historyRow(last).title).toBe('Refined: Impact Factor → Fast Track · 10 fragments')
    const entry = runRecap(director.levelHistory).at(-1)
    expect(entry).toMatchObject({ tag: 'Refined', name: 'Impact Factor → Fast Track', note: '10 fragments', refined: true })
    // The stack counts follow, so the Datenkrake sees the swapped-in card and not the old one.
    expect(statStacks(director.levelHistory)).toEqual({ 'stat.sharpened': 1, 'stat.swiftFeet': 1 })
  })

  it('does nothing without swaps left or without the fragments', () => {
    const director = inWaystation()
    director.fragments = 9
    expect(director.refine(0, 'stat.sharpened', 'stat.swiftFeet')).toBeNull()
    director.fragments = 100
    expect(director.refine(0, 'stat.sharpened', 'stat.swiftFeet')).not.toBeNull()
    const build = director.build
    expect(director.refine(0, 'stat.sharpened', 'stat.quickHands')).toBeNull()
    expect(director.build).toBe(build)
    expect(director.fragments).toBe(90)
    // Another waystation has swaps of its own.
    expect(director.refine(1, 'stat.sharpened', 'stat.quickHands')).not.toBeNull()
  })

  it('keeps the unused swaps while the player is at this waystation', () => {
    const director = inWaystation()
    director.fragments = 100
    // The player leaves the screen and comes back: nothing was spent.
    expect(director.swapsLeft(1)).toBe(2)
    director.refine(1, 'stat.sharpened', 'stat.quickHands')
    expect(director.swapsLeft(1)).toBe(1)
  })

  it('moves an ability card into the freed slot', () => {
    const director = inWaystation()
    director.fragments = 100
    const slot = director.build.abilitySlots.indexOf('centrifugeSpin')
    director.refine(0, 'mechanic.centrifugeSpin', 'mechanic.citationNeeded')
    expect(director.build.abilitySlots[slot]).toBe('citationNeeded')
  })
})
