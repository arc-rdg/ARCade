import mageUrl from '../game/assets/ARCMage.png'
import { indexProvenance, type ArcadeProvenance } from '../arc/provenance/input'
import type { GameEvent, GameHandle } from '../game/contracts/events'
import { ACTIONS, type Action, type Binding, type Bindings } from '../game/contracts/input'
import { BINDINGS_STORAGE_KEY, bindingLabel, DEFAULT_BINDINGS, findConflicts, loadBindings, saveBindings } from '../game/model/input'
import { planRun } from '../game/model/run'
import { barList } from './barList'
import { alertIcon, exitFullscreenIcon, fullscreenIcon, h } from './dom'
import { boxFor, observeSize, type Box } from './layout'
import { scene, sparkle } from './scenery'
import { acquireStyles } from './styles'
import { loadTrimmedImage } from './trimmedImage'

export interface ArcadeOptions {
  title: string
  provenance: ArcadeProvenance
  // A fixed seed for the first path. Without one the path is random.
  seed?: string
  // Skips the start screen and starts a run. Default false.
  autoStart?: boolean
  // Where the key bindings are kept. Default 'arc-mage.bindings.v1'; null keeps them for this session only.
  bindingsStorageKey?: string | null
  // Shows the fullscreen button. Default true, and always hidden where the browser has no fullscreen.
  fullscreen?: boolean
  onEvent?: (event: GameEvent) => void
}

export interface ArcadeHandle {
  // New data returns to the start screen (or starts a run again with autoStart) with a new plan.
  update(next: { title?: string; provenance?: ArcadeProvenance; seed?: string }): void
  requestFullscreen(): Promise<void>
  destroy(): void
}

type Mode = 'menu' | 'settings' | 'playing'

const ACTION_NAMES: Record<Action, string> = {
  left: 'Move left',
  right: 'Move right',
  up: 'Up',
  down: 'Down',
  jump: 'Jump',
  dash: 'Dash',
  light: 'Light attack',
  heavy: 'Heavy attack',
  ability1: 'Ability 1',
  ability2: 'Ability 2',
  ability3: 'Ability 3',
  ability4: 'Ability 4',
  pause: 'Pause',
}

const BINDING_SLOTS = [0, 1]
const FINE_POINTER = '(any-pointer: fine)'
// The start screen does not shrink below this scale to fit its content.
const MIN_FIT_SCALE = 0.55
// A wide screen has no inner scroll to fall back on, so it may shrink further.
const MIN_FIT_SCALE_WIDE = 0.35

const newSeed = () => Math.floor(Math.random() * 36 ** 8).toString(36).padStart(8, '0')

const sameBinding = (a: Binding, b: Binding) =>
  a.device === 'key' ? b.device === 'key' && a.code === b.code : b.device === 'mouse' && a.button === b.button

function withSlot(list: Binding[], slot: number, binding: Binding): Binding[] {
  const others = list.filter((_, position) => position !== slot)
  if (others.some((other) => sameBinding(other, binding))) return list
  const next = [...list]
  next[Math.min(slot, list.length)] = binding
  return next
}

function withoutSlot(list: Binding[], slot: number): Binding[] {
  return list.filter((_, position) => position !== slot)
}

// The game fills the box of its host element. The start screen, the settings and the running game
// are three modes of this one controller, and the game itself lives in a Phaser canvas inside it.
export function mountArcade(el: HTMLElement, options: ArcadeOptions): ArcadeHandle {
  const doc = el.ownerDocument
  const win = doc.defaultView ?? window
  const releaseStyles = acquireStyles(doc)
  const storageKey = options.bindingsStorageKey === undefined ? BINDINGS_STORAGE_KEY : options.bindingsStorageKey

  const root = h('div', { class: 'arcade-root' })
  const stage = h('div', { class: 'arcade-stage' })
  stage.style.display = 'contents'
  root.append(stage)
  el.append(root)

  let title = options.title
  let index = indexProvenance(options.provenance)
  let seed = options.seed ?? newSeed()
  let plan = planRun(index, title, seed)
  let bindings: Bindings = storageKey === null ? DEFAULT_BINDINGS : loadBindings(storageKey)
  let mode: Mode = 'menu'
  let box: Box | null = null
  let mage: string | null = null
  let screenEl: HTMLElement | null = null
  let disposeScreen: (() => void) | null = null
  // The running game's hooks, set while the playing screen is up.
  let playing: { focus(): void; leftFullscreen(): void; resize(width: number, height: number): void } | null = null
  let sendToGame: ((bindings: Bindings) => void) | null = null
  let capture: { action: Action; slot: number } | null = null
  let destroyed = false

  const pointerQuery = win.matchMedia(FINE_POINTER)
  const canPlay = () => pointerQuery.matches && plan !== null

  // Applies the measured box to the start screen or settings.
  const applyBox = () => {
    if (!screenEl) return
    screenEl.dataset.layout = box?.layout ?? 'wide'
    let scale = box?.scale ?? 1
    screenEl.style.setProperty('--scale', String(scale))
    // The start screen shrinks until its content fits the box, down to a floor. Below that the bar list
    // of a stacked screen scrolls inside its card, and a wide screen scrolls as a page.
    if (mode !== 'menu') return
    const floor = box?.layout === 'wide' ? MIN_FIT_SCALE_WIDE : MIN_FIT_SCALE
    const bars = screenEl.querySelector<HTMLElement>('.arcade-bars-list')
    const overflows = (el: HTMLElement) =>
      el.scrollHeight > el.clientHeight || (bars !== null && bars.scrollHeight > bars.clientHeight + 1)
    for (let step = 0; step < 8 && scale > floor && overflows(screenEl); step++) {
      const ratio = screenEl.scrollHeight > screenEl.clientHeight ? screenEl.clientHeight / screenEl.scrollHeight : 0.9
      scale = Math.max(floor, scale * ratio)
      screenEl.style.setProperty('--scale', String(scale))
    }
  }

  // Rebuilds the start screen and puts the keyboard focus back on the button that had it.
  const rebuildMenu = () => {
    const action = (doc.activeElement as HTMLElement | null)?.getAttribute?.('data-action')
    renderMenu()
    if (action) screenEl?.querySelector<HTMLElement>(`[data-action="${action}"]`)?.focus()
  }

  const show = (screen: HTMLElement) => {
    screenEl = screen
    stage.replaceChildren(screen)
    applyBox()
  }

  const setMode = (next: Mode) => {
    disposeScreen?.()
    disposeScreen = null
    playing = null
    sendToGame = null
    screenEl = null
    capture = null
    mode = next
    if (next === 'playing' && plan) disposeScreen = renderPlaying(plan)
    else if (next === 'settings') disposeScreen = renderSettings()
    else {
      mode = 'menu'
      renderMenu()
    }
  }

  const updateBindings = (next: Bindings) => {
    bindings = next
    if (storageKey !== null) saveBindings(next, storageKey)
    sendToGame?.(next)
  }

  const mageFigure = (src: string) =>
    h('div', { class: 'arcade-figure' }, h('span', { class: 'arcade-hill', 'aria-hidden': 'true' }), h('img', { class: 'arcade-mage', src, alt: '' }), sparkle())

  function renderMenu() {
    const compact = box?.layout === 'compact'
    const totalAnnotations = plan?.segments.reduce((sum, segment) => sum + segment.annotations.length, 0) ?? 0
    const fine = pointerQuery.matches
    const newPath = () => {
      seed = newSeed()
      plan = planRun(index, title, seed)
      rebuildMenu()
    }
    const newPathButton = () => h('button', { type: 'button', class: 'arcade-btn', 'data-action': 'new-path', onclick: newPath }, 'New path')

    let actions: HTMLElement
    if (fine) {
      actions = h(
        'div',
        { class: 'arcade-actions' },
        h('button', { type: 'button', class: 'arcade-btn arcade-btn-start', 'data-action': 'start', onclick: () => setMode('playing') }, 'Start run'),
        !compact && newPathButton(),
        !compact && h('button', { type: 'button', class: 'arcade-btn', 'data-action': 'settings', onclick: () => setMode('settings') }, 'Settings'),
      )
    } else {
      actions = h(
        'div',
        { class: 'arcade-actions' },
        h('p', { class: 'arcade-message' }, h('strong', {}, 'Keyboard required'), h('span', {}, 'ARCade needs a keyboard and a mouse.')),
        !compact && newPathButton(),
      )
    }

    const pathText = plan ? `${plan.nodes[0].id} → ${plan.nodes[plan.nodes.length - 1].id}` : ''
    const content = h(
      'div',
      { class: 'arcade-content' },
      h('h2', { class: 'arcade-logo', 'aria-label': 'ARCade' }, h('span', { 'aria-hidden': 'true' }, 'ARC', h('span', { class: 'arcade-logo-tail' }, 'ade'))),
    )
    if (!plan) {
      content.append(
        h(
          'p',
          { class: 'arcade-message' },
          h('strong', {}, 'No provenance yet'),
          h('span', {}, 'This ARC has no provenance yet. Annotate a study or assay table to open the path for ARCade.'),
        ),
      )
    } else if (compact) {
      const summary = `${plan.segments.length} steps · ${totalAnnotations} monsters · quest: ${title}`
      content.append(h('p', { class: 'arcade-summary', title: `${plan.segments.length} steps, ${totalAnnotations} monsters, quest: ${title}` }, summary), actions)
    } else {
      content.append(
        h('p', { class: 'arcade-quest', title }, `Quest: ${title}`),
        h(
          'div',
          { class: 'arcade-card' },
          h('p', { class: 'arcade-hint' }, `Fight along one path through ${title}. Every annotation on the way is a monster and every node after a step is a boss.`),
          h(
            'dl',
            { class: 'arcade-facts' },
            h('dt', {}, 'Path'),
            h('dd', { class: 'arcade-facts-path', title: pathText }, pathText),
            h('dt', {}, 'Steps'),
            h('dd', {}, String(plan.segments.length)),
            h('dt', {}, 'Annotations'),
            h('dd', {}, String(totalAnnotations)),
            h('dt', {}, 'Seed'),
            h('dd', {}, h('code', {}, plan.seed)),
          ),
          barList(
            'Annotations per step',
            plan.segments.map((segment) => ({
              key: String(segment.index),
              label: segment.processName,
              count: segment.annotations.length,
              title: `${segment.processName}: ${segment.fromNodeId} to ${segment.toNodeId}`,
            })),
          ),
        ),
        actions,
      )
    }

    show(
      h(
        'div',
        { class: 'arcade-screen' },
        scene(),
        plan && mage && mageFigure(mage),
        content,
      ),
    )
  }

  function renderSettings(): () => void {
    const hint = h('p', { class: 'arcade-hint', role: 'status' })
    const rows = ACTIONS.map((action) => {
      const buttons = BINDING_SLOTS.map((slot) =>
        h('button', {
          type: 'button',
          class: 'arcade-btn arcade-btn-small arcade-slot',
          onclick: () => {
            if (!capture) beginCapture(action, slot)
          },
        }),
      )
      const note = h('span', { class: 'arcade-conflict', hidden: true })
      const item = h(
        'li',
        { class: 'arcade-binding-row' },
        h('span', { class: 'arcade-action-name' }, ACTION_NAMES[action]),
        h('span', { class: 'arcade-slots' }, ...buttons),
        note,
      )
      return { action, buttons, note, item }
    })

    const noteFor = (action: Action, conflicts: ReturnType<typeof findConflicts>) =>
      conflicts
        .filter(({ actions }) => actions.includes(action))
        .map(({ binding, actions }) => ({ binding, others: actions.filter((other) => other !== action) }))
        .filter(({ others }) => others.length > 0)
        .map(({ binding, others }) => `${bindingLabel(binding)} is also bound to ${others.map((other) => ACTION_NAMES[other]).join(', ')}.`)
        .join(' ')

    // Updates the texts in place, so the button that was clicked keeps its keyboard focus.
    const refresh = () => {
      hint.textContent = capture
        ? `Press a key or a mouse button for ${ACTION_NAMES[capture.action]}. Delete or Backspace clears the binding and Escape cancels.`
        : 'Click a binding, then press a key or a mouse button. Each action takes up to two.'
      const conflicts = findConflicts(bindings)
      for (const { action, buttons, note, item } of rows) {
        buttons.forEach((button, slot) => {
          const binding = bindings[action][slot]
          const capturing = capture?.action === action && capture.slot === slot
          const text = capturing ? 'Press a key' : binding ? bindingLabel(binding) : 'Unbound'
          button.textContent = text
          button.setAttribute('aria-label', `${ACTION_NAMES[action]} binding ${slot + 1}: ${text}`)
          if (capturing) button.setAttribute('data-capturing', '')
          else button.removeAttribute('data-capturing')
        })
        const text = noteFor(action, conflicts)
        note.hidden = !text
        note.replaceChildren(...(text ? [alertIcon(), doc.createTextNode(` ${text}`)] : []))
        item.toggleAttribute('data-conflict', Boolean(text))
      }
    }

    // Waits for the next key or mouse button and binds it. Escape cancels, Delete and Backspace clear
    // the slot. A mouse press on a button other than the capturing slot cancels the capture and the
    // click goes through. The capture ends only after the release, so the click or the Space release
    // that follows does not press the slot button again.
    let stopCapture: (() => void) | null = null
    const endCapture = () => {
      stopCapture?.()
      stopCapture = null
      capture = null
      refresh()
    }
    function beginCapture(action: Action, slot: number) {
      capture = { action, slot }
      let assigned = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const assign = (binding: Binding) => {
        assigned = true
        updateBindings({ ...bindings, [action]: withSlot(bindings[action], slot, binding) })
        refresh()
      }
      const clear = () => {
        assigned = true
        if (bindings[action][slot]) updateBindings({ ...bindings, [action]: withoutSlot(bindings[action], slot) })
        refresh()
      }
      const onKeyDown = (event: KeyboardEvent) => {
        event.preventDefault()
        event.stopPropagation()
        if (assigned || event.repeat) return
        if (event.code === 'Escape') endCapture()
        else if (event.code === 'Delete' || event.code === 'Backspace') clear()
        else assign({ device: 'key', code: event.code })
      }
      const onMouseDown = (event: MouseEvent) => {
        if (assigned || event.button > 2) return
        const button = (event.target as Element | null)?.closest?.('button') ?? null
        if (button && !button.hasAttribute('data-capturing')) {
          endCapture()
          return
        }
        event.preventDefault()
        event.stopPropagation()
        assign({ device: 'mouse', button: event.button as 0 | 1 | 2 })
      }
      const onRelease = (event: Event) => {
        if (!assigned) return
        event.preventDefault()
        timer ??= setTimeout(endCapture)
      }
      const onContextMenu = (event: Event) => event.preventDefault()
      win.addEventListener('keydown', onKeyDown, true)
      win.addEventListener('mousedown', onMouseDown, true)
      win.addEventListener('keyup', onRelease, true)
      win.addEventListener('mouseup', onRelease, true)
      win.addEventListener('contextmenu', onContextMenu, true)
      stopCapture = () => {
        clearTimeout(timer)
        win.removeEventListener('keydown', onKeyDown, true)
        win.removeEventListener('mousedown', onMouseDown, true)
        win.removeEventListener('keyup', onRelease, true)
        win.removeEventListener('mouseup', onRelease, true)
        win.removeEventListener('contextmenu', onContextMenu, true)
      }
      refresh()
    }

    refresh()
    show(
      h(
        'div',
        { class: 'arcade-screen arcade-screen-settings' },
        scene(),
        h(
          'div',
          { class: 'arcade-content arcade-card' },
          h(
            'div',
            { class: 'arcade-settings-head' },
            h('h2', { class: 'arcade-settings-title' }, 'Controls'),
            h(
              'div',
              { class: 'arcade-settings-buttons' },
              h(
                'button',
                {
                  type: 'button',
                  class: 'arcade-btn arcade-btn-small',
                  onclick: () => {
                    endCapture()
                    updateBindings(DEFAULT_BINDINGS)
                    refresh()
                  },
                },
                'Reset to defaults',
              ),
              h('button', { type: 'button', class: 'arcade-btn arcade-btn-small', onclick: () => setMode('menu') }, 'Back'),
            ),
          ),
          hint,
          h('ul', { class: 'arcade-bindings', 'aria-label': 'Controls' }, ...rows.map((row) => row.item)),
        ),
      ),
    )
    return () => {
      stopCapture?.()
      stopCapture = null
    }
  }

  function renderPlaying(runPlan: NonNullable<typeof plan>): () => void {
    const host = h('div', { class: 'arcade-host', role: 'group', 'aria-label': 'ARCade game' })
    const notices = h('div', { class: 'arcade-notices' })
    notices.style.display = 'contents'
    stage.replaceChildren(h('div', { class: 'arcade-play' }, host, notices))

    let cancelled = false
    let ready = false
    let failed = false
    let isFocused = false
    let isOnScreen = true
    let isPageVisible = doc.visibilityState !== 'hidden'
    let isPaused: boolean | undefined
    let handle: GameHandle | null = null
    let stopListening: (() => void) | undefined
    let timer: ReturnType<typeof setTimeout> | undefined

    let noticeKind = ''
    const showNotice = () => {
      // A notice that stays the same keeps its node, so a press on it is not cut short.
      const kind = failed ? 'failed' : !ready ? 'loading' : !isFocused ? 'overlay' : 'none'
      if (kind === noticeKind) return
      noticeKind = kind
      if (failed) {
        notices.replaceChildren(
          h(
            'div',
            { class: 'arcade-status' },
            h('p', { class: 'arcade-message', role: 'alert' }, h('strong', {}, 'The game could not be loaded'), h('span', {}, 'Reload the page to try again.')),
            h('button', { type: 'button', class: 'arcade-btn', onclick: () => setMode('menu') }, 'Back'),
          ),
        )
      } else if (!ready) {
        notices.replaceChildren(h('p', { class: 'arcade-status', role: 'status' }, 'Loading game…'))
      } else if (!isFocused) {
        notices.replaceChildren(h('button', { type: 'button', class: 'arcade-overlay', onclick: claimFocus }, 'Click to play'))
      } else {
        notices.replaceChildren()
      }
    }

    // The game runs only while its canvas has focus and the page and the arcade are on screen. A
    // sleeping game costs no GPU time. The run starts paused, behind the "Click to play" overlay.
    const syncPause = () => {
      if (!handle) return
      const paused = !(isFocused && isOnScreen && isPageVisible)
      if (paused === isPaused) return
      isPaused = paused
      handle.send({ type: 'pause', paused })
    }
    const setFocused = (focused: boolean) => {
      isFocused = focused
      showNotice()
      syncPause()
    }
    function claimFocus() {
      handle?.focus()
      // A canvas that already holds the focus fires no focusin.
      if (host.contains(doc.activeElement)) setFocused(true)
    }

    const onFocusIn = () => setFocused(true)
    const onFocusOut = () => setFocused(false)
    const onVisibility = () => {
      isPageVisible = doc.visibilityState !== 'hidden'
      syncPause()
    }
    host.addEventListener('focusin', onFocusIn)
    host.addEventListener('focusout', onFocusOut)
    doc.addEventListener('visibilitychange', onVisibility)
    const intersection =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            isOnScreen = entries[entries.length - 1].isIntersecting
            syncPause()
          })
    intersection?.observe(host)

    // Leaving fullscreen with Escape would also open the game's pause, so the game pauses at once.
    playing = {
      focus: claimFocus,
      leftFullscreen: () => {
        // The canvas keeps the focus when the browser leaves fullscreen, so the overlay would not get its click.
        if (host.contains(doc.activeElement)) (doc.activeElement as HTMLElement).blur()
        setFocused(false)
      },
      resize: (width, height) => handle?.resize(width, height),
    }
    showNotice()

    // The game module loads when the run starts, so Phaser stays out of the page until then.
    import('../game/phaser/createGame').then(
      ({ createGame }) => {
        if (cancelled) return
        let game: GameHandle
        try {
          game = createGame(host, { bindings })
        } catch {
          // No WebGL or a lost context: the player can go back to the start screen.
          failed = true
          showNotice()
          return
        }
        handle = game
        sendToGame = (next) => game.send({ type: 'setBindings', bindings: next })
        // The Phaser scenes draw the death and victory screens, so those events need no reaction here.
        stopListening = game.on((event: GameEvent) => {
          options.onEvent?.(event)
          if (event.type !== 'menuRequested') return
          if (event.choice === 'retry') {
            game.send({ type: 'start', plan: runPlan })
            return
          }
          // The game is torn down after the event, not inside the scene that sent it.
          timer = setTimeout(() => {
            if (event.choice === 'newPath') {
              seed = newSeed()
              plan = planRun(index, title, seed)
            }
            setMode('menu')
          })
        })
        game.send({ type: 'start', plan: runPlan })
        syncPause()
        if (box) game.resize(box.width, box.height)
        ready = true
        showNotice()
      },
      () => {
        if (cancelled) return
        failed = true
        showNotice()
      },
    )

    return () => {
      cancelled = true
      clearTimeout(timer)
      intersection?.disconnect()
      doc.removeEventListener('visibilitychange', onVisibility)
      host.removeEventListener('focusin', onFocusIn)
      host.removeEventListener('focusout', onFocusOut)
      stopListening?.()
      handle?.destroy()
      handle = null
    }
  }

  // Fullscreen: the button and the arcade root as the fullscreen box.
  const fullscreenAvailable = () => options.fullscreen !== false && Boolean(doc.fullscreenEnabled)
  const isFullscreen = () => doc.fullscreenElement === root
  let wasFullscreen = false

  const requestFullscreen = async () => {
    if (destroyed || !doc.fullscreenEnabled || isFullscreen()) return
    await root.requestFullscreen()
  }

  const fullscreenButton = fullscreenAvailable()
    ? h('button', {
        type: 'button',
        class: 'arcade-fullscreen',
        onclick: () => {
          const toggle = isFullscreen() ? doc.exitFullscreen() : requestFullscreen()
          // A refused request (a missing permission, a policy) leaves the arcade as it was.
          toggle.catch(() => {})
        },
      })
    : null
  const syncFullscreenButton = () => {
    if (!fullscreenButton) return
    const inFullscreen = isFullscreen()
    fullscreenButton.setAttribute('aria-label', inFullscreen ? 'Exit fullscreen' : 'Enter fullscreen')
    fullscreenButton.title = inFullscreen ? 'Exit fullscreen' : 'Fullscreen'
    fullscreenButton.replaceChildren(inFullscreen ? exitFullscreenIcon() : fullscreenIcon())
  }
  const onFullscreenChange = () => {
    const inFullscreen = isFullscreen()
    syncFullscreenButton()
    if (inFullscreen !== wasFullscreen) {
      wasFullscreen = inFullscreen
      if (inFullscreen) playing?.focus()
      else playing?.leftFullscreen()
    }
  }
  // Also without the button: a host may call requestFullscreen() itself.
  doc.addEventListener('fullscreenchange', onFullscreenChange)
  if (fullscreenButton) {
    syncFullscreenButton()
    root.setAttribute('data-fullscreen', '')
    root.append(fullscreenButton)
  }

  const onPointerChange = () => {
    if (mode === 'menu') rebuildMenu()
  }
  pointerQuery.addEventListener('change', onPointerChange)

  const stopLoadingImage = loadTrimmedImage(mageUrl, (trimmed) => {
    mage = trimmed
    // The picture joins the start screen in place, so nothing the player is pressing is rebuilt.
    if (mode === 'menu' && plan && screenEl && !screenEl.querySelector('.arcade-figure')) {
      screenEl.insertBefore(mageFigure(trimmed), screenEl.querySelector('.arcade-content'))
      applyBox()
    }
  })

  setMode(options.autoStart && canPlay() ? 'playing' : 'menu')
  // The first size arrives before or with the first screen.
  const stopSize = observeSize(root, (width, height, em) => {
    const next = boxFor(width, height, em)
    const compactChanged = (box?.layout === 'compact') !== (next.layout === 'compact')
    box = next
    if (mode === 'menu' && compactChanged) rebuildMenu()
    else applyBox()
    playing?.resize(width, height)
  })

  return {
    update(next) {
      if (destroyed) return
      if (next.title !== undefined) title = next.title
      if (next.provenance) index = indexProvenance(next.provenance)
      seed = next.seed ?? newSeed()
      plan = planRun(index, title, seed)
      setMode(options.autoStart && canPlay() ? 'playing' : 'menu')
    },
    requestFullscreen,
    destroy() {
      if (destroyed) return
      destroyed = true
      disposeScreen?.()
      disposeScreen = null
      playing = null
      stopSize()
      stopLoadingImage()
      pointerQuery.removeEventListener('change', onPointerChange)
      doc.removeEventListener('fullscreenchange', onFullscreenChange)
      if (isFullscreen()) doc.exitFullscreen().catch(() => {})
      root.remove()
      releaseStyles()
    },
  }
}
