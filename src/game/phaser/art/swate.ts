import type Phaser from 'phaser'
import type { SpriteRef } from '../../contracts/art'
import { PALETTE } from '../../contracts/constants'
import { spriteFrom } from './atlas'
import { metal } from './looks'
import { cssColor } from './palette'

// SWATE (deprecated) of the waystation: an annotation table that grew legs, drawn after the real
// editor. A white spreadsheet with a bold header row (Input, Protocol, Output) and numbered rows,
// two "F2" key chips as eyes, a term dropdown (bold name left, underlined accession right) as the
// mouth, a hot-pink close button on top, a row of black toolbar buttons, a term-search magnifier in
// one hand and a name tag where "deprecated" is struck out, with a teal ARCitISA badge slapped on.
// Every position is a constant of the block below, so the picture is easy to adjust. Drawn once and
// cached like every other scribble texture, with the usual boiling variants.

const NAVY = cssColor(PALETTE.navy)
const INK = '#18181b'
const TEAL = '#1fc2a5'
const TEAL_LIGHT = '#c8f0e8'
const SLATE = '#2b3547'
const PINK = '#ff5c7a'
const PANEL = '#eeeeee'
const GRID = '#9aa3ad'
const RED = '#d9534f'

// The picture is drawn on a 72 x 76 sheet and shown this much bigger, so it stands about 1.6 times
// as tall as the mage's stall is wide. The texture has 4 canvas pixels per world unit, so the name
// sign stays sharp when the camera zooms in.
const SHEET = { w: 72, h: 76 }
const GROW = 1.5
const TEXTURE_PIXELS = 4
export const SWATE_WIDTH = SHEET.w * GROW
export const SWATE_HEIGHT = SHEET.h * GROW

// The table, in units of the sprite: its top left, the width of the row-number column and of each
// data column, and the height of the header and of each row.
const TABLE = { x: 6, y: 12, index: 6, col: 14, header: 9, row: 9, rows: 3, columns: 3 }
const TABLE_W = TABLE.index + TABLE.col * TABLE.columns
const TABLE_H = TABLE.header + TABLE.row * TABLE.rows
const HEADERS: readonly (readonly string[])[] = [['Input', '[Source]'], ['Protocol', 'Uri'], ['Output', '[Sample]']]

export function swateArt(scene: Phaser.Scene): SpriteRef {
  const h = SHEET.h
  const { x: left, y: top } = TABLE
  const right = left + TABLE_W
  const bottom = top + TABLE_H
  const colX = (i: number) => left + TABLE.index + TABLE.col * i
  const rowY = (i: number) => top + TABLE.header + TABLE.row * i
  return spriteFrom(scene, {
    key: 'scribble:swate',
    width: SWATE_WIDTH,
    height: SWATE_HEIGHT,
    scale: TEXTURE_PIXELS,
    anchors: { weapon: { x: 0, y: -SWATE_HEIGHT / 2 }, head: { x: 0, y: -SWATE_HEIGHT + 9 } },
    draw(pen) {
      pen.ctx.save()
      pen.ctx.scale(GROW, GROW)
      // Two stubby legs in teal sneakers.
      for (const x of [24, 38]) {
        pen.line(x, bottom + 14, x, h - 4, { line: NAVY, weight: 1.4, rough: 0.3 })
        pen.ellipse(x + (x < 31 ? -2 : 2), h - 3, 9, 4, { tint: TEAL, weight: 0.8, rough: 0.3 })
      }
      // The toolbar above the table: undo and four black rounded buttons.
      pen.rect(left, 2, 6, 7, { tint: PANEL, weight: 0.6, rough: 0.3 })
      for (let i = 0; i < 3; i++) pen.rect(left + 8 + i * 7, 2, 6, 7, { tint: INK, weight: 0.6, rough: 0.3 })
      pen.dot(left + 11, 5.5, 1.1, '#ffffff')
      pen.dot(left + 18, 5.5, 1.1, '#ffffff')
      pen.dot(left + 25, 5.5, 1.1, '#ffffff')
      // The table: white, a teal frame, a bold header row and numbered rows.
      pen.rect(left, top, TABLE_W, TABLE_H, { tint: '#ffffff', line: TEAL, weight: 1.2, rough: 0.5 })
      pen.rect(left, top, TABLE_W, TABLE.header, { tint: PANEL, weight: 0.8, rough: 0.3 })
      for (let i = 0; i < TABLE.columns; i++) pen.line(colX(i), top, colX(i), bottom, { line: GRID, weight: 0.6, rough: 0.3 })
      for (let i = 0; i < TABLE.rows; i++) pen.line(left, rowY(i), right, rowY(i), { line: GRID, weight: 0.6, rough: 0.3 })
      for (let i = 0; i < TABLE.columns; i++) pen.text(HEADERS[i], colX(i) + TABLE.col / 2, top + TABLE.header / 2, 2.6, TABLE.col - 2, 0, INK)
      for (let i = 0; i < TABLE.rows; i++) pen.text([String(i + 1)], left + TABLE.index / 2, rowY(i) + TABLE.row / 2, 3.4, TABLE.index - 2, 0, RED)
      // Eyes: two "F2" key chips with a pupil each, looking at the mage.
      for (const i of [0, 2]) {
        const cx = colX(i) + TABLE.col / 2
        const cy = rowY(0) + TABLE.row / 2
        pen.rect(cx - 5.5, cy - 3.5, 11, 7, { tint: '#f4f4f5', weight: 0.8, rough: 0.2 })
        pen.text(['F2'], cx - 1.6, cy, 3.4, 6, 0, INK)
        pen.dot(cx + 3, cy + 0.4, 1.3)
      }
      // Mouth: the term dropdown under the cells, bold term left and the accession underlined right.
      const mx = colX(0) + 0.5
      const my = rowY(1) + 1.5
      const mw = TABLE.col * 3 - 1
      pen.rect(mx, my, mw, 12, { tint: '#ffffff', weight: 1, rough: 0.3 })
      const terms: readonly (readonly [string, string])[] = [['Arabidopsis', 'C:33292'], ['A. thaliana', 'NCBITAXON:3702']]
      terms.forEach(([name, accession], i) => {
        const y = my + 3.2 + i * 5.6
        pen.text([name], mx + 7.8, y, 2.9, 14, 0, INK)
        pen.text([accession], mx + mw - 8.5, y, 2.5, 15, 0, TEAL)
        pen.line(mx + mw - 15.5, y + 1.8, mx + mw - 1.5, y + 1.8, { line: TEAL, weight: 0.4, rough: 0.1 })
      })
      // A hot-pink close button on top like a hat.
      pen.poly([[right - 8, top - 8], [right + 1, top - 10], [right + 2, top - 1], [right - 7, top + 1]], { tint: PINK, weight: 0.8, rough: 0.3 })
      pen.line(right - 5.2, top - 6.4, right - 1.6, top - 3, { line: '#ffffff', weight: 0.9, rough: 0.1 })
      pen.line(right - 1.8, top - 7, right - 5, top - 2.8, { line: '#ffffff', weight: 0.9, rough: 0.1 })
      // The term-search magnifier in a raised hand.
      pen.line(right, rowY(1) + 6, right + 5, rowY(0), { line: NAVY, weight: 1.2, rough: 0.3 })
      pen.line(right + 5, rowY(0), right + 9, top + 4, { ...metal, line: NAVY, weight: 1.6, rough: 0.3 })
      pen.ellipse(right + 10.5, top - 1, 10, 10, { tint: '#e8f6ff', hatch: '#4baed6', gap: 2, weight: 1.1, rough: 0.3 })
      pen.line(right + 8, top - 4, right + 9.8, top - 5.4, { line: '#ffffff', weight: 0.8, rough: 0.1 })
      // The name tag on a lanyard: SWATE in big bold letters, a red DEPRECATED stamp under it.
      pen.trace([[left + TABLE_W * 0.3, bottom], [left + TABLE_W * 0.5, bottom + 4], [left + TABLE_W * 0.7, bottom]], { line: TEAL, weight: 0.8, rough: 0.2 })
      const tagY = bottom + 3
      const midX = left + TABLE_W / 2
      pen.rect(left + 1, tagY, TABLE_W - 2, 15, { tint: '#fffdf6', weight: 1, rough: 0.3 })
      pen.text(['SWATE'], midX, tagY + 4.8, 8, TABLE_W - 8, 0, NAVY)
      pen.at(midX, tagY + 11.2, -0.07, () => {
        pen.rect(-17, -2.8, 34, 5.6, { line: RED, weight: 1.1, rough: 0.3 })
        pen.text(['DEPRECATED'], 0, 0.1, 4.2, 31, 0, RED)
      })
      // The ARCitISA badge beside the legs, clear of the name.
      pen.poly([[right - 10, h - 11], [right + 15, h - 13], [right + 16, h - 4], [right - 9, h - 2]], { tint: SLATE, line: TEAL, weight: 0.9, rough: 0.3 })
      pen.text(['ARCitISA'], right + 3, h - 7.5, 4.6, 24, -0.07, TEAL_LIGHT)
      pen.ctx.restore()
    },
  })
}
