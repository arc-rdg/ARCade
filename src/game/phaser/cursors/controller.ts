import type { CursorKind } from '../../model/input/cursor'

// Something with a CSS cursor: the canvas and the element around it.
export interface CursorTarget {
  style: { cursor: string }
}

export interface CursorSetup {
  targets: readonly CursorTarget[]
  // The CSS `cursor` value of a kind. Built once, so it costs nothing here.
  cssFor(kind: CursorKind): string
  // True on a device without a mouse. It gets no custom cursors.
  isTouch(): boolean
  // Hears every value that gets written, so Phaser resets to it after a widget's own cursor.
  onWrite?(css: string): void
}

export interface CursorController {
  // The kind the screen shows when no widget asks for another. A style write only when it changed.
  set(kind: CursorKind): void
  // A kind that wins over set() until it is cleared, for a drag. Null clears it.
  hold(kind: CursorKind | null): void
  // The CSS value for a widget's own cursor, '' on touch.
  css(kind: CursorKind): string
  current(): CursorKind | null
}

export function createCursorController(setup: CursorSetup): CursorController {
  let base: CursorKind | null = null
  let held: CursorKind | null = null
  let shown: CursorKind | null = null

  const show = () => {
    const kind = held ?? base
    if (kind === null || kind === shown || setup.isTouch()) return
    shown = kind
    const css = setup.cssFor(kind)
    for (const target of setup.targets) target.style.cursor = css
    setup.onWrite?.(css)
  }

  return {
    set(kind) {
      base = kind
      show()
    },
    hold(kind) {
      held = kind
      show()
    },
    css: (kind) => (setup.isTouch() ? '' : setup.cssFor(kind)),
    current: () => shown,
  }
}
