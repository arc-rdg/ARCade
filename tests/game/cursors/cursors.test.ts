import { describe, expect, it } from 'vitest'
import { cursorFor, weaponCursor } from '../../../src/game/model/input/cursor'
import type { CursorKind } from '../../../src/game/model/input/cursor'
import { weaponStats } from '../../../src/game/model/progression/weaponStats'
import { createCursorController } from '../../../src/game/phaser/cursors/controller'
import { CursorDirector } from '../../../src/game/phaser/cursors/director'

const LIGHT_WEAPONS = ['staff', 'wand', 'pipettePistol', 'scalpel', 'sequenceWhip', 'arcitect', 'arcCommander'] as const

function controllerOn(touch = false) {
  const canvas = { style: { cursor: '' } }
  const host = { style: { cursor: '' } }
  const written: string[] = []
  const controller = createCursorController({
    targets: [canvas, host],
    cssFor: (kind: CursorKind) => `css:${kind}`,
    isTouch: () => touch,
    onWrite: (css) => written.push(css),
  })
  return { canvas, host, written, controller }
}

describe('the cursor of a light weapon', () => {
  it('is the star-cross for every weapon that shoots and the sword for every one that swings', () => {
    for (const id of LIGHT_WEAPONS) {
      const ranged = weaponStats(id, 'light', 1).reach === 'ranged'
      expect(weaponCursor(id), id).toBe(ranged ? 'starCross' : 'sword')
    }
    expect(weaponCursor('staff')).toBe('sword')
    expect(weaponCursor('arcCommander')).toBe('starCross')
  })

  it('shows during play only while the pointer is in use, and the cookie while the banner is up', () => {
    const play = { menu: false, cookie: false, aimActive: true, light: 'wand' as const }
    expect(cursorFor(play)).toBe('starCross')
    expect(cursorFor({ ...play, cookie: true })).toBe('cookie')
    expect(cursorFor({ ...play, aimActive: false })).toBe('none')
    expect(cursorFor({ ...play, aimActive: false, cookie: true })).toBe('none')
  })

  it('never hides in a menu or outside a run', () => {
    expect(cursorFor({ menu: true, cookie: true, aimActive: false, light: 'wand' })).toBe('arrow')
    expect(cursorFor({ menu: false, cookie: false, aimActive: false, light: null })).toBe('arrow')
  })
})

describe('the cursor controller', () => {
  it('writes the style on a change only', () => {
    const { canvas, host, written, controller } = controllerOn()
    controller.set('sword')
    controller.set('sword')
    controller.set('none')
    controller.set('none')
    expect(written).toEqual(['css:sword', 'css:none'])
    expect(canvas.style.cursor).toBe('css:none')
    expect(host.style.cursor).toBe('css:none')
  })

  it('does nothing on a touch device', () => {
    const { canvas, written, controller } = controllerOn(true)
    controller.set('sword')
    controller.hold('closedHand')
    expect(written).toEqual([])
    expect(canvas.style.cursor).toBe('')
    expect(controller.css('glove')).toBe('')
  })

  it('shows a held cursor over the kind underneath and goes back to it', () => {
    const { written, controller } = controllerOn()
    controller.set('arrow')
    controller.hold('closedHand')
    controller.set('sword')
    expect(controller.current()).toBe('closedHand')
    controller.hold(null)
    expect(controller.current()).toBe('sword')
    expect(written).toEqual(['css:arrow', 'css:closedHand', 'css:sword'])
  })
})

describe('the cursor director', () => {
  function directed() {
    const { controller, written } = controllerOn()
    const director = new CursorDirector()
    director.bind(controller)
    return { director, controller, written }
  }

  it('shows the arrow outside a run and the weapon cursor once the mouse moves in play', () => {
    const { director, controller } = directed()
    expect(controller.current()).toBe('arrow')
    director.setLight('scalpel')
    director.setHeld(false)
    expect(controller.current()).toBe('none')
    director.setAimActive(true)
    expect(controller.current()).toBe('sword')
  })

  it('turns into the cookie while the banner is up and back into the weapon cursor when it goes', () => {
    const { director, controller } = directed()
    director.setLight('pipettePistol')
    director.setHeld(false)
    director.setAimActive(true)
    director.setCookie(true)
    expect(controller.current()).toBe('cookie')
    director.setCookie(false)
    expect(controller.current()).toBe('starCross')
  })

  it('switches with the light weapon and shows the arrow while a menu holds the world', () => {
    const { director, controller } = directed()
    director.setLight('staff')
    director.setHeld(false)
    director.setAimActive(true)
    expect(controller.current()).toBe('sword')
    director.setLight('wand')
    expect(controller.current()).toBe('starCross')
    director.setHeld(true)
    expect(controller.current()).toBe('arrow')
    director.setAimActive(false)
    expect(controller.current()).toBe('arrow')
  })

  it('writes nothing for a report that changes nothing', () => {
    const { director, written } = directed()
    director.setLight('staff')
    director.setHeld(false)
    director.setAimActive(true)
    const before = written.length
    director.setLight('staff')
    director.setHeld(false)
    director.setAimActive(true)
    director.setCookie(false)
    expect(written.length).toBe(before)
  })
})
