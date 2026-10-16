import Phaser from 'phaser'
import { PALETTE, SCENE } from '../../contracts/constants'
import type { PowerUpCard, Rarity } from '../../contracts/progression'
import { CARDS, corruptedAugment, swapCost, swateOptions, type SwateMood, type SwateOption } from '../../model/progression'
import { applySpriteRef, fragmentArt, RARITY_COLOR, SWATE_HEIGHT, SWATE_WIDTH, swateArt } from '../art'
import { cssColor } from '../color'
import type { View } from '../view'
import type { RunContext } from './context'
import { fitLine, statStacks } from './levelHistory'
import { drawScribbleBox } from './panelFrame'
import { addButton, addText, type Button, onCanvasKey, onClick, overlayView } from './ui'

// Input waits this long after the screen opens, so the press that opened it chooses nothing.
const INTRO_MS = 350
const NAVY = cssColor(PALETTE.navy)
const GOLD = cssColor(PALETTE.yellow)
const RED = '#d9534f'
const GREEN = '#2da44e'
const GREY = '#6b7280'
const ROW_H = 22
const MAX_LIST_W = 420
const COST_W = 30
// Average glyph widths of the row fonts, to decide where a line is cut.
const CHAR_W_TITLE = 4.7
const CHAR_W_SUB = 3.4
// A drag further than this many units scrolls the list and does not click the row under it.
const DRAG_UNITS = 5
const BACK_KEYS = new Set(['Escape', 'Backspace'])
const UP_KEYS = new Set(['ArrowUp', 'KeyW'])
const DOWN_KEYS = new Set(['ArrowDown', 'KeyS'])
const ACCEPT_KEYS = new Set(['Enter', 'NumpadEnter', 'Space'])
const CORRUPTED_GREY = 0x6d4a8c

type Step = 'pick' | 'choose' | 'confirm'

// One line of the list. `reason` is the mood SWATE answers with when a disabled line is clicked.
interface Entry {
  id: string
  title: string
  sub: string
  detail: string
  cost: number | null
  color: number
  enabled: boolean
  reason: SwateMood | null
}

interface RowView {
  bg: Phaser.GameObjects.Rectangle
  marker: Phaser.GameObjects.Rectangle
  title: Phaser.GameObjects.Text
  sub: Phaser.GameObjects.Text
  cost: Phaser.GameObjects.Text
  icon: Phaser.GameObjects.Sprite
  zone: Phaser.GameObjects.Zone
}

// SWATE (deprecated), the annotation table editor in the waystation. The world is held while the
// screen is open. Step 1 lists the augments the mage owns, step 2 the other augments of the same
// rarity, step 3 asks before the fragments go. Escape steps back and leaves from the first step;
// unused swaps stay for this waystation. Weapons are not listed, corrupted augments are greyed.
export class SwateScene extends Phaser.Scene {
  private readonly ctx: RunContext
  private view!: View
  private index = 0
  private clock = 0
  private step: Step = 'pick'
  private from: PowerUpCard | null = null
  private to: PowerUpCard | null = null
  private entries: Entry[] = []
  private cursor = 0
  private first = 0
  private capacity = 1
  private wheel = 0
  private dragging = false
  private dragged = false
  private dragStartY = 0
  private dragStartFirst = 0
  private box = { x: 0, y: 0, w: 0, h: 0 }
  private dim!: Phaser.GameObjects.Rectangle
  private title!: Phaser.GameObjects.Text
  private swate!: Phaser.GameObjects.Sprite
  private bubble!: Phaser.GameObjects.Graphics
  private line!: Phaser.GameObjects.Text
  private purse!: Phaser.GameObjects.Text
  private purseIcon!: Phaser.GameObjects.Sprite
  private hint!: Phaser.GameObjects.Text
  private status!: Phaser.GameObjects.Text
  private panel!: Phaser.GameObjects.Graphics
  private empty!: Phaser.GameObjects.Text
  private detail!: Phaser.GameObjects.Text
  private ask!: Phaser.GameObjects.Text
  private track!: Phaser.GameObjects.Rectangle
  private thumb!: Phaser.GameObjects.Rectangle
  private closeButton!: Button
  private backButton!: Button
  private confirmButton!: Button
  private rows: RowView[] = []

  constructor(ctx: RunContext) {
    super(SCENE.swate)
    this.ctx = ctx
  }

  create(data: { index?: number }) {
    this.index = data.index ?? 0
    this.clock = 0
    this.step = 'pick'
    this.from = null
    this.to = null
    this.cursor = 0
    this.first = 0
    this.wheel = 0
    this.dragging = false
    this.dragged = false
    this.rows = []
    this.dim = this.add.rectangle(0, 0, 1, 1, PALETTE.navy, 0.6).setOrigin(0, 0)
    this.title = addText(this, 'SWATE (deprecated)', 18, { color: PALETTE.teal, bold: true }).setOrigin(0.5).setStroke(NAVY, 4)
    const ref = swateArt(this)
    this.swate = this.add.sprite(0, 0, ref.textureKey)
    applySpriteRef(this.swate, ref)
    this.bubble = this.add.graphics()
    this.line = addText(this, '', 7.5, { color: PALETTE.navy })
    const fragmentRef = fragmentArt(this)
    this.purseIcon = this.add.sprite(0, 0, fragmentRef.textureKey)
    applySpriteRef(this.purseIcon, fragmentRef)
    this.purseIcon.setOrigin(0.5)
    this.purse = addText(this, '', 10, { color: PALETTE.yellow, bold: true }).setOrigin(1, 0.5).setStroke(NAVY, 3)
    this.hint = addText(this, '', 7, { align: 'center', bold: true }).setOrigin(0.5, 0).setStroke(NAVY, 2)
    this.status = addText(this, '', 7, { align: 'center', bold: true }).setOrigin(0.5, 0).setStroke(NAVY, 2)
    this.panel = this.add.graphics()
    this.empty = addText(this, '', 7.5, { color: PALETTE.outline, align: 'center' }).setOrigin(0.5)
    this.detail = addText(this, '', 6.5, { align: 'center' }).setOrigin(0.5, 0).setStroke(NAVY, 2)
    this.ask = addText(this, '', 10, { color: PALETTE.navy, bold: true, align: 'center' }).setOrigin(0.5)
    this.track = this.add.rectangle(0, 0, 2, 1, PALETTE.navy, 0.2).setOrigin(0.5, 0)
    this.thumb = this.add.rectangle(0, 0, 3, 1, PALETTE.navy, 0.8).setOrigin(0.5, 0)
    this.closeButton = addButton(this, 'Leave (Esc)', 56, 14, () => this.back())
    this.backButton = addButton(this, 'Back (Esc)', 56, 14, () => this.back())
    this.confirmButton = addButton(this, 'Swap (Enter)', 76, 18, () => this.confirm())
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.dragging = this.step !== 'confirm'
      this.dragged = false
      this.dragStartY = pointer.y
      this.dragStartFirst = this.first
    })
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.dragging || !pointer.isDown) return
      const moved = (pointer.y - this.dragStartY) / this.cameras.main.zoom
      if (Math.abs(moved) > DRAG_UNITS) this.dragged = true
      if (this.dragged) this.scrollTo(this.dragStartFirst - Math.round(moved / ROW_H))
    })
    const stopDrag = () => {
      this.dragging = false
    }
    this.input.on('pointerup', stopDrag)
    this.input.on('pointerupoutside', stopDrag)
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
      if (this.step === 'confirm') return
      // Trackpads send many small deltas, so rows move once a full notch has gathered.
      this.wheel += dy / 100
      const whole = Math.trunc(this.wheel)
      if (whole === 0) return
      this.wheel -= whole
      this.scrollTo(this.first + whole)
    })
    onCanvasKey(this, (code, event) => {
      if (code === 'Tab' || code === 'Space' || code.startsWith('Arrow')) event.preventDefault()
      if (this.clock < INTRO_MS) return
      if (BACK_KEYS.has(code)) this.back()
      else if (this.step === 'confirm') {
        if (ACCEPT_KEYS.has(code)) this.confirm()
      } else if (UP_KEYS.has(code)) this.moveCursor(-1)
      else if (DOWN_KEYS.has(code)) this.moveCursor(1)
      else if (ACCEPT_KEYS.has(code)) this.choose(this.cursor)
    })
    this.say('open', 'Refine your data annotations.')
    this.status.setText('')
    this.rebuild()
    overlayView(this, (view) => {
      this.view = view
      this.layout()
    })
  }

  update(_time: number, delta: number) {
    this.clock += delta
    this.dim.setAlpha(Math.min(1, this.clock / INTRO_MS))
  }

  private get director() {
    return this.ctx.director
  }

  // SWATE answers with a line of the mood, or with `text` when one is given.
  private say(mood: SwateMood, text?: string) {
    this.line.setText(text ?? this.director?.swateLine(mood) ?? '')
    if (this.view) this.layout()
  }

  private createRow(): RowView {
    const row: RowView = {
      bg: this.add.rectangle(0, 0, 1, ROW_H - 2, PALETTE.blue, 0.22).setOrigin(0, 0).setVisible(false),
      marker: this.add.rectangle(0, 0, 4, ROW_H - 6, PALETTE.navy).setOrigin(0, 0).setVisible(false),
      title: addText(this, '', 8, { color: PALETTE.navy, bold: true }).setVisible(false),
      sub: addText(this, '', 6, { color: PALETTE.outline }).setVisible(false),
      cost: addText(this, '', 8, { bold: true }).setOrigin(1, 0.5).setStroke(NAVY, 2).setVisible(false),
      icon: this.add.sprite(0, 0, '__DEFAULT').setVisible(false),
      zone: this.add.zone(0, 0, 1, ROW_H),
    }
    const fragmentRef = fragmentArt(this)
    applySpriteRef(row.icon, fragmentRef)
    row.icon.setOrigin(0.5).setVisible(false)
    const slot = this.rows.length
    row.zone.setOrigin(0, 0)
    row.zone.on('pointerover', () => {
      if (this.clock < INTRO_MS) return
      this.cursor = this.first + slot
      this.render()
    })
    onClick(this, row.zone, () => {
      if (this.dragged || this.clock < INTRO_MS) return
      this.choose(this.first + slot)
    })
    return row
  }

  // Reads the build, the fragments and the swaps again and fills the list for the current step.
  private rebuild() {
    const director = this.director
    if (!director) return
    const left = director.swapsLeft(this.index)
    const entries: Entry[] = []
    if (this.step === 'pick') {
      const options = swateOptions(director.build, statStacks(director.levelHistory), director.fragments)
      for (const option of options) entries.push(this.pickEntry(option, left))
      for (const id of director.build.corrupted) {
        const augment = corruptedAugment(id)
        entries.push({
          id: `corrupted.${id}`,
          title: augment?.name ?? id,
          sub: 'Corrupted. Even SWATE cannot parse this.',
          detail: 'Corrupted augments come from the Datenkrake. SWATE has no column for them.',
          cost: null,
          color: CORRUPTED_GREY,
          enabled: false,
          reason: null,
        })
      }
    } else if (this.from) {
      const option = swateOptions(director.build, statStacks(director.levelHistory), director.fragments).find((entry) => entry.card.id === this.from?.id)
      for (const card of option?.replacements ?? []) {
        entries.push({ id: card.id, title: card.name, sub: card.description, detail: `${card.rarity} · ${card.description}`, cost: swapCost(card.rarity), color: RARITY_COLOR[card.rarity], enabled: true, reason: null })
      }
    }
    this.entries = entries
    this.cursor = Math.min(this.cursor, Math.max(0, entries.length - 1))
    this.purse.setText(String(director.fragments))
    const cost = (rarity: Rarity) => swapCost(rarity)
    if (this.step === 'pick') {
      this.hint.setText(`Swaps left: ${left} · a swap costs ${cost('common')} / ${cost('uncommon')} / ${cost('rare')} / ${cost('legendary')} fragments by rarity`)
      this.empty.setText('No augments to refine yet. Weapons are out of scope, and so is anything corrupted.')
    } else if (this.from) {
      this.hint.setText(`Swaps left: ${left} · swap ${this.from.name} for any other ${this.from.rarity} augment`)
      this.empty.setText('')
    }
    this.layout()
  }

  private pickEntry(option: SwateOption, left: number): Entry {
    const card = option.card
    const name = option.count > 1 ? `${card.name} x${option.count}` : card.name
    const base = { id: card.id, title: name, cost: option.cost, color: RARITY_COLOR[card.rarity], detail: `${card.rarity} · ${card.description}` }
    if (left <= 0) return { ...base, sub: 'No swaps left at this stop.', enabled: false, reason: 'spent' }
    if (option.state === 'nothing') return { ...base, sub: `Nothing else of rarity ${card.rarity} fits.`, enabled: false, reason: 'nothing' }
    if (option.state === 'poor') return { ...base, sub: `Costs ${option.cost} fragments. You have ${this.director?.fragments ?? 0}.`, enabled: false, reason: 'poor' }
    return { ...base, sub: card.description, enabled: true, reason: null }
  }

  private choose(index: number) {
    const entry = this.entries[index]
    if (this.clock < INTRO_MS || !entry || this.step === 'confirm') return
    if (!entry.enabled) {
      if (entry.reason) this.say(entry.reason)
      return
    }
    if (this.step === 'pick') {
      this.from = this.cardOf(entry.id)
      this.step = 'choose'
      this.cursor = 0
      this.first = 0
      this.status.setText('')
      this.rebuild()
      return
    }
    this.to = this.cardOf(entry.id)
    this.step = 'confirm'
    this.layout()
  }

  private cardOf(id: string): PowerUpCard | null {
    return CARDS.find((card) => card.id === id) ?? null
  }

  private confirm() {
    if (this.clock < INTRO_MS || this.step !== 'confirm' || !this.from || !this.to) return
    const from = this.from
    const to = this.to
    if (!this.ctx.gameplay?.refineCard(this.index, from.id, to.id)) {
      this.step = 'pick'
      this.say('poor')
      this.rebuild()
      return
    }
    this.step = 'pick'
    this.from = null
    this.to = null
    this.cursor = 0
    this.first = 0
    this.status.setText(`Refined: ${from.name} → ${to.name} (${swapCost(from.rarity)} fragments)`).setColor(GREEN)
    this.rebuild()
    this.say('swapped')
  }

  // Escape steps back, and leaves from the first step.
  private back() {
    if (this.clock < INTRO_MS) return
    if (this.step === 'confirm') this.step = 'choose'
    else if (this.step === 'choose') {
      this.step = 'pick'
      this.from = null
      this.cursor = 0
      this.first = 0
      this.status.setText('')
    } else {
      this.ctx.gameplay?.closeSwate()
      return
    }
    this.rebuild()
  }

  private moveCursor(by: number) {
    if (this.entries.length === 0) return
    this.cursor = Math.max(0, Math.min(this.entries.length - 1, this.cursor + by))
    if (this.cursor < this.first) this.first = this.cursor
    else if (this.cursor >= this.first + this.capacity) this.first = this.cursor - this.capacity + 1
    this.render()
  }

  private scrollTo(first: number) {
    const clamped = Math.max(0, Math.min(Math.max(0, this.entries.length - this.capacity), first))
    if (clamped === this.first) return
    this.first = clamped
    this.render()
  }

  private layout() {
    if (!this.view) return
    const { width: w, height: h } = this.view
    this.dim.setSize(w, h)
    const margin = Math.max(6, h * 0.025)
    const centre = w / 2
    const top = margin
    const confirming = this.step === 'confirm'
    const right = w - 8
    this.title.setPosition(centre, top + 11)
    this.purse.setPosition(right - 62, top + 11)
    this.purseIcon.setPosition(right - 62 - this.purse.width - 7, top + 11)
    this.closeButton.setVisible(this.step === 'pick')
    this.backButton.setVisible(this.step !== 'pick')
    this.closeButton.setPosition(right - 28, top + 11)
    this.backButton.setPosition(right - 28, top + 11)
    // SWATE and its speech bubble under the title.
    const swateH = Math.min(56, h * 0.17)
    const swateW = (swateH * SWATE_WIDTH) / SWATE_HEIGHT
    const bubbleW = Math.min(w - 16 - swateW - 8, 380)
    this.line.setWordWrapWidth(bubbleW - 14, true)
    const bubbleH = Math.max(swateH * 0.6, this.line.height + 10)
    const rowTop = top + 26
    const left = Math.max(8, centre - (swateW + 8 + bubbleW) / 2)
    this.swate.setDisplaySize(swateW, swateH).setPosition(left + swateW / 2, rowTop + Math.max(swateH, bubbleH))
    const bx = left + swateW + 8
    const by = rowTop + Math.max(0, (swateH - bubbleH) / 2)
    this.bubble.clear()
    drawScribbleBox(this.bubble, bx, by, bubbleW, bubbleH, 17)
    this.bubble.fillStyle(PALETTE.cream, 0.97).fillTriangle(bx + 1, by + bubbleH * 0.45, bx + 1, by + bubbleH * 0.75, bx - 6, by + bubbleH * 0.7)
    this.line.setPosition(bx + 7, by + (bubbleH - this.line.height) / 2)
    const below = rowTop + Math.max(swateH, bubbleH) + 6
    this.hint.setWordWrapWidth(w - 24).setPosition(centre, below)
    const statusTop = below + this.hint.height + 1
    this.status.setWordWrapWidth(w - 24).setPosition(centre, statusTop)
    const listTop = statusTop + (this.status.text ? this.status.height + 2 : 0) + 3
    const detailH = 16
    const listBottom = h - margin - detailH - 4
    const listW = Math.min(w - 16, MAX_LIST_W)
    const x = (w - listW) / 2
    this.capacity = Math.max(1, Math.floor((listBottom - listTop - 4) / ROW_H))
    const listH = confirming ? Math.min(listBottom - listTop, 92) : this.capacity * ROW_H + 4
    this.box = { x: x + 4, y: listTop + 2, w: listW - 8, h: this.capacity * ROW_H }
    drawScribbleBox(this.panel, x, listTop, listW, listH, 9)
    this.detail.setWordWrapWidth(listW).setPosition(centre, listBottom + 2)
    this.empty.setWordWrapWidth(listW - 24).setPosition(centre, listTop + listH / 2)
    this.ask.setWordWrapWidth(listW - 24).setPosition(centre, listTop + 28)
    this.confirmButton.setVisible(confirming)
    if (confirming) {
      const cost = this.from ? swapCost(this.from.rarity) : 0
      this.ask.setText(`Swap ${this.from?.name} → ${this.to?.name}\nfor ${cost} fragments?`)
      this.confirmButton.setPosition(centre - 44, listTop + listH - 20)
      this.backButton.setVisible(true)
      this.backButton.setPosition(centre + 44, listTop + listH - 20)
    }
    this.ask.setVisible(confirming)
    while (this.rows.length < this.capacity) this.rows.push(this.createRow())
    this.track.setPosition(x + listW - 4, listTop + 2).setSize(2, this.capacity * ROW_H)
    if (this.first > Math.max(0, this.entries.length - this.capacity)) this.first = Math.max(0, this.entries.length - this.capacity)
    this.render()
  }

  // Text and positions of the visible rows. Runs on a step, a cursor move, a scroll or a resize,
  // never per frame.
  private render() {
    if (!this.view) return
    const confirming = this.step === 'confirm'
    const { x, y, w } = this.box
    const textLeft = x + 9
    const room = w - 9 - COST_W - 10
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i]
      const entry = this.entries[this.first + i]
      const visible = !confirming && i < this.capacity && entry !== undefined
      for (const part of [row.marker, row.title, row.sub, row.cost, row.icon]) part.setVisible(visible)
      row.bg.setVisible(visible && this.first + i === this.cursor)
      if (!visible) {
        row.zone.disableInteractive()
        continue
      }
      const top = y + i * ROW_H
      const alpha = entry.enabled ? 1 : 0.5
      row.bg.setPosition(x, top + 1).setSize(w - 6, ROW_H - 2)
      row.marker.setPosition(x + 1, top + 3).setFillStyle(entry.color).setAlpha(alpha)
      row.title.setText(fitLine(entry.title, Math.floor(room / CHAR_W_TITLE))).setPosition(textLeft, top + 2).setAlpha(alpha)
      row.sub.setText(fitLine(entry.sub, Math.floor(room / CHAR_W_SUB))).setPosition(textLeft, top + 12).setAlpha(alpha)
      const showCost = entry.cost !== null
      row.cost.setVisible(showCost)
      row.icon.setVisible(showCost)
      if (showCost) {
        row.cost.setText(String(entry.cost)).setColor(entry.enabled ? GOLD : this.step === 'pick' && entry.reason === 'poor' ? RED : GREY).setPosition(x + w - 16, top + ROW_H / 2)
        row.icon.setPosition(x + w - 8, top + ROW_H / 2).setAlpha(alpha)
      }
      // The zone follows the row; it is switched, never removed, so Phaser keeps the hit area.
      row.zone.setPosition(x, top).setSize(w - 6, ROW_H)
      row.zone.setInteractive()
      // Phaser 4.2.1 ignores useHandCursor once the zone is interactive, so the cursor is set directly.
      if (row.zone.input) row.zone.input.cursor = entry.enabled ? 'pointer' : 'default'
    }
    const total = this.entries.length
    const scrolls = !confirming && total > this.capacity
    this.track.setVisible(scrolls)
    this.thumb.setVisible(scrolls)
    if (scrolls) {
      const trackH = this.capacity * ROW_H
      const thumbH = Math.max(10, (trackH * this.capacity) / total)
      const along = this.first / (total - this.capacity)
      this.thumb.setPosition(this.track.x, this.track.y + along * (trackH - thumbH)).setSize(3, thumbH)
    }
    this.empty.setVisible(!confirming && total === 0 && this.step === 'pick')
    const picked = this.entries[this.cursor]
    this.detail.setText(!confirming && picked ? fitLine(picked.detail, 120) : '')
    this.detail.setVisible(!confirming)
  }
}
