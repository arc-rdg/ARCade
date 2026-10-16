import rough from 'roughjs'
import type { RoughCanvas } from 'roughjs/bin/canvas'
import { PALETTE } from '../../contracts/constants'
import type { CursorKind } from '../../model/input/cursor'
import { artContext } from '../art/canvas'
import { cssColor } from '../color'

// The cursors, drawn once with roughjs at 32 px and again at 64 px for sharp screens, then kept as
// CSS values. Browsers ignore a cursor image larger than 32 px on some systems, so the 1x image
// stays at 32.

const SIZE = 32
const INK = cssColor(PALETTE.outline)
const CREAM = cssColor(PALETTE.cream)
const BLUE = cssColor(PALETTE.blue)
const YELLOW = cssColor(PALETTE.yellow)
const STEEL = '#dde6ee'
const RED = '#e0533d'
const DOUGH = '#d9a25f'
const CHIP = '#5b3a1e'

interface Shape {
  draw(rc: RoughCanvas): void
  // The pixel that points, in 1x units.
  hotspot: readonly [number, number]
  // What a browser without the image falls back to.
  fallback: string
}

type Pt = [number, number]

function poly(rc: RoughCanvas, points: Pt[], fill: string, width = 2, seed = 1) {
  rc.polygon(points, { stroke: INK, strokeWidth: width, fill, fillStyle: 'solid', roughness: 0.9, seed })
}

// A line drawn twice: a wide ink stroke and a narrower colour on top, so it reads on any floor.
function inked(draw: (options: { stroke: string; strokeWidth: number; seed: number }) => void, color: string, width: number, seed: number) {
  draw({ stroke: INK, strokeWidth: width + 2.5, seed })
  draw({ stroke: color, strokeWidth: width, seed })
}

const SHAPES: Record<Exclude<CursorKind, 'none'>, Shape> = {
  arrow: {
    hotspot: [4, 3],
    fallback: 'default',
    draw: (rc) =>
      poly(
        rc,
        [[4, 3], [4, 24], [10, 19], [14, 28], [18, 26], [14, 17], [22, 17]],
        CREAM,
      ),
  },
  sword: {
    hotspot: [3, 3],
    fallback: 'crosshair',
    draw: (rc) => {
      poly(rc, [[3, 3], [8, 3.5], [24, 19], [20, 23], [3.5, 8]], STEEL, 2, 3)
      rc.line(17, 20, 24, 13, { stroke: INK, strokeWidth: 3, seed: 2 })
      poly(rc, [[16, 24], [24, 16], [27, 19], [19, 27]], YELLOW, 1.8, 4)
      rc.line(24, 24, 29, 29, { stroke: INK, strokeWidth: 3, seed: 5 })
    },
  },
  starCross: {
    hotspot: [16, 16],
    fallback: 'crosshair',
    draw: (rc) => {
      poly(rc, [[16, 2], [19, 13], [30, 16], [19, 19], [16, 30], [13, 19], [2, 16], [13, 13]], BLUE, 2, 3)
      rc.circle(16, 16, 4, { stroke: INK, strokeWidth: 1.4, fill: CREAM, fillStyle: 'solid', seed: 4 })
    },
  },
  cookie: {
    hotspot: [16, 16],
    fallback: 'default',
    draw: (rc) => {
      rc.circle(16, 16, 24, { stroke: INK, strokeWidth: 2.4, fill: DOUGH, fillStyle: 'solid', seed: 2 })
      for (const [x, y] of [[11, 11], [19, 14], [13, 20], [21, 22], [8, 17]]) rc.circle(x, y, 3.4, { stroke: INK, strokeWidth: 1, fill: CHIP, fillStyle: 'solid', seed: x })
    },
  },
  glove: {
    hotspot: [11, 3],
    fallback: 'pointer',
    draw: (rc) => {
      poly(rc, [[9, 3], [13, 3], [13, 13], [15, 11], [19, 11.5], [20, 13.5], [24, 14], [25, 17], [24, 26], [11, 27], [6, 17], [8, 15], [9, 18]], CREAM, 2, 7)
      rc.line(16, 17, 16, 23, { stroke: INK, strokeWidth: 1.3, seed: 2 })
      rc.line(20, 17, 20, 23, { stroke: INK, strokeWidth: 1.3, seed: 3 })
    },
  },
  disabled: {
    hotspot: [16, 16],
    fallback: 'not-allowed',
    draw: (rc) => {
      inked((o) => rc.circle(16, 16, 22, o), RED, 2.4, 1)
      inked((o) => rc.line(8.5, 23.5, 23.5, 8.5, o), RED, 2.4, 2)
    },
  },
  openHand: {
    hotspot: [16, 14],
    fallback: 'grab',
    draw: (rc) =>
      poly(
        rc,
        [[8, 15], [8, 8], [11, 8], [11, 13], [11, 4], [14, 4], [14, 12], [14, 3], [17, 3], [17, 12], [17, 5], [20, 5], [20, 14], [24, 12], [25, 15], [23, 25], [12, 26], [8, 19]],
        CREAM,
        2,
        9,
      ),
  },
  closedHand: {
    hotspot: [16, 16],
    fallback: 'grabbing',
    // A fist: four knuckles on top, the fingers curled in front, the thumb across them.
    draw: (rc) => {
      poly(rc, [[6, 17], [7, 12], [10, 9.5], [12.5, 11], [14, 8.5], [17, 8.5], [19, 10], [21.5, 9.5], [24.5, 11.5], [26, 17], [24, 26], [11, 27], [6.5, 22]], CREAM, 2.2, 9)
      for (const x of [12.5, 16.5, 20.5]) rc.line(x, 12, x, 18, { stroke: INK, strokeWidth: 1.6, seed: x })
      rc.line(8, 20, 15, 20, { stroke: INK, strokeWidth: 1.8, seed: 3 })
    },
  },
  magnifier: {
    hotspot: [13, 13],
    fallback: 'zoom-in',
    draw: (rc) => {
      rc.circle(13, 13, 16, { stroke: INK, strokeWidth: 3, fill: 'rgba(75,174,214,0.45)', fillStyle: 'solid', seed: 2 })
      rc.line(19, 19, 28, 28, { stroke: INK, strokeWidth: 4.5, seed: 3 })
    },
  },
}

export const DRAWN_KINDS = Object.keys(SHAPES) as (keyof typeof SHAPES)[]

// Where a cursor points, in 1x units, and the keyword a browser falls back to. The shell cursors
// are baked from the same table (scripts/render-cursors.mjs).
export function cursorSpec(kind: keyof typeof SHAPES): { hotspot: readonly [number, number]; fallback: string } {
  return { hotspot: SHAPES[kind].hotspot, fallback: SHAPES[kind].fallback }
}

// Draws a cursor on a canvas of any square size, scaled from the 32 px design.
export function drawCursor(kind: keyof typeof SHAPES, canvas: HTMLCanvasElement): void {
  const ctx = artContext(canvas)
  if (!ctx) return
  ctx.scale(canvas.width / SIZE, canvas.width / SIZE)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  SHAPES[kind].draw(rough.canvas(canvas))
}

function imageUrl(kind: keyof typeof SHAPES, size: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  drawCursor(kind, canvas)
  return canvas.toDataURL('image/png')
}

// How the 1x and 2x images go into the CSS value. Browsers differ: some read the standard
// image-set(), some only the prefixed one, and one that does not know the function drops the whole
// declaration, so each form is tried before use.
export type CursorFormat = 'image-set' | '-webkit-image-set' | 'url'

const FORMATS: readonly CursorFormat[] = ['image-set', '-webkit-image-set', 'url']

export function cursorValue(format: CursorFormat, url1: string, url2: string, hotspot: readonly [number, number], fallback: string): string {
  const at = `${hotspot[0]} ${hotspot[1]}`
  if (format === 'url') return `url("${url1}") ${at}, ${fallback}`
  return `${format}(url("${url1}") 1x, url("${url2}") 2x) ${at}, ${fallback}`
}

function accepts(value: string): boolean {
  const probe = document.createElement('div')
  probe.style.cursor = value
  return probe.style.cursor !== ''
}

export interface CursorSet {
  format: CursorFormat
  css: Record<CursorKind, string>
}

// Draws every cursor. Runs once per game.
export function buildCursorSet(): CursorSet {
  const images = {} as Record<keyof typeof SHAPES, [string, string]>
  for (const kind of DRAWN_KINDS) images[kind] = [imageUrl(kind, SIZE), imageUrl(kind, SIZE * 2)]
  const arrow = SHAPES.arrow
  const format = FORMATS.find((f) => accepts(cursorValue(f, images.arrow[0], images.arrow[1], arrow.hotspot, arrow.fallback))) ?? 'url'
  const css = { none: 'none' } as Record<CursorKind, string>
  for (const kind of DRAWN_KINDS) css[kind] = cursorValue(format, images[kind][0], images[kind][1], SHAPES[kind].hotspot, SHAPES[kind].fallback)
  return { format, css }
}
