import { ARC } from '@nfdi4plants/arctrl'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildProvenanceIndex } from '../../../src/arc/provenance/buildIndex'
import { SCENE } from '../../../src/game/contracts/constants'
import type { GameEvent } from '../../../src/game/contracts/events'
import type { RunPlan } from '../../../src/game/contracts/run'
import { DEFAULT_BINDINGS } from '../../../src/game/model/input'
import { planRun } from '../../../src/game/model/run'
import { RunContext, type TutorialControl } from '../../../src/game/phaser/scenes/context'
import { crateJson } from '../../helpers/sampleCrate'

let plan: RunPlan

beforeAll(() => {
  const found = planRun(buildProvenanceIndex(ARC.fromROCrateJsonString(crateJson)), 'Talinum', 'tutorialContext')
  if (!found) throw new Error('No plan')
  plan = found
})

// The part of Phaser's scene manager the context uses: which scenes run, and what was asked of it.
function stubGame() {
  const running = new Set<string>()
  const calls: string[] = []
  const scene = {
    isProcessing: false,
    isActive: (key: string) => running.has(key),
    isPaused: () => false,
    isSleeping: () => false,
    start(key: string) {
      running.add(key)
      calls.push(`start ${key}`)
    },
    stop(key: string) {
      running.delete(key)
      calls.push(`stop ${key}`)
    },
    pause: () => {},
    run: () => {},
  }
  return { game: { scene }, running, calls }
}

let events: GameEvent[]
let context: RunContext
let stub: ReturnType<typeof stubGame>

beforeEach(() => {
  events = []
  stub = stubGame()
  context = new RunContext(DEFAULT_BINDINGS, (event) => events.push(event))
  // attach() builds the cursors, which need a canvas. The scene manager is all these tests use.
  Reflect.set(context, 'game', stub.game)
})

function tutorialHook(): TutorialControl {
  return {
    setExternalPause: vi.fn(),
    setBindings: vi.fn(),
    captureMouse: vi.fn(),
    refreshHud: vi.fn(),
    resume: vi.fn(),
    skipStep: vi.fn(),
    keepPracticing: vi.fn(),
    startRun: vi.fn(),
  }
}

describe('startTutorial', () => {
  it('starts the room and its HUD without a run behind them', () => {
    context.startTutorial(plan)

    expect(stub.running).toEqual(new Set([SCENE.tutorial, SCENE.tutorialHud]))
    expect(context.director).toBeNull()
    expect(context.tutorialPlan).toBe(plan)
    expect(events.map((event) => event.type)).toEqual(['tutorialStarted'])
  })

  it('takes a missing plan, so the finish card has no run to offer', () => {
    context.startTutorial(null)

    expect(context.tutorialPlan).toBeNull()
    expect(stub.running.has(SCENE.tutorial)).toBe(true)
  })

  it('stops the scenes of a run that was still going', () => {
    stub.running.add(SCENE.stretch)
    stub.running.add(SCENE.hud)

    context.startTutorial(plan)

    expect(stub.running.has(SCENE.stretch)).toBe(false)
    expect(stub.running.has(SCENE.hud)).toBe(false)
    expect(stub.running.has(SCENE.tutorial)).toBe(true)
  })
})

describe('leaving the room', () => {
  beforeEach(() => context.startTutorial(plan))

  it('stops the room scenes when a run starts in the same game', () => {
    context.startRun(plan)

    expect(stub.running.has(SCENE.tutorial)).toBe(false)
    expect(stub.running.has(SCENE.tutorialHud)).toBe(false)
    expect(stub.running.has(SCENE.hud)).toBe(true)
    expect(context.director).not.toBeNull()
    expect(events.map((event) => event.type)).toContain('runStarted')
  })

  it('stops the room scenes and asks for the menu on quit', () => {
    context.quitToMenu()

    expect(stub.running.size).toBe(0)
    expect(events.at(-1)).toEqual({ type: 'menuRequested', choice: 'menu' })
  })
})

describe('what reaches the room', () => {
  it('forwards the external pause and the bindings', () => {
    const hook = tutorialHook()
    context.tutorial = hook

    context.setExternalPause(true)
    context.setBindings({ ...DEFAULT_BINDINGS, left: [{ device: 'key', code: 'KeyJ' }] })

    expect(hook.setExternalPause).toHaveBeenCalledWith(true)
    expect(hook.setBindings).toHaveBeenCalledWith(expect.objectContaining({ left: [{ device: 'key', code: 'KeyJ' }] }))
    expect(context.bindingsVersion).toBe(1)
  })

  it('does nothing for the room when there is none', () => {
    expect(() => {
      context.setExternalPause(true)
      context.setBindings(DEFAULT_BINDINGS)
    }).not.toThrow()
  })
})
