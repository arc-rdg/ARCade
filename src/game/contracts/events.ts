import type { BossSpec, FinalBossSpec } from './content'
import type { KillerInfo } from './combat'
import type { Bindings } from './input'
import type { RunPlan, Segment } from './run'

// From the game to React.
export type GameEvent =
  | { type: 'ready' }
  | { type: 'runStarted'; plan: RunPlan }
  | { type: 'segmentEntered'; segment: Segment }
  | { type: 'bossEntered'; boss: BossSpec | FinalBossSpec }
  | { type: 'levelUp'; level: number }
  | { type: 'died'; killer: KillerInfo; plan: RunPlan; level: number }
  | { type: 'victory'; plan: RunPlan; level: number; timeMs: number }
  | { type: 'paused'; paused: boolean }
  // The player chose Retry, New path or Menu on the death or victory screen.
  | { type: 'menuRequested'; choice: 'retry' | 'newPath' | 'menu' }
  // The player chose Settings in the pause menu. The game stays paused; the host shows its key bindings.
  | { type: 'settingsRequested' }
  // The Training room loaded. No run exists until the finish card's Start run sends runStarted.
  | { type: 'tutorialStarted' }
  | { type: 'tutorialFinished' }

// From React to the game.
export type GameCommand =
  | { type: 'start'; plan: RunPlan }
  // The Training room. The plan, when there is one, is what its finish card can start.
  | { type: 'startTutorial'; plan: RunPlan | null }
  | { type: 'pause'; paused: boolean }
  | { type: 'setBindings'; bindings: Bindings }
  | { type: 'quitToMenu' }

export interface GameHandle {
  send(command: GameCommand): void
  on(listener: (event: GameEvent) => void): () => void
  // CSS pixels of the box the canvas fills.
  resize(width: number, height: number): void
  focus(): void
  destroy(): void
}

export type CreateGame = (parent: HTMLElement, options: { bindings: Bindings }) => GameHandle
