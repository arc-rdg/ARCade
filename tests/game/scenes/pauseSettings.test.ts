import { expect, it, vi } from 'vitest'
import type { GameEvent } from '../../../src/game/contracts/events'
import { DEFAULT_BINDINGS } from '../../../src/game/model/input'
import { RunContext } from '../../../src/game/phaser/scenes/context'

it('reports the Settings choice of the pause menu as its own event, not as a menu request', () => {
  const emit = vi.fn<(event: GameEvent) => void>()
  const context = new RunContext(DEFAULT_BINDINGS, emit)

  context.requestSettings()

  expect(emit).toHaveBeenCalledExactlyOnceWith({ type: 'settingsRequested' })
})
