import { ARC } from '@nfdi4plants/arctrl'
import { fireEvent, screen, waitFor, within } from '@testing-library/dom'
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { buildProvenanceIndex } from '../../src/arc/provenance/buildIndex'
import type { ArcadeProvenance } from '../../src/arc/provenance/input'
import type { Annotation } from '../../src/arc/provenance/types'
import type { GameEvent, GameHandle } from '../../src/game/contracts/events'
import type { RunPlan } from '../../src/game/contracts/run'
import type * as InputModule from '../../src/game/model/input'
import { BINDINGS_STORAGE_KEY, DEFAULT_BINDINGS, findConflicts, loadBindings, saveBindings } from '../../src/game/model/input'
import { planRun } from '../../src/game/model/run'
import { createGame } from '../../src/game/phaser/createGame'
import { mountArcade, type ArcadeHandle, type ArcadeOptions } from '../../src/index'
import { crateJson } from '../helpers/sampleCrate'

vi.mock('../../src/game/phaser/createGame', () => ({ createGame: vi.fn() }))
vi.mock('../../src/game/model/run', () => ({ planRun: vi.fn() }))
vi.mock('../../src/game/model/input', async (importOriginal) => ({
  ...(await importOriginal<typeof InputModule>()),
  loadBindings: vi.fn(),
  saveBindings: vi.fn(),
  findConflicts: vi.fn(),
  bindingLabel: (binding: { device: string; code?: string; button?: number }) =>
    binding.device === 'key' ? binding.code : `Mouse ${binding.button}`,
}))

const annotation = (name: string): Annotation => ({ name, value: '1', unit: null, accession: null, category: 'parameter' })

const plan: RunPlan = {
  seed: 'plan-seed',
  arcTitle: 'Talinum',
  nodes: [
    { id: 'DB_097', kind: 'source', annotations: [] },
    { id: 'DB_097_extract', kind: 'sample', annotations: [] },
    { id: 'DB_097_run.raw', kind: 'data', annotations: [] },
  ],
  segments: [
    {
      index: 0,
      fromNodeId: 'DB_097',
      toNodeId: 'DB_097_extract',
      processKey: 'studies/s/Extraction',
      processName: 'Extraction',
      datasetId: 'studies/s',
      datasetKind: 'study',
      annotations: [annotation('a'), annotation('b'), annotation('c')],
      quality: 3 / 8,
      telegraphMs: 388,
    },
    {
      index: 1,
      fromNodeId: 'DB_097_extract',
      toNodeId: 'DB_097_run.raw',
      processKey: 'assays/a/Measurement',
      processName: 'Measurement',
      datasetId: 'assays/a',
      datasetKind: 'assay',
      annotations: [annotation('d')],
      quality: 1 / 8,
      telegraphMs: 183,
    },
  ],
}

let provenance: ArcadeProvenance
let handle: GameHandle
let visibilityCallbacks: IntersectionObserverCallback[]
let host: HTMLElement
let arcade: ArcadeHandle | null

beforeAll(() => {
  provenance = buildProvenanceIndex(ARC.fromROCrateJsonString(crateJson))
})

function stubPointer(fine: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: fine && query === '(any-pointer: fine)',
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
  }))
}

// jsdom has no IntersectionObserver. The stub lets a test report that the arcade scrolled out of view.
function scrollIntoView(visible: boolean) {
  visibilityCallbacks.at(-1)?.([{ isIntersecting: visible } as IntersectionObserverEntry], {} as IntersectionObserver)
}

function mount(options: Partial<ArcadeOptions> = {}) {
  arcade = mountArcade(host, { title: 'Talinum', provenance, ...options })
  return arcade
}

beforeEach(() => {
  stubPointer(true)
  visibilityCallbacks = []
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        visibilityCallbacks.push(callback)
      }
      observe() {}
      disconnect() {}
    },
  )
  handle = { send: vi.fn(), on: vi.fn(() => () => {}), resize: vi.fn(), focus: vi.fn(), destroy: vi.fn() }
  vi.mocked(createGame).mockReturnValue(handle)
  vi.mocked(planRun).mockReturnValue(plan)
  vi.mocked(loadBindings).mockReturnValue(DEFAULT_BINDINGS)
  vi.mocked(findConflicts).mockReturnValue([])
  host = document.createElement('div')
  document.body.append(host)
  arcade = null
})

afterEach(() => {
  arcade?.destroy()
  host.remove()
  Reflect.deleteProperty(document, 'fullscreenEnabled')
  Reflect.deleteProperty(document, 'fullscreenElement')
  Reflect.deleteProperty(document, 'exitFullscreen')
  Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen')
})

const click = (element: Element) => fireEvent.click(element)
const lastPause = () => vi.mocked(handle.send).mock.calls.filter(([command]) => command.type === 'pause').at(-1)?.[0]

async function startRun(options: Partial<ArcadeOptions> = {}) {
  mount(options)
  click(await screen.findByRole('button', { name: 'Start run' }))
  await screen.findByRole('button', { name: 'Click to play' })
}

it('shows the planned path on the start screen', async () => {
  mount()

  expect(await screen.findByRole('button', { name: 'Start run' })).toBeTruthy()
  expect(planRun).toHaveBeenCalledWith(expect.objectContaining({ nodeById: expect.any(Map) }), 'Talinum', expect.stringMatching(/^[0-9a-z]+$/))
  const facts = screen.getByText('Steps').closest('dl')
  expect(facts?.textContent).toContain('DB_097 → DB_097_run.raw')
  expect(facts?.textContent).toContain('Steps2Annotations4Seedplan-seed')
  const steps = within(screen.getByRole('region', { name: 'Annotations per step' })).getAllByRole('listitem')
  expect(steps.map((step) => step.textContent)).toEqual(['Extraction3', 'Measurement1'])
})

it('creates the game and starts the run when Start run is pressed', async () => {
  mount()
  click(await screen.findByRole('button', { name: 'Start run' }))

  click(await screen.findByRole('button', { name: 'Click to play' }))
  expect(createGame).toHaveBeenCalledTimes(1)
  expect(createGame).toHaveBeenCalledWith(expect.any(HTMLElement), { bindings: DEFAULT_BINDINGS })
  expect(handle.send).toHaveBeenCalledWith({ type: 'start', plan })
  expect(handle.focus).toHaveBeenCalled()
})

it('starts a run without the start screen with autoStart and plans the given seed', async () => {
  mount({ autoStart: true, seed: 'fixed' })

  await screen.findByRole('button', { name: 'Click to play' })
  expect(screen.queryByRole('button', { name: 'Start run' })).toBeNull()
  expect(planRun).toHaveBeenCalledWith(expect.anything(), 'Talinum', 'fixed')
})

it('pauses the game while the canvas has no focus, the arcade is scrolled out of view or the tab is hidden', async () => {
  await startRun()
  expect(lastPause()).toEqual({ type: 'pause', paused: true })

  const game = screen.getByRole('group', { name: 'ARCade game' })
  fireEvent.focusIn(game)
  expect(lastPause()).toEqual({ type: 'pause', paused: false })
  expect(screen.queryByRole('button', { name: 'Click to play' })).toBeNull()

  scrollIntoView(false)
  expect(lastPause()).toEqual({ type: 'pause', paused: true })
  scrollIntoView(true)
  expect(lastPause()).toEqual({ type: 'pause', paused: false })

  const state = vi.spyOn(document, 'visibilityState', 'get')
  state.mockReturnValue('hidden')
  document.dispatchEvent(new Event('visibilitychange'))
  expect(lastPause()).toEqual({ type: 'pause', paused: true })
  state.mockReturnValue('visible')
  document.dispatchEvent(new Event('visibilitychange'))
  expect(lastPause()).toEqual({ type: 'pause', paused: false })

  fireEvent.focusOut(game)
  expect(lastPause()).toEqual({ type: 'pause', paused: true })
  expect(screen.getByRole('button', { name: 'Click to play' })).toBeTruthy()
})

it('rebinds an action to the next key and warns about the conflict', async () => {
  vi.mocked(findConflicts).mockImplementation((bindings) => {
    const [first] = bindings.left
    return first?.device === 'key' && first.code === 'KeyS' ? [{ binding: first, actions: ['left', 'down'] }] : []
  })
  mount()
  click(await screen.findByRole('button', { name: 'Settings' }))

  click(screen.getByRole('button', { name: 'Move right binding 1: KeyD' }))
  fireEvent.keyDown(document.body, { code: 'Escape', key: 'Escape' })
  expect(saveBindings).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Move right binding 1: KeyD' })).toBeTruthy()

  click(screen.getByRole('button', { name: 'Move left binding 1: KeyA' }))
  fireEvent.keyDown(document.body, { code: 'KeyS', key: 's' })
  fireEvent.keyUp(document.body, { code: 'KeyS', key: 's' })

  expect(saveBindings).toHaveBeenCalledWith({ ...DEFAULT_BINDINGS, left: [{ device: 'key', code: 'KeyS' }] }, BINDINGS_STORAGE_KEY)
  expect(await screen.findByRole('button', { name: 'Move left binding 1: KeyS' })).toBeTruthy()
  const rows = screen.getAllByRole('listitem')
  expect(rows.find((row) => within(row).queryByText('Move left'))?.textContent).toContain('is also bound to Down')
  expect(rows.find((row) => within(row).queryByText('Down'))?.textContent).toContain('is also bound to Move left')
})

it('binds a mouse button and resets to the defaults', async () => {
  mount()
  click(await screen.findByRole('button', { name: 'Settings' }))

  click(screen.getByRole('button', { name: 'Jump binding 1: Space' }))
  fireEvent.mouseDown(document.body, { button: 1 })
  fireEvent.mouseUp(document.body, { button: 1 })
  expect(await screen.findByRole('button', { name: 'Jump binding 1: Mouse 1' })).toBeTruthy()

  click(screen.getByRole('button', { name: 'Reset to defaults' }))
  expect(saveBindings).toHaveBeenLastCalledWith(DEFAULT_BINDINGS, BINDINGS_STORAGE_KEY)
  expect(screen.getByRole('button', { name: 'Jump binding 1: Space' })).toBeTruthy()
})

it('keeps the bindings under the given storage key, or only in memory with null', async () => {
  mount({ bindingsStorageKey: 'my.bindings' })
  expect(loadBindings).toHaveBeenCalledWith('my.bindings')
  click(await screen.findByRole('button', { name: 'Settings' }))
  click(screen.getByRole('button', { name: 'Reset to defaults' }))
  expect(saveBindings).toHaveBeenCalledWith(DEFAULT_BINDINGS, 'my.bindings')
  arcade?.destroy()

  vi.mocked(saveBindings).mockClear()
  mount({ bindingsStorageKey: null })
  click(await screen.findByRole('button', { name: 'Settings' }))
  click(screen.getByRole('button', { name: 'Reset to defaults' }))
  expect(saveBindings).not.toHaveBeenCalled()
})

it('asks for a keyboard and a mouse on a touch-only device', async () => {
  stubPointer(false)
  mount()

  expect(await screen.findByText('ARCade needs a keyboard and a mouse.')).toBeTruthy()
  expect(screen.getByText('Extraction')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Start run' })).toBeNull()
})

it('explains that an ARC without provenance has no path', async () => {
  vi.mocked(planRun).mockReturnValue(null)
  mount()

  expect(await screen.findByText('This ARC has no provenance yet. Annotate a study or assay table to open the path for ARCade.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Start run' })).toBeNull()
})

it('shows a message and a way back when the game cannot be loaded', async () => {
  vi.mocked(createGame).mockImplementation(() => {
    throw new Error('no WebGL')
  })
  mount()
  click(await screen.findByRole('button', { name: 'Start run' }))

  await waitFor(() => expect(screen.getByText('The game could not be loaded')).toBeTruthy())
  click(screen.getByRole('button', { name: 'Back' }))
  expect(await screen.findByRole('button', { name: 'Start run' })).toBeTruthy()
})

it('destroys the game and everything it added when the arcade is destroyed, also twice', async () => {
  await startRun()
  expect(handle.destroy).not.toHaveBeenCalled()
  expect(document.querySelectorAll('style[data-arcade]')).toHaveLength(1)

  arcade?.destroy()
  arcade?.destroy()

  expect(handle.destroy).toHaveBeenCalledTimes(1)
  expect(host.children).toHaveLength(0)
  expect(document.querySelectorAll('style[data-arcade]')).toHaveLength(0)
})

it('shares one stylesheet between arcades and removes it with the last one', () => {
  const second = document.createElement('div')
  document.body.append(second)
  const other = mountArcade(second, { title: 'Other', provenance })
  mount()
  expect(document.querySelectorAll('style[data-arcade]')).toHaveLength(1)

  other.destroy()
  expect(document.querySelectorAll('style[data-arcade]')).toHaveLength(1)
  arcade?.destroy()
  expect(document.querySelectorAll('style[data-arcade]')).toHaveLength(0)
  second.remove()
})

// The death and victory screens live in Phaser, so the game reports the choice through its listener.
function requestMenu(choice: 'retry' | 'newPath' | 'menu') {
  const listener = vi.mocked(handle.on).mock.calls.at(-1)?.[0]
  if (!listener) throw new Error('The arcade registered no game listener')
  listener({ type: 'menuRequested', choice })
}

const startCommands = () => vi.mocked(handle.send).mock.calls.filter(([command]) => command.type === 'start')

it('starts the same plan again on Retry without recreating the game', async () => {
  await startRun()
  expect(startCommands()).toHaveLength(1)

  requestMenu('retry')

  expect(startCommands()).toHaveLength(2)
  expect(startCommands().at(-1)?.[0]).toEqual({ type: 'start', plan })
  expect(handle.destroy).not.toHaveBeenCalled()
  expect(createGame).toHaveBeenCalledTimes(1)
})

it('destroys the game and plans another path on New path', async () => {
  await startRun({ seed: 'first' })

  requestMenu('newPath')

  expect(await screen.findByRole('button', { name: 'Start run' })).toBeTruthy()
  expect(handle.destroy).toHaveBeenCalledTimes(1)
  const seeds = vi.mocked(planRun).mock.calls.map(([, , seed]) => seed)
  expect(seeds[0]).toBe('first')
  expect(seeds.at(-1)).not.toBe('first')
})

it('destroys the game and shows the start screen on Menu', async () => {
  await startRun()

  requestMenu('menu')

  expect(await screen.findByRole('button', { name: 'Start run' })).toBeTruthy()
  expect(handle.destroy).toHaveBeenCalledTimes(1)
})

it('forwards the game events to onEvent', async () => {
  const onEvent = vi.fn()
  await startRun({ onEvent })
  const event: GameEvent = { type: 'levelUp', level: 2 }

  vi.mocked(handle.on).mock.calls.at(-1)?.[0](event)

  expect(onEvent).toHaveBeenCalledWith(event)
})

it('goes back to the start screen with a new plan when the data is updated', async () => {
  const running = mount()
  click(await screen.findByRole('button', { name: 'Start run' }))
  await screen.findByRole('button', { name: 'Click to play' })
  vi.mocked(planRun).mockReturnValue({ ...plan, seed: 'next-seed' })

  running.update({ title: 'Other ARC', seed: 'next-seed' })

  expect(await screen.findByRole('button', { name: 'Start run' })).toBeTruthy()
  expect(handle.destroy).toHaveBeenCalledTimes(1)
  expect(planRun).toHaveBeenLastCalledWith(expect.anything(), 'Other ARC', 'next-seed')
  expect(screen.getByText('Quest: Other ARC')).toBeTruthy()
  expect(screen.getByText('next-seed')).toBeTruthy()
})

it('shows a compact title card in a small box', async () => {
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(280)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(200)
  mount()

  expect(await screen.findByText('2 steps · 4 monsters · quest: Talinum')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Start run' })).toBeTruthy()
  expect(screen.queryByRole('region', { name: 'Annotations per step' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull()
})

it('hands the measured box to the game', async () => {
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600)
  await startRun()

  expect(handle.resize).toHaveBeenCalledWith(800, 600)
})

// jsdom has no fullscreen. The stubs make the document and the element look like a browser with it.
function stubFullscreen(enabled: boolean) {
  let current: Element | null = null
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => enabled })
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => current })
  const request = vi.fn(() => {
    current = document.querySelector('.arcade-root')
    document.dispatchEvent(new Event('fullscreenchange'))
    return Promise.resolve()
  })
  const exit = vi.fn(() => {
    current = null
    document.dispatchEvent(new Event('fullscreenchange'))
    return Promise.resolve()
  })
  Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: request })
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit })
  return { request, exit }
}

it('has no fullscreen button where the browser has no fullscreen or the host turns it off', () => {
  mount()
  expect(screen.queryByRole('button', { name: 'Enter fullscreen' })).toBeNull()
  arcade?.destroy()

  stubFullscreen(true)
  mount({ fullscreen: false })
  expect(screen.queryByRole('button', { name: 'Enter fullscreen' })).toBeNull()
})

it('enters and leaves fullscreen with the button on the arcade root', async () => {
  const { request, exit } = stubFullscreen(true)
  mount()

  click(screen.getByRole('button', { name: 'Enter fullscreen' }))
  expect(request).toHaveBeenCalledTimes(1)
  expect(document.fullscreenElement).toBe(host.querySelector('.arcade-root'))
  click(await screen.findByRole('button', { name: 'Exit fullscreen' }))
  expect(exit).toHaveBeenCalledTimes(1)
  expect(await screen.findByRole('button', { name: 'Enter fullscreen' })).toBeTruthy()
})

it('opens the pause when fullscreen is left during a run', async () => {
  stubFullscreen(true)
  await startRun()
  fireEvent.focusIn(screen.getByRole('group', { name: 'ARCade game' }))
  expect(lastPause()).toEqual({ type: 'pause', paused: false })

  click(screen.getByRole('button', { name: 'Enter fullscreen' }))
  click(screen.getByRole('button', { name: 'Exit fullscreen' }))

  expect(lastPause()).toEqual({ type: 'pause', paused: true })
  expect(screen.getByRole('button', { name: 'Click to play' })).toBeTruthy()
})
