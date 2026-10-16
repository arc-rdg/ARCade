import { describe, expect, it, vi } from 'vitest'
import { createInputLayer } from '../../../src/game/phaser/input/InputLayer'
import { DEFAULT_BINDINGS } from '../../../src/game/model/input'

// Phaser needs a real canvas to load. The input layer only builds a vector from it.
vi.mock('phaser', () => ({ default: { Math: { Vector2: class {} } } }))

function fakeScene() {
  const canvas = document.createElement('canvas')
  const scene = {
    game: { canvas },
    time: { now: 0 },
    input: { activePointer: { x: 0, y: 0 } },
    cameras: { main: { getWorldPoint: (x: number, y: number, out: { x: number; y: number }) => ((out.x = x), (out.y = y)) } },
  }
  return { scene, canvas }
}

describe('mouse capture of the input layer', () => {
  it('ignores a click while captured, so the click that closes a banner is no attack', () => {
    const { scene, canvas } = fakeScene()
    const layer = createInputLayer(scene as never, DEFAULT_BINDINGS)
    layer.setMouseCaptured(true)
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0 }))
    canvas.dispatchEvent(new MouseEvent('mouseup', { button: 0 }))
    layer.setMouseCaptured(false)
    const frame = layer.frame()
    expect(frame.pressed.has('light')).toBe(false)
    expect(frame.held.has('light')).toBe(false)
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0 }))
    expect(layer.frame().pressed.has('light')).toBe(true)
    layer.destroy()
  })

  it('curses attacks only, so a jump rebound to a mouse button still works', () => {
    const { scene, canvas } = fakeScene()
    const layer = createInputLayer(scene as never, { ...DEFAULT_BINDINGS, jump: [{ device: 'mouse', button: 1 }] })
    layer.setMouseCaptured(true)
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 1 }))
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0 }))
    const frame = layer.frame()
    expect(frame.pressed.has('jump')).toBe(true)
    expect(frame.pressed.has('light')).toBe(false)
    layer.destroy()
  })
})
