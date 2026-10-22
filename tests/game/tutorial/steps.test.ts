import { describe, expect, it } from 'vitest'
import { TILE } from '../../../src/game/contracts/constants'
import type { Bindings } from '../../../src/game/contracts/input'
import { DEFAULT_BINDINGS } from '../../../src/game/model/input'
import { createBuild } from '../../../src/game/model/progression/build'
import {
  createTutorial,
  HIGH_MIN_RISE,
  HOP_MAX_RISE,
  promptFor,
  TUTORIAL_STEPS,
  UNBOUND_LABEL,
  WALK_DISTANCE,
  type TutorialFact,
  type TutorialStep,
} from '../../../src/game/model/tutorial/steps'

const hit = (over: Partial<Extract<TutorialFact, { kind: 'hit' }>> = {}): TutorialFact => ({
  kind: 'hit',
  slot: 'light',
  variant: 'ground',
  comboIndex: 0,
  away: false,
  ...over,
})

// A tutorial that has been taken to the step with this id by skipping.
function at(id: string) {
  const tutorial = createTutorial(createBuild())
  while (tutorial.current()?.id !== id) tutorial.skip()
  return tutorial
}

describe('walk', () => {
  it('fills after four tiles of travel, over several reports', () => {
    const tutorial = at('walk')
    expect(tutorial.report({ kind: 'walked', distance: 2 * TILE })).toBe(false)
    expect(tutorial.complete()).toBe(false)
    expect(tutorial.report({ kind: 'walked', distance: WALK_DISTANCE - 2 * TILE })).toBe(true)
    expect(tutorial.complete()).toBe(true)
  })

  it('ignores what is not walking', () => {
    const tutorial = at('walk')
    for (const kind of ['dashed', 'dodged', 'paused'] as const) tutorial.report({ kind })
    expect(tutorial.ticks()).toEqual([false])
  })
})

describe('jump', () => {
  it('needs a hop and a high jump, in any order', () => {
    const tutorial = at('jump')
    expect(tutorial.report({ kind: 'landed', rise: HIGH_MIN_RISE + 6 })).toBe(true)
    expect(tutorial.ticks()).toEqual([false, true])
    expect(tutorial.report({ kind: 'landed', rise: HOP_MAX_RISE - 6 })).toBe(true)
    expect(tutorial.complete()).toBe(true)
  })

  it('counts a normal key tap as a hop', () => {
    const tutorial = at('jump')
    expect(tutorial.report({ kind: 'landed', rise: 50 })).toBe(true)
    expect(tutorial.ticks()).toEqual([true, false])
  })

  it('counts neither a step off a ledge nor a jump between a hop and a high jump', () => {
    const tutorial = at('jump')
    expect(tutorial.report({ kind: 'landed', rise: 2 })).toBe(false)
    expect(tutorial.report({ kind: 'landed', rise: (HOP_MAX_RISE + HIGH_MIN_RISE) / 2 })).toBe(false)
    expect(tutorial.ticks()).toEqual([false, false])
  })
})

describe('single-fact steps', () => {
  const facts = [{ kind: 'dashed' }, { kind: 'dodged' }, { kind: 'paused' }, { kind: 'cancelled' }, { kind: 'enteredPortal' }, { kind: 'droppedThrough' }] as const

  it.each([
    ['drop', { kind: 'droppedThrough' }],
    ['dash', { kind: 'dashed' }],
    ['dodge', { kind: 'dodged' }],
    ['cancel', { kind: 'cancelled' }],
    ['pause', { kind: 'paused' }],
    ['leave', { kind: 'enteredPortal' }],
  ] as const)('%s fills on its own fact and on nothing else', (id, fact) => {
    const tutorial = at(id)
    for (const other of facts) if (other.kind !== fact.kind) expect(tutorial.report(other)).toBe(false)
    expect(tutorial.report(fact)).toBe(true)
    expect(tutorial.complete()).toBe(true)
  })
})

describe('attack', () => {
  it('needs two hits and one hit while moving away', () => {
    const tutorial = at('attack')
    expect(tutorial.report(hit())).toBe(false)
    expect(tutorial.report(hit())).toBe(true)
    expect(tutorial.ticks()).toEqual([true, false])
    expect(tutorial.report(hit({ away: true }))).toBe(true)
    expect(tutorial.complete()).toBe(true)
  })

  it('does not take heavy hits, or a hit while walking toward the dummy, for the away tick', () => {
    const tutorial = at('attack')
    expect(tutorial.report(hit({ slot: 'heavy' }))).toBe(false)
    expect(tutorial.report(hit({ slot: 'heavy', away: true }))).toBe(false)
    expect(tutorial.report(hit({ away: false }))).toBe(false)
    expect(tutorial.ticks()).toEqual([false, false])
  })
})

describe('combo', () => {
  it('needs the third light move to hit', () => {
    const tutorial = at('combo')
    expect(tutorial.report(hit({ comboIndex: 0 }))).toBe(false)
    expect(tutorial.report(hit({ comboIndex: 1 }))).toBe(false)
    expect(tutorial.report(hit({ comboIndex: 2, slot: 'heavy' }))).toBe(false)
    expect(tutorial.report(hit({ comboIndex: 2 }))).toBe(true)
  })
})

describe('heavy', () => {
  it('needs a heavy hit from the ground', () => {
    const tutorial = at('heavy')
    expect(tutorial.report(hit())).toBe(false)
    expect(tutorial.report(hit({ slot: 'heavy', variant: 'air' }))).toBe(false)
    expect(tutorial.report(hit({ slot: 'heavy' }))).toBe(true)
  })
})

describe('attack variants', () => {
  it('fills one tick per variant, in any order, and only on a started attack', () => {
    const tutorial = at('variants')
    expect(tutorial.report(hit({ variant: 'up' }))).toBe(false)
    expect(tutorial.report({ kind: 'attackStarted', slot: 'light', variant: 'ground' })).toBe(false)
    expect(tutorial.report({ kind: 'attackStarted', slot: 'light', variant: 'dash' })).toBe(true)
    expect(tutorial.report({ kind: 'attackStarted', slot: 'heavy', variant: 'dash' })).toBe(false)
    expect(tutorial.report({ kind: 'attackStarted', slot: 'heavy', variant: 'air' })).toBe(true)
    expect(tutorial.complete()).toBe(false)
    expect(tutorial.report({ kind: 'attackStarted', slot: 'light', variant: 'up' })).toBe(true)
    expect(tutorial.complete()).toBe(true)
  })
})

describe('progress', () => {
  it('stays on a finished step until next() and ignores facts meanwhile', () => {
    const tutorial = at('dash')
    tutorial.report({ kind: 'dashed' })
    expect(tutorial.current()?.id).toBe('dash')
    expect(tutorial.report({ kind: 'dashed' })).toBe(false)

    tutorial.next()

    expect(tutorial.current()?.id).toBe('dodge')
    expect(tutorial.ticks()).toEqual([false])
  })

  it('starts the next step with fresh counters', () => {
    const tutorial = at('walk')
    tutorial.report({ kind: 'walked', distance: WALK_DISTANCE - 1 })
    tutorial.skip()
    expect(tutorial.current()?.id).toBe('jump')
    expect(tutorial.ticks()).toEqual([false, false])
  })

  it('skips ahead and ends after the last step', () => {
    const tutorial = createTutorial(createBuild())
    expect(tutorial.steps).toHaveLength(12)
    for (let i = 0; i < 12; i++) {
      expect(tutorial.done()).toBe(false)
      tutorial.skip()
    }
    expect(tutorial.done()).toBe(true)
    expect(tutorial.current()).toBeNull()
    expect(tutorial.report({ kind: 'dashed' })).toBe(false)
    tutorial.skip()
    expect(tutorial.index()).toBe(12)
  })

  it('leaves out steps whose mechanic the build lacks', () => {
    const extra: TutorialStep = {
      id: 'jump',
      title: 'Double jump',
      ticks: 1,
      requires: 'doubleJump',
      lines: () => ['again'],
      tick: () => -1,
    }
    const steps = [...TUTORIAL_STEPS, extra]

    expect(createTutorial(createBuild(), steps).steps).toHaveLength(12)
    expect(createTutorial({ mechanics: ['doubleJump'] }, steps).steps).toHaveLength(13)
  })
})

describe('prompts', () => {
  const rebound: Bindings = { ...DEFAULT_BINDINGS, left: [{ device: 'key', code: 'KeyJ' }], dash: [{ device: 'mouse', button: 1 }], jump: [] }
  const step = (id: string) => TUTORIAL_STEPS.find((candidate) => candidate.id === id) as TutorialStep

  it('shows the current key of each action', () => {
    expect(promptFor(step('walk'), DEFAULT_BINDINGS).join(' ')).toContain('A and D')
    const walk = promptFor(step('walk'), rebound).join(' ')
    expect(walk).toContain('J and D')
    expect(promptFor(step('dash'), rebound).join(' ')).toContain('Middle mouse')
  })

  it('says where to set a key that is unbound', () => {
    expect(promptFor(step('jump'), rebound).join(' ')).toContain(UNBOUND_LABEL)
  })

  it('gives one line, or one line for each tick', () => {
    for (const candidate of TUTORIAL_STEPS) {
      const lines = promptFor(candidate, DEFAULT_BINDINGS)
      expect(lines.length === 1 || lines.length === candidate.ticks).toBe(true)
    }
  })
})
