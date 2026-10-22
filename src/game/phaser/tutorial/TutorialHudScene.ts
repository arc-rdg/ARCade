import Phaser from 'phaser'
import { PALETTE, SCENE } from '../../contracts/constants'
import { bindingLabel } from '../../model/input'
import type { RunContext, TutorialHud } from '../scenes/context'
import { drawScribbleBox } from '../scenes/panelFrame'
import { addButton, addText, overlayView, type Button } from '../scenes/ui'
import type { View } from '../view'

const MAX_LINES = 3
const CARD = { maxWidth: 300, margin: 8, top: 8, pad: 8, header: 13, lineGap: 3, tick: 7 }
const FLASH_FILL = 0xd6f2e8
const BUTTON = { w: 130, h: 22, gap: 6 }
const SKIP = { w: 38, h: 13 }

type Step = Parameters<TutorialHud['showStep']>[0]

// The Training room's screen: the step card at the top, the pause card and the finish card. The
// room tells it what to show. Texts are set only when they change.
export class TutorialHudScene extends Phaser.Scene implements TutorialHud {
  private readonly ctx: RunContext
  private view: View = { zoom: 1, width: 480, height: 360 }
  private step: Step = null
  private pauseOn = false
  private canSkip = false
  private finishOn = false
  private canStartRun = false
  private overWidgets = 0

  private cardBox!: Phaser.GameObjects.Graphics
  private ticks!: Phaser.GameObjects.Graphics
  private header!: Phaser.GameObjects.Text
  private lineTexts: Phaser.GameObjects.Text[] = []
  private skip!: Button
  private dim!: Phaser.GameObjects.Rectangle
  private pauseTitle!: Phaser.GameObjects.Text
  private pauseButtons!: { resume: Button; skip: Button; settings: Button; menu: Button }
  private finishBox!: Phaser.GameObjects.Graphics
  private finishTitle!: Phaser.GameObjects.Text
  private finishLine!: Phaser.GameObjects.Text
  private finishButtons!: { start: Button; practise: Button; menu: Button }

  constructor(ctx: RunContext) {
    super(SCENE.tutorialHud)
    this.ctx = ctx
  }

  create() {
    this.step = null
    this.pauseOn = false
    this.finishOn = false
    this.overWidgets = 0
    this.lineTexts = []
    const room = () => this.ctx.tutorial
    // A click on a widget must not also start an attack when the world runs again.
    const hover = (over: boolean) => {
      this.overWidgets = Math.max(0, this.overWidgets + (over ? 1 : -1))
      room()?.captureMouse(this.overWidgets > 0)
    }

    this.cardBox = this.add.graphics()
    this.ticks = this.add.graphics()
    this.header = addText(this, '', 8, { color: PALETTE.navy, bold: true })
    for (let i = 0; i < MAX_LINES; i++) this.lineTexts.push(addText(this, '', 7, { color: PALETTE.navy }))
    this.skip = addButton(this, 'Skip', SKIP.w, SKIP.h, () => room()?.skipStep(), hover)

    this.dim = this.add.rectangle(0, 0, 1, 1, PALETTE.navy, 0.55).setOrigin(0, 0)
    this.pauseTitle = addText(this, 'Paused', 16, { bold: true }).setOrigin(0.5)
    this.pauseButtons = {
      resume: addButton(this, 'Resume', BUTTON.w, BUTTON.h, () => room()?.resume(), hover),
      skip: addButton(this, 'Skip step', BUTTON.w, BUTTON.h, () => room()?.skipStep(), hover),
      settings: addButton(this, 'Settings', BUTTON.w, BUTTON.h, () => this.ctx.requestSettings(), hover),
      menu: addButton(this, 'Back to menu', BUTTON.w, BUTTON.h, () => this.ctx.quitToMenu(), hover),
    }
    this.finishBox = this.add.graphics()
    this.finishTitle = addText(this, 'Training done', 12, { color: PALETTE.navy, bold: true }).setOrigin(0.5, 0)
    this.finishLine = addText(this, '', 7, { color: PALETTE.navy, align: 'center', wrap: 200 }).setOrigin(0.5, 0)
    this.finishButtons = {
      start: addButton(this, 'Start run', BUTTON.w, BUTTON.h, () => room()?.startRun(), hover),
      practise: addButton(this, 'Keep practising', BUTTON.w, BUTTON.h, () => room()?.keepPracticing(), hover),
      menu: addButton(this, 'Back to menu', BUTTON.w, BUTTON.h, () => this.ctx.quitToMenu(), hover),
    }

    overlayView(this, (view) => {
      this.view = view
      this.render()
    })
    this.ctx.tutorialHud = this
    this.events.once('shutdown', () => {
      if (this.ctx.tutorialHud === this) this.ctx.tutorialHud = null
    })
    this.ctx.tutorial?.refreshHud()
  }

  showStep(step: Step) {
    this.step = step
    this.renderCard()
  }

  showPause(visible: boolean, canSkip: boolean) {
    this.pauseOn = visible
    this.canSkip = canSkip
    this.overWidgets = 0
    this.render()
  }

  showFinish(visible: boolean, canStartRun: boolean) {
    this.finishOn = visible
    this.canStartRun = canStartRun
    this.overWidgets = 0
    this.render()
  }

  private render() {
    this.renderCard()
    this.renderPause()
    this.renderFinish()
  }

  private renderCard() {
    const step = this.step
    const lines = this.lineTexts
    if (!step) {
      this.cardBox.clear()
      this.ticks.clear()
      this.header.setVisible(false)
      for (const text of lines) text.setVisible(false)
      this.skip.setVisible(false)
      return
    }
    const { width: w } = this.view
    const cardW = Math.min(w - 2 * CARD.margin, CARD.maxWidth)
    const x = (w - cardW) / 2
    const textX = x + CARD.pad + CARD.tick + 5
    const wrap = cardW - (textX - x) - CARD.pad
    this.header.setText(`${step.index + 1}/${step.total}  ${step.title}`).setPosition(x + CARD.pad, CARD.top + 5).setVisible(true)
    let y = CARD.top + CARD.header + 6
    this.ticks.clear()
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i]
      const line = step.lines[i]
      if (line === undefined) {
        text.setVisible(false)
        continue
      }
      if (text.text !== line) text.setText(line)
      text.setWordWrapWidth(wrap, true).setPosition(textX, y).setVisible(true)
      const done = step.ticks[i] === true
      this.ticks.lineStyle(1, PALETTE.navy, 1).strokeRect(x + CARD.pad, y + 1, CARD.tick, CARD.tick)
      if (done) {
        this.ticks.lineStyle(1.6, PALETTE.teal, 1).beginPath()
        this.ticks.moveTo(x + CARD.pad + 1.2, y + 4.6).lineTo(x + CARD.pad + 3, y + 7).lineTo(x + CARD.pad + CARD.tick + 1.4, y - 1.4).strokePath()
      }
      y += text.height + CARD.lineGap
    }
    const cardH = y - CARD.top + CARD.pad - CARD.lineGap
    drawScribbleBox(this.cardBox, x, CARD.top, cardW, cardH, 3, step.flash ? FLASH_FILL : PALETTE.cream)
    this.skip.setPosition(x + cardW - SKIP.w / 2 - CARD.pad, CARD.top + 4 + SKIP.h / 2)
    this.skip.setVisible(!step.flash)
  }

  private renderPause() {
    const { width: w, height: h } = this.view
    const on = this.pauseOn
    this.dim.setVisible(on || this.finishOn).setSize(w, h)
    this.pauseTitle.setVisible(on).setPosition(w / 2, h / 2 - 48)
    const { resume, skip, settings, menu } = this.pauseButtons
    const shown = [resume, ...(this.canSkip ? [skip] : []), settings, menu]
    for (const button of [resume, skip, settings, menu]) button.setVisible(on && shown.includes(button))
    if (!on) return
    shown.forEach((button, i) => button.setPosition(w / 2, h / 2 - 14 + i * (BUTTON.h + BUTTON.gap)))
  }

  private renderFinish() {
    const { width: w, height: h } = this.view
    const on = this.finishOn
    this.finishBox.clear()
    this.finishTitle.setVisible(on)
    this.finishLine.setVisible(on)
    const { start, practise, menu } = this.finishButtons
    start.setVisible(on && this.canStartRun)
    practise.setVisible(on)
    menu.setVisible(on)
    if (!on) return
    const keys = (['ability1', 'ability2', 'ability3', 'ability4'] as const)
      .map((action) => this.ctx.bindings[action][0])
      .filter((binding) => binding !== undefined)
      .map(bindingLabel)
    const line = keys.length > 0 ? `Level-up cards can add abilities on ${keys.length > 1 ? `${keys.slice(0, -1).join(', ')} and ${keys[keys.length - 1]}` : keys[0]}.` : ''
    if (this.finishLine.text !== line) this.finishLine.setText(line)
    const buttons = this.canStartRun ? 3 : 2
    const boxW = 230
    const boxH = 44 + (line ? this.finishLine.height + 8 : 0) + buttons * (BUTTON.h + BUTTON.gap) + 6
    const top = Math.max(8, (h - boxH) / 2)
    drawScribbleBox(this.finishBox, (w - boxW) / 2, top, boxW, boxH, 7)
    this.finishTitle.setPosition(w / 2, top + 10)
    let y = top + 32
    if (line) {
      this.finishLine.setPosition(w / 2, y)
      y += this.finishLine.height + 10
    }
    for (const button of this.canStartRun ? [start, practise, menu] : [practise, menu]) {
      button.setPosition(w / 2, y + BUTTON.h / 2)
      y += BUTTON.h + BUTTON.gap
    }
  }
}
