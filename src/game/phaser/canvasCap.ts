// A box larger than this many canvas pixels is drawn smaller and scaled up by CSS, so a 4K
// fullscreen costs a weak GPU no more than a 1080p one.
export const MAX_CANVAS_WIDTH = 1920
export const MAX_CANVAS_HEIGHT = 1080

// The backing size for a box of the given CSS size. Aspect ratio is kept, so the camera zoom,
// which follows the canvas size, shows the same world as at full size. The cap is on the area of
// a 1920x1080 canvas, so a portrait box is not squeezed harder than a wide one.
export function cappedCanvasSize(width: number, height: number): { width: number; height: number } {
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  const factor = Math.min(1, Math.sqrt((MAX_CANVAS_WIDTH * MAX_CANVAS_HEIGHT) / (w * h)))
  return { width: Math.max(1, Math.round(w * factor)), height: Math.max(1, Math.round(h * factor)) }
}
