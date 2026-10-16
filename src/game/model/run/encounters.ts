import { createRng } from '../../contracts/rng'

// What the mage meets in the waystation between a node boss and the next step. The FAIR trader is
// always there. One chance encounter at most comes on top of it, so adding one is a new
// kind here, an entry in CHANCE_ENCOUNTERS and a spawner in the waystation scene.

// The Datenkrake grabs the mage and wants an augment (model/progression/datenkrake.ts). SWATE
// (deprecated) swaps one for another of the same rarity (model/progression/swate.ts).
export type EncounterKind = 'trader' | 'datenkrake' | 'swate'

// Where an encounter stands in the waystation, from the entrance on the left to the exit portal on
// the right.
export type EncounterSlot = 'left' | 'centre' | 'right'

// The order the slots fill in: the first encounter stands in the middle of the room, the second
// between it and the exit, so the mage passes the trader before meeting it. A chance encounter
// takes the second slot.
export const ENCOUNTER_SLOTS: readonly EncounterSlot[] = ['centre', 'right', 'left']

// A waystation holds at most one chance encounter. Each kind has its own chance for the first
// appearance in a run. Once it has appeared, that chance is multiplied by REPEAT_FACTOR, kind by
// kind, so the Datenkrake showing up says nothing about SWATE. One roll per waystation is cut into
// slices of those chances (the chances add up to well below 1), so at most one kind can come.
//
//   first time: Datenkrake 40%, SWATE (deprecated) 25%, neither 35%
//   again:      Datenkrake  8%, SWATE (deprecated)  5%
export interface ChanceEncounter {
  kind: Exclude<EncounterKind, 'trader'>
  // The chance per waystation until it has appeared once in this run.
  chance: number
}

export const CHANCE_ENCOUNTERS: readonly ChanceEncounter[] = [
  { kind: 'datenkrake', chance: 0.4 },
  { kind: 'swate', chance: 0.25 },
]

// What an encounter's chance is multiplied by after it appeared in the run.
export const REPEAT_FACTOR = 0.2

// The chance encounter of every waystation up to `afterSegmentIndex`, a function of the run seed
// alone: a retry with the same seed meets the same ones, and so does a run that is replayed.
function chanceEncounters(runSeed: string, afterSegmentIndex: number): (EncounterKind | null)[] {
  const base = createRng(runSeed)
  const seen = new Set<EncounterKind>()
  const found: (EncounterKind | null)[] = []
  for (let index = 0; index <= afterSegmentIndex; index++) {
    let at = base.fork(`encounters/${index}`).next()
    let met: EncounterKind | null = null
    for (const { kind, chance } of CHANCE_ENCOUNTERS) {
      const share = seen.has(kind) ? chance * REPEAT_FACTOR : chance
      if (at < share) {
        met = kind
        break
      }
      at -= share
    }
    if (met) seen.add(met)
    found.push(met)
  }
  return found
}

// The encounters of the waystation after node boss `afterSegmentIndex`: the trader first, then at
// most one chance encounter.
export function rollEncounters(runSeed: string, afterSegmentIndex: number): EncounterKind[] {
  const met = chanceEncounters(runSeed, afterSegmentIndex)[afterSegmentIndex]
  return met ? ['trader', met] : ['trader']
}
