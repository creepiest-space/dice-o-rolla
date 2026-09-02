import type {
  DiceComponentRole,
  DieResult,
  DieType,
  PairedDiceType,
  QuaternionLike,
  RandomSource,
  RollMode,
  RollResult,
  RollSession,
  Vector3Like,
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

export interface VisualPresetSelectionContext {
  /** Physical polyhedron being allocated. Paired dice use d10 or d6 here. */
  readonly physicalDieType: PhysicalDieType;
  /** Notation-level die type. Paired components retain d100 or d66 here. */
  readonly logicalDieType: PhysicalDieType | PairedDiceType;
  readonly termId: string;
  readonly expressionIndex: number;
  readonly dieIndex: number;
  readonly physicalIndex: number;
  readonly defaultPresetId: string;
  readonly component?: {
    readonly groupType: PairedDiceType;
    readonly role: DiceComponentRole;
  };
}

/** Returns a registered preset ID, or undefined to retain the selected default. */
export type VisualPresetSelector = (context: VisualPresetSelectionContext) => string | undefined;

export interface RollOptions {
  readonly mode?: RollMode;
  readonly signal?: AbortSignal;
  readonly visualPresetSelector?: VisualPresetSelector;
}

export interface SimulateOptions {
  readonly seed: number;
  readonly captureFrames?: boolean;
  /** Capture one frame every N fixed simulation steps. */
  readonly frameIntervalSteps?: number;
  readonly visualPresetSelector?: VisualPresetSelector;
}

export interface ReplayOptions {
  readonly theme?: Partial<DiceTheme>;
  readonly signal?: AbortSignal;
}

export interface PhysicalRollFrameDie {
  readonly id: string;
  readonly position: Vector3Like;
  readonly quaternion: QuaternionLike;
}

export interface PhysicalRollFrame {
  readonly elapsedSeconds: number;
  readonly dice: readonly PhysicalRollFrameDie[];
}

export interface PhysicalRollTraceDie {
  readonly id: string;
  readonly type: DieType;
  readonly presetId: string;
  readonly geometryId: string;
  readonly definitionFingerprint: string;
  readonly scale: number;
  readonly faceLabels?: Readonly<Record<number, string | number>>;
  readonly initial: {
    readonly position: Vector3Like;
    readonly quaternion: QuaternionLike;
    readonly impulse: Vector3Like;
    readonly torqueImpulse: Vector3Like;
  };
}

export interface PhysicalRollTraceCollisionEvent {
  readonly kind: 'collision';
  readonly elapsedSeconds: number;
  readonly dieId: string;
  readonly otherDieId?: string;
  readonly started: boolean;
}

export interface PhysicalRollTraceImpactEvent {
  readonly kind: 'impact';
  readonly elapsedSeconds: number;
  readonly dieId: string;
  readonly otherDieId?: string;
  readonly force: number;
}

export type PhysicalRollTraceEvent = PhysicalRollTraceCollisionEvent | PhysicalRollTraceImpactEvent;

export interface PhysicalRollTraceProfile {
  readonly fixedStepSeconds: number;
  readonly settling: SettlingOptions;
  readonly throw: ThrowGeneratorOptions;
  readonly tray: TrayOptions;
  readonly diceMaterial: DicePhysicsMaterial;
}

export interface PhysicalRollTraceProducer {
  readonly name: '@dice-o-rolla/dice-engine';
  readonly version: string;
}

/** JSON-serializable, renderer-neutral output of a deterministic physical simulation. */
export interface PhysicalRollTrace {
  readonly version: 1;
  readonly producer: PhysicalRollTraceProducer;
  readonly notation: string;
  readonly seed: number;
  readonly fixedStepSeconds: number;
  readonly frameIntervalSteps: number;
  readonly durationSeconds: number;
  readonly profile: PhysicalRollTraceProfile;
  readonly dice: readonly PhysicalRollTraceDie[];
  readonly frames: readonly PhysicalRollFrame[];
  readonly events: readonly PhysicalRollTraceEvent[];
  readonly result: RollResult;
}

export interface DiceTraceLimits {
  readonly maxFrames: number;
  readonly maxSamples: number;
  readonly maxEvents: number;
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

export interface DiceImpactEvent extends DiceVisualEvent {
  readonly otherDieId?: string;
  readonly force: number;
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
  readonly 'die:impact': DiceImpactEvent;
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
  readonly traceLimits?: Partial<DiceTraceLimits>;
  readonly visualPresets?: readonly VisualPresetDescriptor[];
  readonly visualPresetIds?: Partial<Readonly<Record<PhysicalDieType, string>>>;
  readonly collisionEvents?: Partial<DiceCollisionEventOptions>;
}

export interface DiceEngineFacade {
  initialize(): Promise<void>;
  roll(notation: string, options?: RollOptions): Promise<RollResult>;
  simulate(notation: string, options: SimulateOptions): Promise<PhysicalRollTrace>;
  replay(trace: PhysicalRollTrace, options?: ReplayOptions): Promise<void>;
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
