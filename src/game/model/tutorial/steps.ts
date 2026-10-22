import { TILE } from '../../contracts/constants'
import type { Action, Bindings } from '../../contracts/input'
import type { AttackVariant } from '../../contracts/player'
import type { MechanicId, PlayerBuild, WeaponSlot } from '../../contracts/progression'
import { bindingLabel } from '../input'

// What the Training room reports about the player. The scene turns player and combat events into
// these, so the steps themselves stay pure.
export type TutorialFact =
  // Horizontal travel in world units while left or right was held. The scene reuses one object.
  | { kind: 'walked'; distance: number }
  // The jump that just ended peaked this many units above the takeoff point.
  | { kind: 'landed'; rise: number }
  | { kind: 'droppedThrough' }
  | { kind: 'dashed' }
  // The angry dummy's swing reached the player while the dash made the player untouchable.
  | { kind: 'dodged' }
  // A hit on a training dummy. `away` is true when the player held left or right away from it.
  | { kind: 'hit'; slot: WeaponSlot; variant: AttackVariant; comboIndex: number; away: boolean }
  | { kind: 'attackStarted'; slot: WeaponSlot; variant: AttackVariant }
  // A jump or dash cut an attack short.
  | { kind: 'cancelled' }
  | { kind: 'paused' }
  | { kind: 'enteredPortal' }

export type StepId = 'walk' | 'jump' | 'drop' | 'dash' | 'dodge' | 'attack' | 'combo' | 'heavy' | 'variants' | 'cancel' | 'pause' | 'leave'

export const WALK_DISTANCE = 4 * TILE
// A hop stays under this peak, a high jump goes over the other.
export const HOP_MAX_RISE = 1.75 * TILE
export const HIGH_MIN_RISE = 3 * TILE
// Smaller rises are a step off a ledge, not a jump.
const MIN_RISE = 6
const ATTACK_HITS = 2

// Where a prompt shows an action, as a function of its key label.
export type KeyLabel = (action: Action) => string

// What a step may remember between facts.
export interface StepProgress {
  distance: number
  hits: number
}

export interface TutorialStep {
  id: StepId
  title: string
  // One line per tick when the step has several, else one line.
  lines(key: KeyLabel): string[]
  ticks: number
  // The step is left out for a build without this mechanic.
  requires?: MechanicId
  // The tick this fact fills, or -1 for none. `progress` is the step's own memory.
  tick(fact: TutorialFact, progress: StepProgress): number
}

const NONE = -1

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'walk',
    title: 'Walk',
    ticks: 1,
    lines: (k) => [`Move with ${k('left')} and ${k('right')}`],
    tick: (fact, progress) => {
      if (fact.kind !== 'walked') return NONE
      progress.distance += fact.distance
      return progress.distance >= WALK_DISTANCE ? 0 : NONE
    },
  },
  {
    id: 'jump',
    title: 'Jump',
    ticks: 2,
    lines: (k) => [`Tap ${k('jump')} to hop`, `Hold ${k('jump')} to jump high`],
    tick: (fact) => {
      if (fact.kind !== 'landed' || fact.rise < MIN_RISE) return NONE
      if (fact.rise < HOP_MAX_RISE) return 0
      return fact.rise > HIGH_MIN_RISE ? 1 : NONE
    },
  },
  {
    id: 'drop',
    title: 'Drop down',
    ticks: 1,
    lines: (k) => [`Stand on the plank, then ${k('down')} + ${k('jump')}`],
    tick: (fact) => (fact.kind === 'droppedThrough' ? 0 : NONE),
  },
  {
    id: 'dash',
    title: 'Dash',
    ticks: 1,
    lines: (k) => [`${k('dash')} dashes the way you move`],
    tick: (fact) => (fact.kind === 'dashed' ? 0 : NONE),
  },
  {
    id: 'dodge',
    title: 'Dodge',
    ticks: 1,
    lines: (k) => [`Dash through the swing with ${k('dash')}. You cannot be hit while dashing.`],
    tick: (fact) => (fact.kind === 'dodged' ? 0 : NONE),
  },
  {
    id: 'attack',
    title: 'Attack',
    ticks: 2,
    lines: (k) => [`${k('light')} swings toward your cursor. Hit the dummy twice.`, 'Walk away from the dummy and swing at it anyway.'],
    tick: (fact, progress) => {
      if (fact.kind !== 'hit' || fact.slot !== 'light') return NONE
      if (fact.away) return 1
      progress.hits++
      return progress.hits === ATTACK_HITS ? 0 : NONE
    },
  },
  {
    id: 'combo',
    title: 'Combo',
    ticks: 1,
    lines: (k) => [`Press ${k('light')} 3 times in a row`],
    tick: (fact) => (fact.kind === 'hit' && fact.slot === 'light' && fact.comboIndex === 2 ? 0 : NONE),
  },
  {
    id: 'heavy',
    title: 'Heavy attack',
    ticks: 1,
    lines: (k) => [`${k('heavy')}: slow, but hits hard`],
    tick: (fact) => (fact.kind === 'hit' && fact.slot === 'heavy' && fact.variant === 'ground' ? 0 : NONE),
  },
  {
    id: 'variants',
    title: 'Attack variants',
    ticks: 3,
    lines: (k) => [`${k('up')} + attack hits overhead`, `${k('heavy')} in the air slams down`, 'Attack while dashing'],
    tick: (fact) => {
      if (fact.kind !== 'attackStarted') return NONE
      return fact.variant === 'up' ? 0 : fact.variant === 'air' ? 1 : fact.variant === 'dash' ? 2 : NONE
    },
  },
  {
    id: 'cancel',
    title: 'Cancel',
    ticks: 1,
    lines: (k) => [`${k('jump')} or ${k('dash')} cuts an attack short`],
    tick: (fact) => (fact.kind === 'cancelled' ? 0 : NONE),
  },
  {
    id: 'pause',
    title: 'Pause',
    ticks: 1,
    lines: (k) => [`${k('pause')} pauses. Settings changes your keys.`],
    tick: (fact) => (fact.kind === 'paused' ? 0 : NONE),
  },
  {
    id: 'leave',
    title: 'Leave',
    ticks: 1,
    lines: (k) => [`Press ${k('up')} at the portal`],
    tick: (fact) => (fact.kind === 'enteredPortal' ? 0 : NONE),
  },
]

export const UNBOUND_LABEL = 'unbound, set it in Settings'

// The label of an action's first binding, so a prompt follows a rebind.
export function keyLabel(bindings: Bindings): KeyLabel {
  return (action) => {
    const binding = bindings[action][0]
    return binding ? bindingLabel(binding) : UNBOUND_LABEL
  }
}

export function promptFor(step: TutorialStep, bindings: Bindings): string[] {
  return step.lines(keyLabel(bindings))
}

export interface Tutorial {
  readonly steps: readonly TutorialStep[]
  // The step being shown, null once the last one is left.
  current(): TutorialStep | null
  // Position of the current step among the steps of this build.
  index(): number
  // Which ticks of the current step are filled. The same array every call.
  ticks(): readonly boolean[]
  // All ticks are filled: the card flashes before the scene calls next().
  complete(): boolean
  // True when the fact filled a tick.
  report(fact: TutorialFact): boolean
  next(): void
  // Gives the current step up and moves on, without the flash.
  skip(): void
  done(): boolean
}

export function createTutorial(build: Pick<PlayerBuild, 'mechanics'>, all: readonly TutorialStep[] = TUTORIAL_STEPS): Tutorial {
  const steps = all.filter((step) => !step.requires || build.mechanics.includes(step.requires))
  let at = 0
  const filled: boolean[] = []
  const progress: StepProgress = { distance: 0, hits: 0 }

  const enter = () => {
    filled.length = steps[at]?.ticks ?? 0
    filled.fill(false)
    progress.distance = 0
    progress.hits = 0
  }
  enter()

  const complete = () => filled.length > 0 && filled.every(Boolean)
  const advance = () => {
    if (at >= steps.length) return
    at++
    enter()
  }

  return {
    steps,
    current: () => steps[at] ?? null,
    index: () => at,
    ticks: () => filled,
    complete,
    report(fact) {
      const step = steps[at]
      if (!step || complete()) return false
      const tick = step.tick(fact, progress)
      if (tick < 0 || filled[tick]) return false
      filled[tick] = true
      return true
    },
    next: advance,
    skip: advance,
    done: () => at >= steps.length,
  }
}
