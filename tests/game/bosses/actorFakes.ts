// Minimal stand-ins for Phaser objects. Everything visual is a chainable no-op.
export function chain(): any {
  const fn: any = function () {}
  const proxy: any = new Proxy(fn, {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive) return () => 0
      if (prop === 'then') return undefined
      if (prop === 'scaleX' || prop === 'scaleY' || prop === 'zoom' || prop === 'alpha') return 1
      if (prop === 'width' || prop === 'height' || prop === 'x' || prop === 'y' || prop === 'now') return 0
      if (prop === 'input') return null
      return proxy
    },
    apply() {
      return proxy
    },
    construct() {
      return proxy
    },
  })
  return proxy
}

export class Rect {
  x = 0
  y = 0
  width = 0
  height = 0
  constructor(x = 0, y = 0, w = 0, h = 0) {
    this.setTo(x, y, w, h)
  }
  setTo(x: number, y: number, w: number, h: number) {
    this.x = x
    this.y = y
    this.width = w
    this.height = h
    return this
  }
  get centerX() {
    return this.x + this.width / 2
  }
  get centerY() {
    return this.y + this.height / 2
  }
  get left() {
    return this.x
  }
  get right() {
    return this.x + this.width
  }
  get top() {
    return this.y
  }
  get bottom() {
    return this.y + this.height
  }
}

export const PhaserFake = {
  Geom: { Rectangle: Rect, Intersects: { RectangleToRectangle: () => false } },
  Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } },
  TintModes: { ADD: 1, FILL: 2, MULTIPLY: 0 },
  Math: { Clamp: (v: number, a: number, b: number) => Math.min(b, Math.max(a, v)) },
}
