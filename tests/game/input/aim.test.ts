import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInputLayer, type InputLayer } from '../../../src/game/phaser/input/InputLayer'
import { DEFAULT_BINDINGS } from '../../../src/game/model/input'
import { AIM_RECENT_MS } from '../../../src/game/model/input/motor'

vi.mock('phaser', () => ({ default: { Math: { Vector2: class {} } } }))

// A 1280x720 canvas drawn at 640x360 CSS pixels, seen by a camera scrolled 500 units to the right.
// Phaser's pointer stays at the origin, as it does when another listener cancelled the events.
function fakeScene() {
  const canvas = document.createElement('canvas')
  canvas.width = 1280
  canvas.height = 720
  canvas.getBoundingClientRect = () => ({ left: 10, top: 20, width: 640, height: 360, right: 650, bottom: 380, x: 10, y: 20, toJSON: () => ({}) })
  document.body.append(canvas)
  const scene = {
    game: { canvas },
    time: { now: 1000 },
    input: { activePointer: { x: 0, y: 0 } },
    cameras: { main: { getWorldPoint: (x: number, y: number, out: { x: number; y: number }) => ((out.x = x + 500), (out.y = y)) } },
  }
  return { scene, canvas }
}

const cancelEverything = (event: Event) => event.preventDefault()

let layer: InputLayer | null = null
afterEach(() => {
  layer?.destroy()
  layer = null
  for (const type of ['mousemove', 'mousedown']) window.removeEventListener(type, cancelEverything, true)
  document.body.replaceChildren()
})

describe('aim of the input layer', () => {
  it('follows the cursor even when another listener cancelled the mouse events', () => {
    // A mouse gesture add-on: it cancels the events before the page sees them, so Phaser skips them.
    for (const type of ['mousemove', 'mousedown']) window.addEventListener(type, cancelEverything, true)
    const { scene, canvas } = fakeScene()
    layer = createInputLayer(scene as never, DEFAULT_BINDINGS)
    canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 330, clientY: 200, bubbles: true, cancelable: true }))
    const frame = layer.frame()
    // (330 - 10) CSS px is 640 canvas px, plus the camera scroll.
    expect(frame.aim.x).toBe(1140)
    expect(frame.aim.y).toBe(360)
    expect(frame.aim.recent).toBe(true)
  })

  it('aims at the click point of a mouse button without a move before it', () => {
    const { scene, canvas } = fakeScene()
    layer = createInputLayer(scene as never, DEFAULT_BINDINGS)
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 10, clientY: 20, bubbles: true, cancelable: true }))
    const frame = layer.frame()
    expect(frame.pressed.has('light')).toBe(true)
    expect(frame.aim.x).toBe(500)
    expect(frame.aim.recent).toBe(true)
  })

  it('stops counting a resting cursor after the recent window, so keyboard play keeps the held direction', () => {
    const { scene, canvas } = fakeScene()
    layer = createInputLayer(scene as never, DEFAULT_BINDINGS)
    expect(layer.frame().aim.recent).toBe(false)
    canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100, bubbles: true }))
    scene.time.now += AIM_RECENT_MS
    expect(layer.frame().aim.recent).toBe(true)
    // The same position again is no use of the pointer.
    canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100, bubbles: true }))
    scene.time.now += 1
    expect(layer.frame().aim.recent).toBe(false)
  })

  it('cancels the right button and auxclick on the canvas, so no browser menu opens', () => {
    const { scene, canvas } = fakeScene()
    layer = createInputLayer(scene as never, DEFAULT_BINDINGS)
    for (const event of [
      new MouseEvent('mousedown', { button: 2, bubbles: true, cancelable: true }),
      new MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true }),
      new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true }),
    ]) {
      canvas.dispatchEvent(event)
      expect(event.defaultPrevented, event.type).toBe(true)
    }
  })
})
