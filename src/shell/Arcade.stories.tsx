import { ARC } from '@nfdi4plants/arctrl'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useRef, type CSSProperties } from 'react'
import { buildProvenanceIndex } from '../arc/provenance/buildIndex'
import { mountArcade, mountArcadeBanner, type ArcadeProvenance } from '../index'
import { talinumArcJson } from '../storybook/fixtures/talinumArc'

const talinum: ArcadeProvenance = buildProvenanceIndex(ARC.fromROCrateJsonString(talinumArcJson))
const empty: ArcadeProvenance = { datasets: [], processes: [], rows: [], nodes: [] }

interface ArcadeStoryProps {
  provenance: 'talinum' | 'empty'
  title: string
  seed?: string
  autoStart?: boolean
  fullscreen?: boolean
  width: string
  height: string
}

// The host gives the size, so every story is a plain box and the arcade fills it.
function ArcadeBox({ provenance, title, seed, autoStart, fullscreen, width, height }: ArcadeStoryProps) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = host.current
    if (!element) return
    const handle = mountArcade(element, {
      title,
      provenance: provenance === 'talinum' ? talinum : empty,
      seed,
      autoStart,
      fullscreen,
    })
    return () => handle.destroy()
  }, [provenance, title, seed, autoStart, fullscreen])
  const style: CSSProperties = { width, height, outline: '1px dashed #999' }
  return <div ref={host} style={style} />
}

function BannerBox({ width, height }: { width: string; height: string }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = host.current
    if (!element) return
    const banner = mountArcadeBanner(element)
    return () => banner.destroy()
  }, [])
  return <div ref={host} style={{ width, height, outline: '1px dashed #999' }} />
}

const meta = {
  title: 'Shell/Arcade',
  component: ArcadeBox,
  args: { provenance: 'talinum', title: 'Facultative CAM in Talinum', fullscreen: true, width: '100vw', height: '100vh' },
  argTypes: { provenance: { control: 'inline-radio', options: ['talinum', 'empty'] } },
} satisfies Meta<typeof ArcadeBox>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Phone: Story = { args: { width: '390px', height: '844px' } }

export const PortraitTablet: Story = { args: { width: '768px', height: '1024px' } }

export const Desktop: Story = { args: { width: '1440px', height: '900px' } }

// A tile too small for the controls gets the compact title card.
export const CompactTile: Story = { args: { width: '280px', height: '200px' } }

// A narrow, tall box (a phone popup) still shows the logo, the quest and the buttons without scrolling.
export const NarrowTall: Story = { args: { width: '280px', height: '710px' } }

export const FixedSeed: Story = { args: { seed: 'talinum1' } }

export const AutoStart: Story = { args: { autoStart: true, seed: 'talinum1' } }

export const WithoutFullscreenButton: Story = { args: { fullscreen: false } }

export const NoProvenance: Story = { args: { provenance: 'empty', title: 'Empty ARC' } }

export const Banner: StoryObj<typeof BannerBox> = {
  render: (args) => <BannerBox {...args} />,
  args: { width: '320px', height: '180px' },
}

export const BannerTiny: StoryObj<typeof BannerBox> = {
  render: (args) => <BannerBox {...args} />,
  args: { width: '96px', height: '64px' },
}
