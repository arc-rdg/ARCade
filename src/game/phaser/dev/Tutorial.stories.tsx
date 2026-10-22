import { ARC } from '@nfdi4plants/arctrl'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useRef } from 'react'
import { buildProvenanceIndex } from '../../../arc/provenance/buildIndex'
import { talinumArcJson } from '../../../storybook/fixtures/talinumArc'
import { loadBindings } from '../../model/input'
import { planRun } from '../../model/run'
import { createGame } from '../createGame'

const index = buildProvenanceIndex(ARC.fromROCrateJsonString(talinumArcJson))

// Boots the real game and opens the Training room. Settings and Back to menu have no screen to go
// to in this story, so only the finish card's Start run leaves the room.
function Training({ withPlan }: { withPlan: boolean }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const parent = host.current
    if (!parent) return
    const handle = createGame(parent, { bindings: loadBindings() })
    handle.send({ type: 'startTutorial', plan: withPlan ? planRun(index, 'Talinum', 'storybook') : null })
    const resizing = new ResizeObserver(() => handle.resize(parent.clientWidth, parent.clientHeight))
    resizing.observe(parent)
    return () => {
      resizing.disconnect()
      handle.destroy()
    }
  }, [withPlan])

  return <div ref={host} style={{ width: '100vw', height: '100dvh', overflow: 'hidden' }} />
}

const meta = {
  title: 'Game/Dev/Tutorial',
  component: Training,
  args: { withPlan: true },
  parameters: {
    layout: 'fullscreen',
    docs: { description: { component: 'The Training room with its twelve steps. Click the canvas if it has no keyboard focus.' } },
  },
} satisfies Meta<typeof Training>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

// Without a path the finish card has no Start run.
export const WithoutPlan: Story = { args: { withPlan: false } }
