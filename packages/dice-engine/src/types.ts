import type {
  DieResult,
  RandomSource,
  RollMode,
  RollResult,
  RollSession,
} from '@creepiest-space/dice-core';
import type {
  DicePhysicsMaterial,
  PhysicsWorld,
  SettlingOptions,
  ThrowGeneratorOptions,
  TrayOptions,
} from '@creepiest-space/dice-physics';
import type { DiceRenderer, RendererTheme, RendererViewport } from '@creepiest-space/dice-renderer';

export interface FrameToken {
  cancel(): void;
}

export interface FrameScheduler {
  request(callback: (timestampMs: number) => void): FrameToken;
}

export type DiceMaterialType = RendererTheme['material'];
export type DiceTheme = RendererTheme;

export interface RollOptions {
  readonly mode?: RollMode;
  readonly signal?: AbortSignal;
}

export interface DiceEngineLimits {
  readonly maxNotationLength: number;
  readonly maxLogicalDice: number;
  readonly maxPhysicalDice: number;
  readonly maxQueuedRolls: number;
}

export interface DiceEngineEvents {
  readonly 'roll:start': RollSession;
  readonly 'die:settled': { readonly sessionId: string; readonly die: DieResult };
  readonly 'roll:complete': RollResult;
  readonly 'roll:cancel': RollSession;
  readonly 'theme:change': DiceTheme;
  readonly error: { readonly session: RollSession; readonly error: unknown };
}

export interface DiceEngineOptions {
  readonly physics: PhysicsWorld;
  readonly renderer: DiceRenderer;
  readonly random?: RandomSource;
  readonly scheduler?: FrameScheduler;
  readonly now?: () => number;
  readonly fixedStepSeconds?: number;
  readonly maxFrameDeltaSeconds?: number;
  readonly settling?: SettlingOptions;
  readonly throw?: ThrowGeneratorOptions;
  readonly tray?: TrayOptions;
  readonly diceMaterial?: DicePhysicsMaterial;
  readonly theme?: Partial<DiceTheme>;
  readonly limits?: Partial<DiceEngineLimits>;
}

export interface DiceEngineFacade {
  initialize(): Promise<void>;
  roll(notation: string, options?: RollOptions): Promise<RollResult>;
  cancel(sessionId?: string): boolean;
  clear(): void;
  resize(viewport: RendererViewport): void;
  setTheme(theme: Partial<DiceTheme>): DiceTheme;
  destroy(): void;
}
