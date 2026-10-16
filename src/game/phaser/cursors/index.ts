import type Phaser from 'phaser'
import type { CursorKind } from '../../model/input/cursor'
import { buildCursorSet } from './art'
import { createCursorController, type CursorController } from './controller'

const controllers = new WeakMap<Phaser.Game, CursorController>()

// What the keyword of a cursor kind is where the game draws none (the sandboxes).
const KEYWORD: Record<CursorKind, string> = {
  arrow: 'default',
  sword: 'crosshair',
  starCross: 'crosshair',
  cookie: 'default',
  glove: 'pointer',
  disabled: 'not-allowed',
  openHand: 'grab',
  closedHand: 'grabbing',
  magnifier: 'zoom-in',
  none: 'none',
}

const isTouch = () => typeof matchMedia === 'function' && matchMedia('(hover: none), (pointer: coarse)').matches

// Draws the cursors and puts them on the canvas and on the box around it, so the cursor stays in
// fullscreen and over the margin the canvas leaves. Phaser resets to its default cursor after a
// widget's own, so the controller keeps that default current.
export function attachCursors(game: Phaser.Game, host: HTMLElement): CursorController | null {
  if (isTouch()) return null
  const { css } = buildCursorSet()
  const controller = createCursorController({
    targets: [game.canvas, host],
    cssFor: (kind) => css[kind],
    isTouch,
    onWrite: (value) => {
      game.input.defaultCursor = value
    },
  })
  controllers.set(game, controller)
  return controller
}

export function releaseCursors(game: Phaser.Game, host: HTMLElement): void {
  controllers.delete(game)
  host.style.removeProperty('cursor')
}

// The cursor a widget shows while the pointer is over it: pass it as `cursor` to setInteractive.
// '' on touch screens, and a plain keyword where the game draws no cursors.
export function hoverCursor(scene: Phaser.Scene, kind: CursorKind): string {
  const controller = controllers.get(scene.game)
  if (controller) return controller.css(kind)
  return KEYWORD[kind]
}

// A drag shows its cursor wherever the pointer goes. Null ends it.
export function holdCursor(scene: Phaser.Scene, kind: CursorKind | null): void {
  controllers.get(scene.game)?.hold(kind)
}

export interface DragCursor {
  setDragging(dragging: boolean): void
  // The widget goes away without a pointerout.
  reset(): void
}

// The open hand while the pointer is over a drag-scrolled list and the closed hand while it drags.
export function dragCursor(scene: Phaser.Scene, zone: Phaser.GameObjects.GameObject): DragCursor {
  let over = false
  let dragging = false
  const sync = () => holdCursor(scene, dragging ? 'closedHand' : over ? 'openHand' : null)
  zone.on('pointerover', () => {
    over = true
    sync()
  })
  zone.on('pointerout', () => {
    over = false
    sync()
  })
  return {
    setDragging(next) {
      dragging = next
      sync()
    },
    reset() {
      over = false
      dragging = false
      sync()
    },
  }
}
