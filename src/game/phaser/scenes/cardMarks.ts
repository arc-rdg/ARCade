import type Phaser from 'phaser'
import { PALETTE } from '../../contracts/constants'
import type { WeaponRelation } from '../../model/progression'
import { cssColor } from '../color'
import { fitText } from './cardFace'
import { addText } from './ui'

const NAVY = cssColor(PALETTE.navy)

// The marks of a weapon card that upgrades or replaces the weapon in its slot: a pulsing outline,
// the UPGRADE ribbon and a tag under the card. The parts go into the card's container as extras.
export interface CardMarks {
  ring: Phaser.GameObjects.Graphics
  ribbon: Phaser.GameObjects.Text
  tag: Phaser.GameObjects.Text
}

export function createCardMarks(scene: Phaser.Scene): CardMarks {
  const ring = scene.add.graphics().setVisible(false)
  const ribbon = addText(scene, 'UPGRADE', 6.5, { color: PALETTE.navy, bold: true, align: 'center' }).setOrigin(0.5).setVisible(false)
  const tag = addText(scene, '', 5.8, { align: 'center' }).setOrigin(0.5, 0).setStroke(NAVY, 2).setVisible(false)
  return { ring, ribbon, tag }
}

// Draws the marks for a card `w` by `h` at scale `s`. `label` is the tag text, empty for none.
// `tagHeight` caps the tag's height in scale units, so a store can keep it to one line.
// Call it when the offer or the size changes, never per frame.
export function decorateCardMarks(marks: CardMarks, relation: WeaponRelation, label: string, w: number, h: number, s: number, tagHeight = 14): void {
  const upgrade = relation.kind === 'upgrade'
  marks.ring.clear().setVisible(upgrade)
  marks.ribbon.setVisible(upgrade)
  if (upgrade) {
    marks.ring.lineStyle(Math.max(2, 3 * s), PALETTE.teal, 1).strokeRect(-w / 2 - 1, -h / 2 - 1, w + 2, h + 2)
    marks.ring.lineStyle(Math.max(1, 1.2 * s), PALETTE.yellow, 1).strokeRect(-w / 2 - 4 * s, -h / 2 - 4 * s, w + 8 * s, h + 8 * s)
    marks.ribbon
      .setFontSize(6.5 * s)
      .setBackgroundColor(cssColor(PALETTE.yellow))
      .setPadding(4 * s, 1.5 * s, 4 * s, 1.5 * s)
      .setPosition(0, -h / 2)
  }
  marks.tag.setVisible(label !== '')
  if (label === '') return
  marks.tag.setPosition(0, h / 2 + 3 * s).setColor(cssColor(upgrade ? PALETTE.yellow : PALETTE.cream))
  fitText(marks.tag, label, w * 1.05, tagHeight * s, 5.8 * s, 4.2 * s)
}

// The outline breathes; the phase differs per card.
export function pulseCardMarks(marks: CardMarks, clock: number, phase: number): void {
  if (marks.ring.visible) marks.ring.setAlpha(0.4 + 0.6 * (0.5 + 0.5 * Math.sin(clock / 170 + phase)))
}
