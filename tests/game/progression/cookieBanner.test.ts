import { describe, expect, it } from 'vitest'
import { CORRUPTED, CORRUPTION, createCookieBanner } from '../../../src/game/model/progression'

const STEP = 1000 / 120

function run(banner: ReturnType<typeof createCookieBanner>, ms: number, canOpen = true) {
  const events: string[] = []
  for (let t = 0; t < ms; t += STEP) {
    const event = banner.step(STEP, canOpen)
    if (event) events.push(event)
  }
  return events
}

describe('cookie banner', () => {
  const { everyMs, autoAcceptMs } = CORRUPTION.acceptAllCookies

  it('opens every 25 s, not before', () => {
    const banner = createCookieBanner()
    expect(everyMs).toBe(25000)
    expect(run(banner, everyMs - 100)).toEqual([])
    expect(banner.isOpen()).toBe(false)
    expect(run(banner, 200)).toEqual(['opened'])
    expect(banner.isOpen()).toBe(true)
  })

  it('accepting closes it and starts the 25 s over', () => {
    const banner = createCookieBanner()
    run(banner, everyMs + 100)
    expect(banner.accept()).toBe(true)
    expect(banner.isOpen()).toBe(false)
    expect(banner.accept()).toBe(false)
    expect(run(banner, everyMs - 200)).toEqual([])
    expect(run(banner, 400)).toEqual(['opened'])
  })

  it('accepts itself after the timeout when ignored', () => {
    const banner = createCookieBanner()
    run(banner, everyMs + 100)
    expect(run(banner, autoAcceptMs - 500)).toEqual([])
    expect(banner.isOpen()).toBe(true)
    expect(run(banner, 1000)).toEqual(['autoAccepted'])
    expect(banner.isOpen()).toBe(false)
    expect(autoAcceptMs).toBeLessThanOrEqual(10000)
  })

  it('stands still when no time passes (pause, overlays, hit-stop do not step it)', () => {
    const banner = createCookieBanner()
    run(banner, everyMs - 1000)
    expect(banner.step(0)).toBeNull()
    run(banner, 900)
    expect(banner.isOpen()).toBe(false)
    run(banner, 200)
    expect(banner.isOpen()).toBe(true)
    // The open banner does not run down without steps either.
    expect(banner.step(0)).toBeNull()
    expect(banner.isOpen()).toBe(true)
  })

  it('waits for an overlay to close before it opens', () => {
    const banner = createCookieBanner()
    expect(run(banner, everyMs + 5000, false)).toEqual([])
    expect(banner.isOpen()).toBe(false)
    expect(banner.step(STEP, true)).toBe('opened')
  })

  it('reset closes it and starts over', () => {
    const banner = createCookieBanner()
    run(banner, everyMs + 100)
    banner.reset()
    expect(banner.isOpen()).toBe(false)
    expect(run(banner, everyMs - 200)).toEqual([])
  })

  it('the card text says the banner blocks attacks', () => {
    const card = CORRUPTED.find((entry) => entry.id === 'acceptAllCookies')
    expect(card?.curse).toBe('Every 25 s a cookie banner blocks your attacks until you accept it.')
    expect(card?.boon).toContain('+2 max HP')
  })
})
