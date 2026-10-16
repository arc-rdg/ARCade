import { expect, it } from 'vitest'
import { cappedCanvasSize } from '../../src/game/phaser/canvasCap'

it('keeps a box up to 1920x1080 at full size', () => {
  expect(cappedCanvasSize(1440, 900)).toEqual({ width: 1440, height: 900 })
  expect(cappedCanvasSize(1920, 1080)).toEqual({ width: 1920, height: 1080 })
})

it('shrinks a larger box to the area of 1920x1080 and keeps its aspect ratio', () => {
  expect(cappedCanvasSize(3840, 2160)).toEqual({ width: 1920, height: 1080 })
  const portrait = cappedCanvasSize(2160, 3840)
  expect(portrait).toEqual({ width: 1080, height: 1920 })
  const wide = cappedCanvasSize(5120, 1440)
  expect(wide.width / wide.height).toBeCloseTo(5120 / 1440, 2)
  expect(wide.width * wide.height).toBeLessThanOrEqual(1920 * 1080 + wide.width)
})

it('never returns an empty canvas', () => {
  expect(cappedCanvasSize(0, 0)).toEqual({ width: 1, height: 1 })
})
