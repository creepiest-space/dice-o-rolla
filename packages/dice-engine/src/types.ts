import type {
  DieResult,
  RandomSource,
  RollMode,
  RollResult,
  RollSession,
} from '@dice-o-rolla/dice-core';
import type {
  DicePhysicsMaterial,
  PhysicsWorld,
  SettlingOptions,
  ThrowGeneratorOptions,
  TrayOptions,
} from '@dice-o-rolla/dice-physics';
import type { DiceRenderer, RendererTheme, RendererViewport } from '@dice-o-rolla/dice-renderer';
import type {
  RegisterVisualPresetOptions,
  VisualPresetDescriptor,
} from '@dice-o-rolla/dice-renderer';

import type { PhysicalDieType } from './visual-presets.js';

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

export interface RegisterEngineVisualPresetOptions extends RegisterVisualPresetOptions {
  readonly makeDefault?: boolean;
}

export interface DiceEngineLimits {
  readonly maxNotationLength: number;
  readonly maxLogicalDice: number;
  readonly maxPhysicalDice: number;
  readonly maxQueuedRolls: number;
}

export interface DiceVisualEvent {
  readonly sessionId: string;
  readonly dieId: string;
  readonly dieType: string;
  readonly presetId: string;
  readonly skinId?: string;
  readonly soundPackId?: string;
}

export type DiceRemovalReason = 'replaced' | 'cancelled' | 'failed' | 'cleared' | 'destroyed';

export interface DiceRemoveEvent extends DiceVisualEvent {
  readonly reason: DiceRemovalReason;
}

export interface DiceCollisionEvent extends DiceVisualEvent {
  readonly otherDieId?: string;
  readonly started: boolean;
}

export interface DiceCollisionEventOptions {
  readonly enabled: boolean;
  readonly maxEventsPerFrame: number;
}

export interface DiceEngineEvents {
  readonly 'roll:start': RollSession;
  readonly 'die:spawn': DiceVisualEvent;
  readonly 'die:settled': { readonly sessionId: string; readonly die: DieResult };
  readonly 'die:remove': DiceRemoveEvent;
  readonly 'die:collision': DiceCollisionEvent;
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
  readonly visualPresets?: readonly VisualPresetDescriptor[];
  readonly visualPresetIds?: Partial<Readonly<Record<PhysicalDieType, string>>>;
  readonly collisionEvents?: Partial<DiceCollisionEventOptions>;
}

export interface DiceEngineFacade {
  initialize(): Promise<void>;
  roll(notation: string, options?: RollOptions): Promise<RollResult>;
  cancel(sessionId?: string): boolean;
  clear(): void;
  resize(viewport: RendererViewport): void;
  setTheme(theme: Partial<DiceTheme>): DiceTheme;
  registerVisualPreset(
    preset: VisualPresetDescriptor,
    options?: RegisterEngineVisualPresetOptions,
  ): VisualPresetDescriptor;
  unregisterVisualPreset(id: string): boolean;
  setVisualPreset(dieType: PhysicalDieType, presetId: string): void;
  getVisualPreset(dieType: PhysicalDieType): VisualPresetDescriptor;
  destroy(): void;
}
