import { describe, expect, it } from 'vitest'
import { followLerp } from '../../../src/game/phaser/view'

const TARGET_SPEED = 210 // world units per second
const SECONDS = 1

// Camera x after SECONDS of following a target that moves at a constant speed, one lerp per frame.
// The target is read at the middle of each frame, its average position over that frame. Reading it
// at the frame end would add a lag that grows with frame time.
function followedX(fps: number): number {
  const frameMs = 1000 / fps
  let camera = 0
  for (let frame = 0; frame < fps * SECONDS; frame++) {
    const target = TARGET_SPEED * ((frame + 0.5) * frameMs) / 1000
    camera += (target - camera) * followLerp(frameMs)
  }
  return camera
}

// Closed form for the continuous follow, the limit as frames get shorter.
const continuousX = (() => {
  const rate = -Math.log(0.86) / (16.67 / 1000)
  return TARGET_SPEED * (SECONDS - 1 / rate) + (TARGET_SPEED / rate) * Math.exp(-rate * SECONDS)
})()

describe('followLerp', () => {
  it('closes 14% of the gap in a 60 fps frame and none in a zero-length frame', () => {
    expect(followLerp(16.67)).toBeCloseTo(0.14, 4)
    expect(followLerp(0)).toBe(0)
  })

  it('lands the camera at the same x at 30, 60 and 120 fps', () => {
    const xs = [30, 60, 120].map(followedX)
    for (const x of xs) expect(Math.abs(x - continuousX)).toBeLessThan(1)
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1)
  })
})
