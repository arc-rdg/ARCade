import type Phaser from 'phaser'
import { PALETTE } from '../../contracts/constants'
import { COOKIE_TEXT } from '../../model/progression'
import type { View } from '../view'
import { COOKIE_BANNER_EVENT, COOKIE_SUSPEND_EVENT, type CookieBannerHandle, type MageBand } from './cookieBannerEvent'
import { addText, onCanvasKey, onClick } from './ui'

const M = 8
const PAD = 8
const MAX_WIDTH = 520
const MAIN_H = 66
const PREFS_H = 98
const BUTTON_W = 96
const ROW_H = 14
// Above the pause menu and the info panels of the HUD scene.
const DEPTH = 200
// Room kept between the banner and the mage.
const CLEARANCE = 8
const ACCEPT_COLOR = PALETTE.teal
const HOVER_COLOR = PALETTE.blue
const MUTED = 0x8fa3b8

type Layer = 'main' | 'prefs'
type Side = 'top' | 'bottom'
type Item = Phaser.GameObjects.Text | Phaser.GameObjects.Rectangle | Phaser.GameObjects.Graphics

interface Row {
  zone: Phaser.GameObjects.Rectangle
  tick: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
  on: boolean
}

// The cookie banner of Accept All Cookies, a band at the top or bottom of the screen on the side the
// mage is not on. Everything is created once and shown or hidden, and the band redraws only when
// its layer, side or the view changes. The big button accepts. A tiny link opens the preferences,
// a few toggles that change nothing and a second big accept.
export class CookieBannerPanel {
  private readonly bg: Phaser.GameObjects.Graphics
  private readonly title: Phaser.GameObjects.Text
  private readonly body: Phaser.GameObjects.Text
  private readonly hint: Phaser.GameObjects.Text
  private readonly acceptBox: Phaser.GameObjects.Rectangle
  private readonly acceptText: Phaser.GameObjects.Text
  private readonly manage: Phaser.GameObjects.Text
  private readonly save: Phaser.GameObjects.Text
  private readonly rows: Row[]
  private readonly items: Item[]
  private readonly targets: (Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text)[]
  private readonly band: MageBand = { top: 0.5, bottom: 0.5 }
  private handle: CookieBannerHandle | null = null
  private suspended = false
  private layer: Layer = 'main'
  private side: Side = 'bottom'
  private view: View = { zoom: 1, width: 480, height: 360 }

  constructor(scene: Phaser.Scene) {
    this.bg = scene.add.graphics()
    this.title = addText(scene, COOKIE_TEXT.title, 8, { bold: true })
    this.body = addText(scene, COOKIE_TEXT.body, 6.5)
    this.hint = addText(scene, COOKIE_TEXT.hint, 5.5, { color: PALETTE.yellow, bold: true })
    this.acceptBox = scene.add.rectangle(0, 0, BUTTON_W, 24, ACCEPT_COLOR).setStrokeStyle(1, PALETTE.cream)
    this.acceptText = addText(scene, COOKIE_TEXT.accept, 10, { color: PALETTE.navy, bold: true }).setOrigin(0.5)
    this.manage = addText(scene, COOKIE_TEXT.manage, 5, { color: MUTED }).setOrigin(0.5).setPadding(4, 3, 4, 3)
    this.save = addText(scene, COOKIE_TEXT.save, 5, { color: MUTED }).setOrigin(0.5).setPadding(4, 3, 4, 3)
    this.rows = COOKIE_TEXT.prefs.map((label) => ({
      // Nearly clear but not zero, so the row still takes clicks.
      zone: scene.add.rectangle(0, 0, 10, ROW_H - 2, PALETTE.cream, 0.02).setOrigin(0, 0.5),
      tick: scene.add.rectangle(0, 0, 8, 8, PALETTE.teal).setStrokeStyle(1, PALETTE.cream),
      label: addText(scene, label, 6.5).setOrigin(0, 0.5),
      on: true,
    }))
    this.items = [this.bg, this.title, this.body, this.hint, this.acceptBox, this.acceptText, this.manage, this.save]
    for (const row of this.rows) this.items.push(row.zone, row.tick, row.label)
    for (const item of this.items) item.setDepth(DEPTH)
    this.targets = [this.acceptBox, this.manage, this.save, ...this.rows.map((row) => row.zone)]

    // Interactive once. Showing or hiding only switches `input.enabled`.
    for (const target of this.targets) target.setInteractive({ useHandCursor: true })
    onClick(scene, this.acceptBox, () => this.accept())
    onClick(scene, this.save, () => this.accept())
    onClick(scene, this.manage, () => this.setLayer('prefs'))
    this.acceptBox.on('pointerover', () => this.acceptBox.setFillStyle(HOVER_COLOR))
    this.acceptBox.on('pointerout', () => this.acceptBox.setFillStyle(ACCEPT_COLOR))
    this.rows.forEach((row, index) => {
      // The first one is "strictly necessary", so it stays on.
      if (index > 0) onClick(scene, row.zone, () => this.toggle(row))
    })
    onCanvasKey(scene, (code, event) => {
      if (!this.isShown() || (code !== 'Enter' && code !== 'NumpadEnter')) return
      event.preventDefault()
      this.accept()
    })
    const onBanner = (handle: CookieBannerHandle | null) => (handle ? this.show(handle) : this.hide())
    const onSuspend = (suspended: boolean) => this.setSuspended(suspended)
    scene.game.events.on(COOKIE_BANNER_EVENT, onBanner)
    scene.game.events.on(COOKIE_SUSPEND_EVENT, onSuspend)
    scene.events.once('shutdown', () => {
      scene.game.events.off(COOKIE_BANNER_EVENT, onBanner)
      scene.game.events.off(COOKIE_SUSPEND_EVENT, onSuspend)
    })
    this.apply()
  }

  private isShown(): boolean {
    return this.handle !== null && !this.suspended
  }

  private accept() {
    this.handle?.accept()
  }

  private toggle(row: Row) {
    row.on = !row.on
    row.tick.setFillStyle(row.on ? PALETTE.teal : PALETTE.navy)
  }

  private show(handle: CookieBannerHandle) {
    this.handle = handle
    this.layer = 'main'
    for (const row of this.rows) {
      row.on = true
      row.tick.setFillStyle(PALETTE.teal)
    }
    this.side = 'bottom'
    this.chooseSide()
    this.apply()
  }

  private hide() {
    this.handle = null
    this.apply()
  }

  private setSuspended(suspended: boolean) {
    this.suspended = suspended
    this.apply()
  }

  private setLayer(layer: Layer) {
    this.layer = layer
    this.chooseSide()
    this.apply()
  }

  layout(view: View) {
    this.view = view
    this.apply()
  }

  // Once per frame while the banner is up. The mage can walk or jump under it, so the band moves to
  // the other side, and stays where it is as long as it keeps clear of the mage.
  update() {
    if (!this.isShown()) return
    const before = this.side
    this.chooseSide()
    if (this.side !== before) this.apply()
  }

  private height(): number {
    return Math.min(this.layer === 'main' ? MAIN_H : PREFS_H, this.view.height * 0.45)
  }

  private chooseSide() {
    if (!this.handle) return
    this.handle.mageBand(this.band)
    const h = this.view.height
    const bandH = this.height()
    const top = this.band.top * h - CLEARANCE
    const bottom = this.band.bottom * h + CLEARANCE
    const clearBottom = bottom <= h - M - bandH
    const clearTop = top >= M + bandH
    if (this.side === 'bottom' && !clearBottom && clearTop) this.side = 'top'
    else if (this.side === 'top' && !clearTop && clearBottom) this.side = 'bottom'
  }

  private showItems(items: Item[]) {
    for (const item of items) item.setVisible(true)
  }

  private apply() {
    for (const item of this.items) item.setVisible(false)
    for (const target of this.targets) if (target.input) target.input.enabled = false
    if (!this.isShown()) return

    const main = this.layer === 'main'
    const { width: w, height: h } = this.view
    const bw = Math.min(w - 2 * M, MAX_WIDTH)
    const bh = this.height()
    const x0 = (w - bw) / 2
    const y0 = this.side === 'bottom' ? h - M - bh : M
    const leftW = bw - BUTTON_W - 3 * PAD
    const buttonX = x0 + bw - PAD - BUTTON_W / 2
    const acceptY = y0 + (main ? 24 : 28)

    this.bg.clear().fillStyle(PALETTE.navy, 0.96).fillRoundedRect(x0, y0, bw, bh, 3).lineStyle(1, PALETTE.cream, 1).strokeRoundedRect(x0, y0, bw, bh, 3)
    this.title.setText(main ? COOKIE_TEXT.title : COOKIE_TEXT.prefsTitle).setPosition(x0 + PAD, y0 + 6)
    this.hint.setPosition(x0 + PAD, y0 + bh - 12)
    this.acceptBox.setPosition(buttonX, acceptY)
    this.acceptText.setPosition(buttonX, acceptY)
    this.showItems([this.bg, this.title, this.hint, this.acceptBox, this.acceptText])
    this.acceptBox.input!.enabled = true
    if (main) {
      this.body.setWordWrapWidth(leftW, true).setPosition(x0 + PAD, y0 + 19)
      this.manage.setPosition(buttonX, acceptY + 22)
      this.showItems([this.body, this.manage])
      this.manage.input!.enabled = true
      return
    }
    this.save.setPosition(buttonX, acceptY + 22)
    this.showItems([this.save])
    this.save.input!.enabled = true
    this.rows.forEach((row, index) => {
      const y = y0 + 25 + index * ROW_H
      row.zone.setPosition(x0 + PAD, y).setSize(leftW, ROW_H - 2)
      ;(row.zone.input!.hitArea as Phaser.Geom.Rectangle).setSize(leftW, ROW_H - 2)
      row.zone.input!.enabled = true
      row.tick.setPosition(x0 + PAD + 4, y)
      row.label.setPosition(x0 + PAD + 13, y).setAlpha(index === 0 ? 0.6 : 1)
      this.showItems([row.zone, row.tick, row.label])
    })
  }
}
