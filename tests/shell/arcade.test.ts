import { ARC } from '@nfdi4plants/arctrl'
import { fireEvent, screen, waitFor, within } from '@testing-library/dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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
import { renderChangelog } from '../../src/shell/markdown'
import { crateJson } from '../helpers/sampleCrate'

vi.mock('../../src/game/phaser/createGame', () => ({ createGame: vi.fn() }))
vi.mock('../../src/game/model/run', () => ({ planRun: vi.fn() }))
vi.mock('../../src/shell/changelogView', () => ({
  renderBundledChangelog: () =>
    renderChangelog(
      [
        '# Changelog',
        'Header text that stays out.',
        '**Types of changes**',
        '- ✨ `Added` for new features.',
        '## [Unreleased]',
        '## 0.2.0 - 2026-01-01',
        '### ✨ Added',
        '- Adds `code`, **bold** and [the site](https://example.com/a).',
        '- <img src=x onerror=alert(1)>',
        '- [script](javascript:alert(1)) stays text.',
        '### 🐛 Fixed',
        '- Fixes a thing.',
      ].join('\n'),
    ),
}))

declare const __ARCADE_VERSION__: string
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
  localStorage.clear()
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

it('keeps the browser menu closed over the start screen and the game', async () => {
  mount()
  const menuOpens = (target: Element, type = 'contextmenu') => target.dispatchEvent(new MouseEvent(type, { button: type === 'auxclick' ? 1 : 2, bubbles: true, cancelable: true }))
  expect(menuOpens(await screen.findByRole('button', { name: 'Start run' }))).toBe(false)

  click(screen.getByRole('button', { name: 'Start run' }))
  await screen.findByRole('button', { name: 'Click to play' })
  const game = screen.getByRole('group', { name: 'ARCade game' })
  // The canvas sits in the game group; any element there, overlays included, keeps the menu shut.
  expect(menuOpens(game)).toBe(false)
  expect(menuOpens(screen.getByRole('button', { name: 'Click to play' }))).toBe(false)
  expect(menuOpens(game, 'auxclick')).toBe(false)
  // Outside the arcade the page keeps its own menu.
  expect(menuOpens(document.body)).toBe(true)
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
  expect(screen.queryByRole('button', { name: 'New path' })).toBeNull()
})

it('puts a Settings gear in the compact card that opens the settings panel', async () => {
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(280)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(200)
  mount()

  const gear = await screen.findByRole('button', { name: 'Settings' })
  expect(gear.querySelector('svg')).toBeTruthy()
  click(gear)

  expect(screen.getByRole('heading', { name: 'Controls' })).toBeTruthy()
  click(screen.getByRole('button', { name: 'Back' }))
  expect(await screen.findByRole('button', { name: 'Start run' })).toBeTruthy()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Settings' }))
})

it('shows the package version on the start screen', async () => {
  mount()

  const label = await screen.findByRole('button', { name: /^Version / })
  expect(__ARCADE_VERSION__).toMatch(/^\d+\.\d+\.\d+/)
  expect(label.textContent).toBe(`v${__ARCADE_VERSION__}`)
})

it('opens the changelog from the version label, shows it as text and returns the focus on Escape', async () => {
  mount()
  const label = await screen.findByRole('button', { name: /^Version / })
  expect(document.querySelector('.arcade-screen-log')).toBeNull()

  click(label)

  const dialog = screen.getByRole('dialog', { name: 'Changelog' })
  expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Close' }))
  expect(await within(dialog).findByRole('heading', { name: '0.2.0 - 2026-01-01' })).toBeTruthy()
  expect(within(dialog).getByRole('heading', { name: '✨ Added' })).toBeTruthy()
  expect(within(dialog).getByRole('heading', { name: '🐛 Fixed' })).toBeTruthy()
  expect(within(dialog).queryByText('[Unreleased]')).toBeNull()
  expect(within(dialog).queryByText(/Header text|Types of changes/)).toBeNull()
  expect(within(dialog).getAllByRole('listitem')).toHaveLength(4)
  expect(dialog.querySelector('code')?.textContent).toBe('code')
  expect(dialog.querySelector('strong')?.textContent).toBe('bold')
  const links = dialog.querySelectorAll('a')
  expect(links).toHaveLength(1)
  expect(links[0].getAttribute('href')).toBe('https://example.com/a')
  expect(links[0].getAttribute('rel')).toContain('noopener')
  expect(links[0].getAttribute('target')).toBe('_blank')
  // Raw HTML in a bullet is text, and a script link keeps only its label.
  expect(dialog.querySelector('img')).toBeNull()
  expect(within(dialog).getByText('<img src=x onerror=alert(1)>')).toBeTruthy()
  expect(within(dialog).getByText('script stays text.', { exact: false })).toBeTruthy()

  fireEvent.keyDown(document.body, { key: 'Escape' })

  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(label)
})

it('closes the changelog with its Close button', async () => {
  mount()
  const label = await screen.findByRole('button', { name: /^Version / })
  click(label)

  click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }))

  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(label)
})

// The pause menu is drawn by Phaser. Its Settings button reports through the game listener.
function requestSettings() {
  const listener = vi.mocked(handle.on).mock.calls.at(-1)?.[0]
  if (!listener) throw new Error('The arcade registered no game listener')
  listener({ type: 'settingsRequested' })
}

it('opens the settings over the paused run, saves a rebinding and keeps the game paused on close', async () => {
  const onEvent = vi.fn()
  await startRun({ onEvent })
  expect(lastPause()).toEqual({ type: 'pause', paused: true })
  const sends = vi.mocked(handle.send).mock.calls.length

  requestSettings()

  expect(onEvent).toHaveBeenCalledWith({ type: 'settingsRequested' })
  const dialog = screen.getByRole('dialog', { name: 'Controls' })
  expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Close' }))
  click(within(dialog).getByRole('button', { name: 'Jump binding 1: Space' }))
  fireEvent.keyDown(document.body, { key: 'x', code: 'KeyX' })
  expect(saveBindings).toHaveBeenCalled()
  expect(vi.mocked(handle.send).mock.calls.slice(sends).map(([command]) => command.type)).toEqual(['setBindings'])
  fireEvent.keyUp(document.body, { code: 'KeyX' })
  await new Promise((resolve) => setTimeout(resolve))

  vi.mocked(handle.focus).mockClear()
  fireEvent.keyDown(document.body, { key: 'Escape' })

  expect(screen.queryByRole('dialog')).toBeNull()
  expect(handle.focus).toHaveBeenCalled()
  expect(lastPause()).toEqual({ type: 'pause', paused: true })
  expect(vi.mocked(handle.send).mock.calls.slice(sends).map(([command]) => command.type)).toEqual(['setBindings'])
})

it('cancels a rebinding with Escape without closing the settings over the run', async () => {
  await startRun()
  requestSettings()
  const dialog = screen.getByRole('dialog', { name: 'Controls' })

  click(within(dialog).getByRole('button', { name: 'Jump binding 1: Space' }))
  fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' })

  expect(screen.getByRole('dialog', { name: 'Controls' })).toBeTruthy()
  expect(saveBindings).not.toHaveBeenCalled()
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

it('never creates the game when it is destroyed right after Start run', async () => {
  mount()
  click(await screen.findByRole('button', { name: 'Start run' }))
  arcade?.destroy()
  await new Promise((resolve) => setTimeout(resolve, 20))

  expect(createGame).not.toHaveBeenCalled()
  expect(host.children).toHaveLength(0)
})

it('drops the pending game when the data is updated while the game module loads', async () => {
  const running = mount()
  click(await screen.findByRole('button', { name: 'Start run' }))
  running.update({ title: 'Other ARC' })
  await new Promise((resolve) => setTimeout(resolve, 20))

  expect(createGame).not.toHaveBeenCalled()
  expect(screen.getByText('Quest: Other ARC')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Start run' })).toBeTruthy()
})

it('pauses on leaving fullscreen that the host entered itself, without the button', async () => {
  stubFullscreen(true)
  await startRun({ fullscreen: false })
  fireEvent.focusIn(screen.getByRole('group', { name: 'ARCade game' }))
  expect(lastPause()).toEqual({ type: 'pause', paused: false })

  await arcade?.requestFullscreen()
  expect(handle.focus).toHaveBeenCalled()
  await document.exitFullscreen()

  expect(lastPause()).toEqual({ type: 'pause', paused: true })
  expect(screen.getByRole('button', { name: 'Click to play' })).toBeTruthy()
})

it('keeps the Click to play button node while it stays the same notice', async () => {
  stubFullscreen(true)
  await startRun()
  const overlay = screen.getByRole('button', { name: 'Click to play' })

  fireEvent.focusOut(screen.getByRole('group', { name: 'ARCade game' }))

  expect(screen.getByRole('button', { name: 'Click to play' })).toBe(overlay)
})

it('keeps the keyboard focus on New path after it planned another path', async () => {
  mount()
  const button = await screen.findByRole('button', { name: 'New path' })
  button.focus()

  click(button)

  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'New path' }))
})

describe('Training', () => {
  const TUTORIAL_KEY = 'arc-mage.tutorial.v1'
  const sentCommands = () => vi.mocked(handle.send).mock.calls.map(([command]) => command)
  const gameEvent = (event: GameEvent) => vi.mocked(handle.on).mock.calls.at(-1)?.[0](event)

  async function startTraining(options: Partial<ArcadeOptions> = {}) {
    mount(options)
    click(await screen.findByRole('button', { name: 'Training' }))
    await screen.findByRole('button', { name: 'Click to play' })
  }

  it('shows Training next to Start run with a "New here?" tag until it has been opened', async () => {
    mount()

    const training = await screen.findByRole('button', { name: 'Training' })
    expect(training.getAttribute('aria-describedby')).toBe(screen.getByText('New here?').id)
    expect(screen.getByRole('button', { name: 'Start run' })).toBeTruthy()
  })

  it('creates the game and sends the plan with startTutorial, never start', async () => {
    await startTraining()

    expect(createGame).toHaveBeenCalledTimes(1)
    expect(sentCommands()).toContainEqual({ type: 'startTutorial', plan })
    expect(sentCommands().some((command) => command.type === 'start')).toBe(false)
  })

  it('writes the flag and drops the tag once the room has started, not before', async () => {
    await startTraining()
    expect(localStorage.getItem(TUTORIAL_KEY)).toBeNull()

    gameEvent({ type: 'tutorialStarted' })
    expect(localStorage.getItem(TUTORIAL_KEY)).toBe('1')

    arcade?.destroy()
    mount()
    await screen.findByRole('button', { name: 'Training' })
    expect(screen.queryByText('New here?')).toBeNull()
  })

  it('keeps the tag for the session only when the storage key is null', async () => {
    await startTraining({ tutorialStorageKey: null })
    gameEvent({ type: 'tutorialStarted' })

    expect(localStorage.length).toBe(0)
    gameEvent({ type: 'menuRequested', choice: 'menu' })
    await screen.findByRole('button', { name: 'Training' })
    expect(screen.queryByText('New here?')).toBeNull()
  })

  it('works when the browser refuses storage', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    mount()

    expect(await screen.findByText('New here?')).toBeTruthy()
    click(screen.getByRole('button', { name: 'Training' }))
    await screen.findByRole('button', { name: 'Click to play' })
    expect(() => gameEvent({ type: 'tutorialStarted' })).not.toThrow()
    get.mockRestore()
    set.mockRestore()
  })

  it('is not offered on a touch-only device', async () => {
    stubPointer(false)
    mount()

    expect(await screen.findByText('ARCade needs a keyboard and a mouse.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Training' })).toBeNull()
  })

  it('shows Training as an icon next to the settings gear in the compact card', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(280)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(200)
    mount()

    const icon = await screen.findByRole('button', { name: 'Training' })
    expect(icon.querySelector('svg')).toBeTruthy()
    expect(icon.nextElementSibling?.textContent).toBe('New here?')
    click(icon)
    await screen.findByRole('button', { name: 'Click to play' })
    expect(sentCommands()).toContainEqual({ type: 'startTutorial', plan })
  })

  it('starts the room without a plan for an ARC without provenance', async () => {
    vi.mocked(planRun).mockReturnValue(null)
    mount()

    click(await screen.findByRole('button', { name: 'Training' }))
    await screen.findByRole('button', { name: 'Click to play' })

    expect(sentCommands()).toContainEqual({ type: 'startTutorial', plan: null })
  })

  it('goes back to the start screen with the focus on Training', async () => {
    await startTraining()

    gameEvent({ type: 'menuRequested', choice: 'menu' })

    const training = await screen.findByRole('button', { name: 'Training' })
    expect(handle.destroy).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(training)
  })

  it('opens the settings over the room and hands a rebinding to the game', async () => {
    await startTraining()
    const sends = sentCommands().length

    gameEvent({ type: 'settingsRequested' })
    const dialog = screen.getByRole('dialog', { name: 'Controls' })
    click(within(dialog).getByRole('button', { name: 'Jump binding 1: Space' }))
    fireEvent.keyDown(document.body, { key: 'x', code: 'KeyX' })

    expect(sentCommands().slice(sends).map((command) => command.type)).toEqual(['setBindings'])
  })

  it('does not start a run from Retry when the room had no plan', async () => {
    vi.mocked(planRun).mockReturnValue(null)
    mount()
    click(await screen.findByRole('button', { name: 'Training' }))
    await screen.findByRole('button', { name: 'Click to play' })
    const sends = sentCommands().length

    gameEvent({ type: 'menuRequested', choice: 'retry' })

    expect(sentCommands()).toHaveLength(sends)
  })
})
