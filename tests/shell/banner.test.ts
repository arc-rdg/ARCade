import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mountArcadeBanner } from '../../src/index'

let host: HTMLElement

function sizeBoxes(width: number, height: number) {
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(width)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(height)
}

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
})

afterEach(() => {
  host.remove()
})

it('shows the ARCade logo on a tile with room for it', () => {
  sizeBoxes(320, 180)
  const banner = mountArcadeBanner(host)

  expect(host.textContent).toBe('ARCade')
  expect(host.querySelector('.arcade-icon-rocket')).toBeNull()
  banner.destroy()
})

it('falls back to the rocket icon on a very small tile', () => {
  sizeBoxes(96, 64)
  const banner = mountArcadeBanner(host)

  expect(host.querySelector('.arcade-icon-rocket')).not.toBeNull()
  expect(host.textContent).toBe('')
  banner.destroy()
})

it('removes itself and its stylesheet when destroyed, also twice', () => {
  const banner = mountArcadeBanner(host)
  expect(document.querySelectorAll('style[data-arcade]')).toHaveLength(1)

  banner.destroy()
  banner.destroy()

  expect(host.children).toHaveLength(0)
  expect(document.querySelectorAll('style[data-arcade]')).toHaveLength(0)
})
