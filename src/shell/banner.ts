import mageUrl from '../game/assets/ARCMage.png'
import { h, rocketIcon } from './dom'
import { bannerFor, observeSize } from './layout'
import { scene, sparkle } from './scenery'
import { acquireStyles } from './styles'
import { loadTrimmedImage } from './trimmedImage'

// The banner of the compact ARCade tile: the start screen's hills, the mage and the logo, without
// the run controls. A tile too small for it shows the rocket icon instead. It fills its host.
export function mountArcadeBanner(el: HTMLElement): { destroy(): void } {
  const releaseStyles = acquireStyles(el.ownerDocument)
  const root = h('div', { class: 'arcade-root arcade-banner', 'aria-hidden': 'true' })
  el.append(root)

  let mage: string | null = null
  let size: ReturnType<typeof bannerFor> | null = null

  const render = () => {
    root.replaceChildren()
    // An unmeasured tile (no layout yet) keeps the icon.
    if (!size || size.tiny) {
      root.append(h('span', { class: 'arcade-banner-icon' }, rocketIcon()))
      return
    }
    const screen = h(
      'div',
      { class: 'arcade-screen', 'data-layout': 'compact', 'data-tall': size.tall, style: `--scale: ${size.scale}` },
      scene(),
      mage && h('div', { class: 'arcade-figure' }, h('span', { class: 'arcade-hill' }), h('img', { class: 'arcade-mage', src: mage, alt: '' }), sparkle()),
      h('div', { class: 'arcade-content' }, h('span', { class: 'arcade-logo' }, 'ARC', h('span', { class: 'arcade-logo-tail' }, 'ade'))),
    )
    root.append(screen)
  }
  render()

  const stopLoading = loadTrimmedImage(mageUrl, (trimmed) => {
    mage = trimmed
    render()
  })
  const stopObserving = observeSize(root, (width, height, em) => {
    const next = bannerFor(width, height, em)
    if (size && size.width === width && size.height === height && size.tiny === next.tiny) return
    size = next
    render()
  })

  let destroyed = false
  return {
    destroy() {
      if (destroyed) return
      destroyed = true
      stopLoading()
      stopObserving()
      root.remove()
      releaseStyles()
    },
  }
}
