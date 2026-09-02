import {
  createRollResult,
  getNotationModifier,
  isDieType,
  mathRandomSource,
  parseNotation,
  SeededRandomSource,
  TypedEventEmitter,
} from '@dice-o-rolla/dice-core';
import type {
  DieResult,
  DieType,
  DiceComponentRole,
  DiceScoreRule,
  DiceSelection,
  PairedDiceType,
  RollNotation,
  RollResult,
  RollSession,
  RollState,
} from '@dice-o-rolla/dice-core';
import { getDieGeometry, hasDieGeometry, resolveFace } from '@dice-o-rolla/dice-geometry';
import type { PolyhedronDefinition } from '@dice-o-rolla/dice-geometry';
import { SettlingDetector, ThrowGenerator } from '@dice-o-rolla/dice-physics';
import type {
  PhysicsDieHandle,
  PhysicsDieState,
  ThrowParameters,
} from '@dice-o-rolla/dice-physics';
import {
  createVisualPresetDescriptor,
  VisualPresetRegistry,
  type RenderDieState,
  type RendererViewport,
  type VisualPresetDescriptor,
} from '@dice-o-rolla/dice-renderer';

import { DEFAULT_THEME, defaultFrameScheduler } from './defaults.js';
import {
  DiceEngineDestroyedError,
  RollCancelledError,
  RollLimitExceededError,
  RollTimeoutError,
  TraceLimitExceededError,
} from './errors.js';
import type {
  DiceEngineEvents,
  DiceEngineFacade,
  DiceEngineLimits,
  DiceEngineOptions,
  DiceRemovalReason,
  DiceTheme,
  DiceTraceLimits,
  DiceVisualEvent,
  FrameToken,
  PhysicalRollFrame,
  PhysicalRollTrace,
  PhysicalRollTraceEvent,
  PhysicalRollTraceProfile,
  RegisterEngineVisualPresetOptions,
  ReplayOptions,
  RollOptions,
  SimulateOptions,
  VisualPresetSelectionContext,
  VisualPresetSelector,
} from './types.js';
import { DICE_ENGINE_VERSION } from './version.js';
import {
  getStandardVisualPresetId,
  isPhysicalDieType,
  PHYSICAL_DIE_TYPES,
  STANDARD_VISUAL_PRESETS,
  type PhysicalDieType,
} from './visual-presets.js';

interface MutableSession {
  readonly id: string;
  readonly notation: string;
  state: RollState;
  readonly createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

interface RollTask {
  readonly session: MutableSession;
  readonly parsed: RollNotation;
  readonly promise: Promise<RollResult>;
  readonly resolve: (result: RollResult) => void;
  readonly reject: (error: unknown) => void;
  readonly signal?: AbortSignal;
  readonly abortListener?: () => void;
  readonly visualPresetSelector?: VisualPresetSelector;
}

interface ActiveDie {
  readonly id: string;
  readonly type: DieType;
  readonly geometryType: DieType;
  readonly preset: VisualPresetDescriptor;
  readonly termId: string;
  readonly expressionIndex: number;
  readonly dieIndex: number;
  readonly physicalIndex: number;
  readonly selection?: DiceSelection;
  readonly scoreRules?: readonly DiceScoreRule[];
  readonly component?: {
    readonly groupId: string;
    readonly groupType: PairedDiceType;
    readonly role: DiceComponentRole;
  };
  readonly faceLabels?: Readonly<Record<number, string | number>>;
  readonly initial: ThrowParameters;
  readonly body: PhysicsDieHandle;
  readonly detector: SettlingDetector;
  previous: PhysicsDieState;
  current: PhysicsDieState;
  result?: DieResult;
}

interface PhysicalDieSpec {
  readonly type: DieType;
  readonly geometryType: DieType;
  readonly preset: VisualPresetDescriptor;
  readonly termId: string;
  readonly expressionIndex: number;
  readonly dieIndex: number;
  readonly physicalIndex: number;
  readonly selection?: DiceSelection;
  readonly scoreRules?: readonly DiceScoreRule[];
  readonly component?: ActiveDie['component'];
  readonly faceLabels?: Readonly<Record<number, string | number>>;
}

interface ActiveRoll {
  readonly task: RollTask;
  readonly dice: ActiveDie[];
}

interface ActiveReplay {
  readonly trace: PhysicalRollTrace;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
  readonly createdIds: readonly string[];
  readonly signal?: AbortSignal;
  readonly abortListener?: () => void;
  nextEventIndex: number;
  startMs?: number;
}

const DEFAULT_SETTLING = {
  linearVelocityThreshold: 0.08,
  angularVelocityThreshold: 0.08,
  stableTimeMs: 300,
  maxRollTimeMs: 10_000,
} as const;

const DEFAULT_THROW = {
  position: {
    x: { min: -2, max: 2 },
    y: { min: 3.5, max: 5 },
    z: { min: -2, max: 2 },
  },
  impulse: {
    x: { min: -2.5, max: 2.5 },
    y: { min: 0.5, max: 2 },
    z: { min: -2.5, max: 2.5 },
  },
  torqueImpulse: {
    x: { min: -3, max: 3 },
    y: { min: -3, max: 3 },
    z: { min: -3, max: 3 },
  },
} as const;

const DEFAULT_TRAY = {
  width: 10,
  depth: 10,
  wallHeight: 6,
  wallThickness: 0.25,
  material: { friction: 0.8, restitution: 0.1 },
} as const;

const DEFAULT_DICE_MATERIAL = {
  friction: 0.7,
  restitution: 0.15,
  linearDamping: 0.25,
  angularDamping: 0.25,
} as const;

const DEFAULT_LIMITS: DiceEngineLimits = Object.freeze({
  maxNotationLength: 256,
  maxLogicalDice: 50,
  maxPhysicalDice: 50,
  maxQueuedRolls: 8,
});

const DEFAULT_COLLISION_EVENTS = Object.freeze({ enabled: false, maxEventsPerFrame: 32 });

const DEFAULT_TRACE_LIMITS: DiceTraceLimits = Object.freeze({
  maxFrames: 1_200,
  maxSamples: 60_000,
  maxEvents: 20_000,
});

const D100_TENS_LABELS = Object.freeze({
  1: 10,
  2: 20,
  3: 30,
  4: 40,
  5: 50,
  6: 60,
  7: 70,
  8: 80,
  9: 90,
  10: '00',
});

const D66_TENS_LABELS = Object.freeze({ 1: 10, 2: 20, 3: 30, 4: 40, 5: 50, 6: 60 });

function snapshotSession(session: MutableSession): RollSession {
  return Object.freeze({
    id: session.id,
    notation: session.notation,
    state: session.state,
    createdAt: session.createdAt,
    ...(session.startedAt === undefined ? {} : { startedAt: session.startedAt }),
    ...(session.completedAt === undefined ? {} : { completedAt: session.completedAt }),
  });
}

function toRenderState(die: ActiveDie): RenderDieState {
  return {
    id: die.id,
    presetId: die.preset.id,
    geometryId: die.geometryType,
    scale: die.preset.scale ?? 1,
    ...(die.faceLabels === undefined ? {} : { faceLabels: die.faceLabels }),
    previous: die.previous,
    current: die.current,
  };
}

function mergeFaceLabels(
  preset: Readonly<Record<number, string | number>> | undefined,
  roll: Readonly<Record<number, string | number>> | undefined,
): Readonly<Record<number, string | number>> | undefined {
  if (preset === undefined) return roll;
  if (roll === undefined) return preset;
  return Object.freeze({ ...preset, ...roll });
}

function snapshotFrame(dice: readonly ActiveDie[], elapsedSeconds: number): PhysicalRollFrame {
  return Object.freeze({
    elapsedSeconds,
    dice: Object.freeze(
      dice.map((die) =>
        Object.freeze({
          id: die.id,
          position: Object.freeze({ ...die.current.position }),
          quaternion: Object.freeze({ ...die.current.quaternion }),
        }),
      ),
    ),
  });
}

function getFrameDie(frame: PhysicalRollFrame, id: string): PhysicalRollFrame['dice'][number] {
  const die = frame.dice.find((candidate) => candidate.id === id);
  if (die === undefined) throw new TypeError(`Trace frame is missing die "${id}"`);
  return die;
}

function freezeVector<T extends { readonly x: number; readonly y: number; readonly z: number }>(
  value: T,
): Readonly<T> {
  return Object.freeze({ ...value });
}

function freezeThrowParameters(parameters: ThrowParameters): ThrowParameters {
  return Object.freeze({
    position: freezeVector(parameters.position),
    quaternion: freezeVector(parameters.quaternion),
    impulse: freezeVector(parameters.impulse),
    torqueImpulse: freezeVector(parameters.torqueImpulse),
  });
}

function cloneRange(range: { readonly min: number; readonly max: number }) {
  return Object.freeze({ ...range });
}

function cloneVectorRange(range: {
  readonly x: { readonly min: number; readonly max: number };
  readonly y: { readonly min: number; readonly max: number };
  readonly z: { readonly min: number; readonly max: number };
}) {
  return Object.freeze({ x: cloneRange(range.x), y: cloneRange(range.y), z: cloneRange(range.z) });
}

function definitionFingerprint(
  geometry: PolyhedronDefinition,
  preset: VisualPresetDescriptor,
  effectiveFaceLabels?: Readonly<Record<number, string | number>>,
): string {
  const serialized = JSON.stringify({
    geometry: {
      id: geometry.id,
      vertices: geometry.vertices,
      faces: geometry.faces,
      faceDefinitions: geometry.faceDefinitions,
    },
    preset: {
      id: preset.id,
      dieType: preset.dieType,
      geometryId: preset.geometryId,
      scale: preset.scale ?? 1,
      faceLabels: preset.faceLabels ?? null,
      effectiveFaceLabels: effectiveFaceLabels ?? null,
      valueMap: preset.valueMap ?? null,
      skinId: preset.skinId ?? null,
      soundPackId: preset.soundPackId ?? null,
    },
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function snapshotTraceProfile(options: {
  readonly fixedStepSeconds: number;
  readonly settling: NonNullable<DiceEngineOptions['settling']>;
  readonly throw: NonNullable<DiceEngineOptions['throw']>;
  readonly tray: NonNullable<DiceEngineOptions['tray']>;
  readonly diceMaterial: NonNullable<DiceEngineOptions['diceMaterial']>;
}): PhysicalRollTraceProfile {
  return Object.freeze({
    fixedStepSeconds: options.fixedStepSeconds,
    settling: Object.freeze({ ...options.settling }),
    throw: Object.freeze({
      position: cloneVectorRange(options.throw.position),
      impulse: cloneVectorRange(options.throw.impulse),
      torqueImpulse: cloneVectorRange(options.throw.torqueImpulse),
    }),
    tray: Object.freeze({
      ...options.tray,
      material: Object.freeze({ ...options.tray.material }),
    }),
    diceMaterial: Object.freeze({ ...options.diceMaterial }),
  });
}

function assertPositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

export class DiceEngine extends TypedEventEmitter<DiceEngineEvents> implements DiceEngineFacade {
  readonly #physics: DiceEngineOptions['physics'];
  readonly #renderer: DiceEngineOptions['renderer'];
  readonly #scheduler: NonNullable<DiceEngineOptions['scheduler']>;
  readonly #now: NonNullable<DiceEngineOptions['now']>;
  readonly #fixedStepSeconds: number;
  readonly #maxFrameDeltaSeconds: number;
  readonly #settling: NonNullable<DiceEngineOptions['settling']>;
  readonly #throwOptions: NonNullable<DiceEngineOptions['throw']>;
  readonly #throwGenerator: ThrowGenerator;
  readonly #tray: NonNullable<DiceEngineOptions['tray']>;
  readonly #diceMaterial: NonNullable<DiceEngineOptions['diceMaterial']>;
  readonly #limits: DiceEngineLimits;
  readonly #traceLimits: DiceTraceLimits;
  readonly #collisionEvents: Readonly<{ enabled: boolean; maxEventsPerFrame: number }>;
  readonly #visualPresets = new VisualPresetRegistry(STANDARD_VISUAL_PRESETS);
  readonly #visualPresetIds = new Map<PhysicalDieType, string>();
  readonly #queue: RollTask[] = [];
  readonly #displayedDieIds = new Set<string>();
  readonly #dieEvents = new Map<string, DiceVisualEvent>();
  #active: ActiveRoll | undefined;
  #replay: ActiveReplay | undefined;
  #frameToken: FrameToken | undefined;
  #lastFrameMs = 0;
  #accumulatorSeconds = 0;
  #nextSessionId = 1;
  #nextSimulationId = 1;
  #initialization: Promise<void> | undefined;
  #initialized = false;
  #destroyed = false;
  #theme: DiceTheme;

  constructor(options: DiceEngineOptions) {
    super();
    this.#physics = options.physics;
    this.#renderer = options.renderer;
    this.#scheduler = options.scheduler ?? defaultFrameScheduler;
    this.#now = options.now ?? (() => performance.now());
    this.#fixedStepSeconds = options.fixedStepSeconds ?? 1 / 60;
    this.#maxFrameDeltaSeconds = options.maxFrameDeltaSeconds ?? 0.25;
    assertPositive(this.#fixedStepSeconds, 'fixedStepSeconds');
    assertPositive(this.#maxFrameDeltaSeconds, 'maxFrameDeltaSeconds');
    this.#settling = options.settling ?? DEFAULT_SETTLING;
    this.#throwOptions = options.throw ?? DEFAULT_THROW;
    this.#throwGenerator = new ThrowGenerator(
      options.random ?? mathRandomSource,
      this.#throwOptions,
    );
    this.#tray = options.tray ?? DEFAULT_TRAY;
    this.#diceMaterial = options.diceMaterial ?? DEFAULT_DICE_MATERIAL;
    this.#limits = Object.freeze({ ...DEFAULT_LIMITS, ...options.limits });
    this.#traceLimits = Object.freeze({ ...DEFAULT_TRACE_LIMITS, ...options.traceLimits });
    this.#collisionEvents = Object.freeze({
      ...DEFAULT_COLLISION_EVENTS,
      ...options.collisionEvents,
    });
    assertPositiveSafeInteger(
      this.#collisionEvents.maxEventsPerFrame,
      'collisionEvents.maxEventsPerFrame',
    );
    for (const [name, value] of [
      ['maxNotationLength', this.#limits.maxNotationLength],
      ['maxLogicalDice', this.#limits.maxLogicalDice],
      ['maxPhysicalDice', this.#limits.maxPhysicalDice],
      ['maxQueuedRolls', this.#limits.maxQueuedRolls],
    ] as const) {
      assertPositiveSafeInteger(value, `limits.${name}`);
    }
    for (const [name, value] of [
      ['maxFrames', this.#traceLimits.maxFrames],
      ['maxSamples', this.#traceLimits.maxSamples],
      ['maxEvents', this.#traceLimits.maxEvents],
    ] as const) {
      assertPositiveSafeInteger(value, `traceLimits.${name}`);
    }
    for (const type of PHYSICAL_DIE_TYPES) {
      this.#visualPresetIds.set(type, getStandardVisualPresetId(type));
    }
    for (const preset of options.visualPresets ?? []) this.registerVisualPreset(preset);
    for (const type of PHYSICAL_DIE_TYPES) {
      const presetId = options.visualPresetIds?.[type];
      if (presetId !== undefined) this.setVisualPreset(type, presetId);
    }
    this.#theme = this.#mergeTheme(options.theme ?? {});
  }

  async initialize(): Promise<void> {
    this.#assertAlive();
    if (this.#initialized) return;
    if (this.#initialization !== undefined) return this.#initialization;

    const initialization = this.#performInitialization();
    this.#initialization = initialization;
    try {
      await initialization;
    } finally {
      if (this.#initialization === initialization) this.#initialization = undefined;
    }
  }

  roll(notation: string, options: RollOptions = {}): Promise<RollResult> {
    try {
      this.#assertReady();
      if (this.#replay !== undefined) throw new Error('Cannot roll while a trace replay is active');
      if ((options.mode ?? 'queue') !== 'queue') {
        throw new RangeError('Only queue roll mode is currently supported');
      }
      if (notation.length > this.#limits.maxNotationLength) {
        throw new RollLimitExceededError(
          'notation-length',
          this.#limits.maxNotationLength,
          notation.length,
        );
      }
      const parsed = parseNotation(notation);
      this.#assertSupportedAndWithinLimits(parsed);
      if (this.#active !== undefined && this.#queue.length >= this.#limits.maxQueuedRolls) {
        throw new RollLimitExceededError(
          'queue-size',
          this.#limits.maxQueuedRolls,
          this.#queue.length + 1,
        );
      }
      const task = this.#createTask(notation, parsed, options);
      if (options.signal?.aborted === true) {
        this.#rejectCancelled(task);
        return task.promise;
      }
      this.#queue.push(task);
      this.#startNext();
      return task.promise;
    } catch (error) {
      return Promise.reject(error);
    }
  }

  async simulate(notation: string, options: SimulateOptions): Promise<PhysicalRollTrace> {
    this.#assertReady();
    this.#assertExclusiveOperationAvailable('simulate');
    if (notation.length > this.#limits.maxNotationLength) {
      throw new RollLimitExceededError(
        'notation-length',
        this.#limits.maxNotationLength,
        notation.length,
      );
    }
    const parsed = parseNotation(notation);
    this.#assertSupportedAndWithinLimits(parsed);
    const frameIntervalSteps = options.frameIntervalSteps ?? 1;
    assertPositiveSafeInteger(frameIntervalSteps, 'frameIntervalSteps');
    const random = new SeededRandomSource(options.seed);
    const throwGenerator = new ThrowGenerator(random, this.#throwOptions);
    const simulationId = `simulation-${this.#nextSimulationId++}`;
    this.#removeDisplayedDice();
    this.#physics.clear();

    const dice: ActiveDie[] = [];
    let trace: PhysicalRollTrace | undefined;
    let failure: unknown;
    try {
      this.#physics.setCollisionEventsEnabled(true);
      this.#physics.drainCollisionEvents();
      this.#physics.drainImpactEvents();
      dice.push(
        ...this.#createSimulationDice(
          parsed,
          simulationId,
          throwGenerator,
          options.visualPresetSelector,
        ),
      );
      const captureFrames = options.captureFrames === true;
      const frames: PhysicalRollFrame[] = [];
      const events: PhysicalRollTraceEvent[] = [];
      if (captureFrames) this.#appendTraceFrame(frames, dice, 0);
      let elapsedSeconds = 0;
      let stepIndex = 0;

      while (dice.some((die) => die.result === undefined)) {
        for (const die of dice) die.previous = die.current;
        this.#physics.step(this.#fixedStepSeconds);
        stepIndex += 1;
        elapsedSeconds += this.#fixedStepSeconds;
        for (const collision of this.#physics.drainCollisionEvents()) {
          this.#appendTraceEvent(events, {
            kind: 'collision',
            elapsedSeconds,
            dieId: collision.dieId,
            ...(collision.otherDieId === undefined ? {} : { otherDieId: collision.otherDieId }),
            started: collision.started,
          });
        }
        for (const impact of this.#physics.drainImpactEvents()) {
          this.#appendTraceEvent(events, {
            kind: 'impact',
            elapsedSeconds,
            dieId: impact.dieId,
            ...(impact.otherDieId === undefined ? {} : { otherDieId: impact.otherDieId }),
            force: impact.force,
          });
        }
        for (const die of dice) {
          die.current = die.body.getState();
          if (die.result !== undefined) continue;
          const settling = die.detector.update(die.current, this.#fixedStepSeconds * 1_000);
          if (settling === 'timed-out') throw new RollTimeoutError(simulationId);
          if (settling === 'settled') {
            const geometry = getDieGeometry(die.geometryType);
            die.result = this.#createDieResult(die, resolveFace(geometry, die.current.quaternion));
          }
        }
        const allSettled = dice.every((die) => die.result !== undefined);
        if (captureFrames && (stepIndex % frameIntervalSteps === 0 || allSettled)) {
          if (frames.at(-1)?.elapsedSeconds !== elapsedSeconds) {
            this.#appendTraceFrame(frames, dice, elapsedSeconds);
          }
        }
      }

      if (!captureFrames) this.#appendTraceFrame(frames, dice, elapsedSeconds);
      const result = createRollResult({
        id: simulationId,
        notation,
        dice: this.#applyRollRules(dice),
        modifier: getNotationModifier(parsed),
        startedAt: 0,
        completedAt: elapsedSeconds * 1_000,
      });
      trace = Object.freeze({
        version: 1 as const,
        producer: Object.freeze({
          name: '@dice-o-rolla/dice-engine' as const,
          version: DICE_ENGINE_VERSION,
        }),
        notation,
        seed: options.seed,
        fixedStepSeconds: this.#fixedStepSeconds,
        frameIntervalSteps,
        durationSeconds: elapsedSeconds,
        profile: snapshotTraceProfile({
          fixedStepSeconds: this.#fixedStepSeconds,
          settling: this.#settling,
          throw: this.#throwOptions,
          tray: this.#tray,
          diceMaterial: this.#diceMaterial,
        }),
        dice: Object.freeze(
          dice.map((die) =>
            Object.freeze({
              id: die.id,
              type: die.type,
              presetId: die.preset.id,
              geometryId: die.geometryType,
              definitionFingerprint: definitionFingerprint(
                getDieGeometry(die.geometryType),
                die.preset,
                die.faceLabels,
              ),
              scale: die.preset.scale ?? 1,
              ...(die.faceLabels === undefined
                ? {}
                : { faceLabels: Object.freeze({ ...die.faceLabels }) }),
              initial: freezeThrowParameters(die.initial),
            }),
          ),
        ),
        frames: Object.freeze(frames),
        events: Object.freeze(events),
        result,
      });
    } catch (error) {
      failure = error;
    }

    const cleanupErrors = this.#removeSimulationDice(dice);
    try {
      this.#physics.setCollisionEventsEnabled(this.#collisionEvents.enabled);
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (failure !== undefined) {
      if (cleanupErrors.length === 0) throw failure;
      throw new AggregateError([failure, ...cleanupErrors], `Simulation ${simulationId} failed`, {
        cause: failure,
      });
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, `Failed to clean up ${simulationId}`);
    }
    if (trace === undefined) throw new Error(`Simulation ${simulationId} produced no trace`);
    this.#assertValidTrace(trace);
    return trace;
  }

  replay(trace: PhysicalRollTrace, options: ReplayOptions = {}): Promise<void> {
    try {
      this.#assertReady();
      this.#assertExclusiveOperationAvailable('replay');
      this.#assertValidTrace(trace);
      if (options.signal?.aborted === true) {
        return Promise.reject(new RollCancelledError(trace.result.id));
      }
      this.#removeDisplayedDice();
      if (options.theme !== undefined) this.setTheme(options.theme);
      const firstFrame = trace.frames[0]!;
      const createdIds: string[] = [];
      try {
        for (const die of trace.dice) {
          const frameDie = getFrameDie(firstFrame, die.id);
          this.#renderer.createDie({
            id: die.id,
            presetId: die.presetId,
            geometryId: die.geometryId,
            scale: die.scale,
            ...(die.faceLabels === undefined ? {} : { faceLabels: die.faceLabels }),
            previous: frameDie,
            current: frameDie,
          });
          createdIds.push(die.id);
          const preset = this.#visualPresets.get(die.presetId)!;
          const event: DiceVisualEvent = Object.freeze({
            sessionId: trace.result.id,
            dieId: die.id,
            dieType: die.type,
            presetId: die.presetId,
            ...(preset.skinId === undefined ? {} : { skinId: preset.skinId }),
            ...(preset.soundPackId === undefined ? {} : { soundPackId: preset.soundPackId }),
          });
          this.#dieEvents.set(die.id, event);
          this.emit('die:spawn', event);
        }
      } catch (error) {
        for (const id of createdIds) {
          this.#dieEvents.delete(id);
          this.#renderer.removeDie(id);
        }
        throw error;
      }

      let resolve!: () => void;
      let reject!: (error: unknown) => void;
      const promise = new Promise<void>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      const abortListener =
        options.signal === undefined ? undefined : (): void => this.#cancelReplay();
      if (abortListener !== undefined) {
        options.signal?.addEventListener('abort', abortListener, { once: true });
      }
      const replay: ActiveReplay = {
        trace,
        resolve,
        reject,
        createdIds,
        nextEventIndex: 0,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        ...(abortListener === undefined ? {} : { abortListener }),
      };
      this.#replay = replay;
      try {
        this.#scheduleReplayFrame();
      } catch (error) {
        this.#finishReplay(replay, error);
      }
      return promise;
    } catch (error) {
      return Promise.reject(error);
    }
  }

  cancel(sessionId?: string): boolean {
    this.#assertAlive();
    if (
      this.#replay !== undefined &&
      (sessionId === undefined || this.#replay.trace.result.id === sessionId)
    ) {
      this.#cancelReplay();
      return true;
    }
    if (
      this.#active !== undefined &&
      (sessionId === undefined || this.#active.task.session.id === sessionId)
    ) {
      const task = this.#active.task;
      this.#cancelActive(task);
      return true;
    }

    const index = this.#queue.findIndex(
      (task) => sessionId === undefined || task.session.id === sessionId,
    );
    const task = index < 0 ? undefined : this.#queue.splice(index, 1)[0];
    if (task === undefined) return false;
    this.#rejectCancelled(task);
    return true;
  }

  override clear(): void {
    this.#assertAlive();
    if (this.#replay !== undefined) this.#cancelReplay();
    this.#frameToken?.cancel();
    this.#frameToken = undefined;
    if (this.#active !== undefined) {
      const task = this.#active.task;
      this.#active = undefined;
      this.#rejectCancelled(task);
    }
    for (const task of this.#queue.splice(0)) this.#rejectCancelled(task);
    this.#accumulatorSeconds = 0;
    this.#clearRenderedDice('cleared');
  }

  resize(viewport: RendererViewport): void {
    this.#assertReady();
    this.#renderer.resize(viewport);
  }

  setTheme(theme: Partial<DiceTheme>): DiceTheme {
    this.#assertAlive();
    this.#theme = this.#mergeTheme({ ...this.#theme, ...theme });
    if (this.#initialized) this.#renderer.setTheme(this.#theme);
    this.emit('theme:change', this.#theme);
    return this.#theme;
  }

  get theme(): DiceTheme {
    return this.#theme;
  }

  registerVisualPreset(
    source: VisualPresetDescriptor,
    options: RegisterEngineVisualPresetOptions = {},
  ): VisualPresetDescriptor {
    this.#assertAlive();
    const preset = createVisualPresetDescriptor(source);
    this.#assertValidVisualPreset(preset);
    if ([...this.#dieEvents.values()].some((event) => event.presetId === preset.id)) {
      throw new Error(`Visual preset "${preset.id}" is currently in use`);
    }
    const existing = this.#visualPresets.get(preset.id);
    if (existing !== undefined && options.replace !== true) {
      throw new Error(`Visual preset "${preset.id}" is already registered`);
    }
    if (this.#initialized) this.#renderer.registerPreset(preset);
    this.#visualPresets.register(
      preset,
      options.replace === undefined ? {} : { replace: options.replace },
    );
    if (options.makeDefault === true) {
      if (!isPhysicalDieType(preset.dieType)) {
        throw new Error(`Visual preset has an invalid physical die type: ${preset.dieType}`);
      }
      this.#visualPresetIds.set(preset.dieType, preset.id);
    }
    return preset;
  }

  unregisterVisualPreset(id: string): boolean {
    this.#assertAlive();
    if (STANDARD_VISUAL_PRESETS.some((preset) => preset.id === id)) {
      throw new Error(`Built-in visual preset "${id}" cannot be unregistered`);
    }
    const preset = this.#visualPresets.unregister(id);
    if (preset === undefined) return false;
    if (!isPhysicalDieType(preset.dieType)) {
      throw new Error(`Visual preset has an invalid physical die type: ${preset.dieType}`);
    }
    const type = preset.dieType;
    if (this.#visualPresetIds.get(type) === id) {
      this.#visualPresetIds.set(type, getStandardVisualPresetId(type));
    }
    if (this.#initialized) this.#renderer.unregisterPreset(id);
    return true;
  }

  setVisualPreset(dieType: PhysicalDieType, presetId: string): void {
    this.#assertAlive();
    if (!PHYSICAL_DIE_TYPES.includes(dieType)) {
      throw new RangeError(`${dieType} is not a physical die type`);
    }
    const preset = this.#visualPresets.get(presetId);
    if (preset === undefined) throw new RangeError(`Unknown visual preset: ${presetId}`);
    if (preset.dieType !== dieType) {
      throw new RangeError(`Visual preset "${presetId}" is for ${preset.dieType}, not ${dieType}`);
    }
    this.#visualPresetIds.set(dieType, presetId);
  }

  getVisualPreset(dieType: PhysicalDieType): VisualPresetDescriptor {
    this.#assertAlive();
    const id = this.#visualPresetIds.get(dieType);
    const preset = id === undefined ? undefined : this.#visualPresets.get(id);
    if (preset === undefined) throw new Error(`No visual preset is selected for ${dieType}`);
    return preset;
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#frameToken?.cancel();
    this.#frameToken = undefined;
    if (this.#replay !== undefined) this.#cancelReplay();
    if (this.#active !== undefined) {
      const task = this.#active.task;
      this.#active = undefined;
      this.#rejectCancelled(task);
    }
    for (const task of this.#queue.splice(0)) this.#rejectCancelled(task);
    this.#forgetRenderedDice('destroyed');
    const cleanupErrors = this.#runCleanup([
      () => this.#renderer.destroy(),
      () => this.#physics.destroy(),
    ]);
    super.clear();
    this.#initialization = undefined;
    this.#initialized = false;
    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, 'DiceEngine teardown failed');
    }
  }

  async #performInitialization(): Promise<void> {
    this.#physics.configureTray(this.#tray);
    this.#physics.setCollisionEventsEnabled(this.#collisionEvents.enabled);
    await this.#renderer.initialize();
    this.#assertAlive();
    for (const preset of this.#visualPresets.list()) this.#renderer.registerPreset(preset);
    this.#renderer.setTheme(this.#theme);
    this.#initialized = true;
  }

  #createTask(notation: string, parsed: RollNotation, options: RollOptions): RollTask {
    const { signal, visualPresetSelector } = options;
    const session: MutableSession = {
      id: `roll-${this.#nextSessionId++}`,
      notation,
      state: 'pending',
      createdAt: this.#now(),
    };
    let resolve!: (result: RollResult) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<RollResult>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    const abortListener =
      signal === undefined ? undefined : (): void => void this.cancel(session.id);
    if (abortListener !== undefined)
      signal?.addEventListener('abort', abortListener, { once: true });
    return {
      session,
      parsed,
      promise,
      resolve,
      reject,
      ...(signal === undefined ? {} : { signal }),
      ...(abortListener === undefined ? {} : { abortListener }),
      ...(visualPresetSelector === undefined ? {} : { visualPresetSelector }),
    };
  }

  #startNext(): void {
    if (this.#active !== undefined || this.#queue.length === 0) return;
    const task = this.#queue.shift();
    if (task === undefined) return;
    this.#removeDisplayedDice();
    task.session.state = 'rolling';
    task.session.startedAt = this.#now();

    try {
      const dice = this.#createDice(task);
      this.#active = { task, dice };
      this.emit('roll:start', snapshotSession(task.session));
      this.#lastFrameMs = this.#now();
      this.#accumulatorSeconds = 0;
      this.#scheduleFrame();
    } catch (error) {
      const active = this.#active;
      if (active?.task === task) this.#failActive(active, error);
      else this.#failTask(task, error);
    }
  }

  #createDice(task: RollTask): ActiveDie[] {
    const dice: ActiveDie[] = [];
    let index = 0;
    const specs = this.#createPhysicalSpecs(
      task.parsed,
      task.session.id,
      task.visualPresetSelector,
    );
    const totalDice = specs.length;
    try {
      for (const spec of specs) {
        const geometry = getDieGeometry(spec.geometryType);
        const faceLabels = mergeFaceLabels(spec.preset.faceLabels, spec.faceLabels);
        const id = `${task.session.id}:die-${index++}`;
        const generated = this.#throwGenerator.generate();
        const position = this.#placeDie(generated.position, index - 1, totalDice);
        const body = this.#physics.createDie({
          id,
          type: spec.geometryType,
          collider: {
            kind: 'convex-hull',
            vertices: geometry.vertices.map(([x, y, z]) => ({ x, y, z })),
          },
          scale: spec.preset.scale ?? 1,
          mass: 1,
          material: this.#diceMaterial,
          position,
          quaternion: generated.quaternion,
        });
        const state = body.getState();
        const die: ActiveDie = {
          id,
          type: spec.type,
          geometryType: spec.geometryType,
          preset: spec.preset,
          termId: spec.termId,
          expressionIndex: spec.expressionIndex,
          dieIndex: spec.dieIndex,
          physicalIndex: spec.physicalIndex,
          ...(spec.selection === undefined ? {} : { selection: spec.selection }),
          ...(spec.scoreRules === undefined ? {} : { scoreRules: spec.scoreRules }),
          ...(spec.component === undefined ? {} : { component: spec.component }),
          ...(faceLabels === undefined ? {} : { faceLabels }),
          initial: generated,
          body,
          detector: new SettlingDetector(this.#settling),
          previous: state,
          current: state,
        };
        dice.push(die);
        this.#renderer.createDie(toRenderState(die));
        body.applyImpulse(generated.impulse, generated.torqueImpulse);
        const event: DiceVisualEvent = Object.freeze({
          sessionId: task.session.id,
          dieId: id,
          dieType: spec.type,
          presetId: spec.preset.id,
          ...(spec.preset.skinId === undefined ? {} : { skinId: spec.preset.skinId }),
          ...(spec.preset.soundPackId === undefined
            ? {}
            : { soundPackId: spec.preset.soundPackId }),
        });
        this.#dieEvents.set(id, event);
        this.emit('die:spawn', event);
      }
      return dice;
    } catch (error) {
      const cleanupErrors = this.#removeDiceSafely(dice, 'failed');
      if (cleanupErrors.length === 0) throw error;
      throw new AggregateError([error, ...cleanupErrors], 'Failed to create dice', {
        cause: error,
      });
    }
  }

  #createSimulationDice(
    parsed: RollNotation,
    simulationId: string,
    throwGenerator: ThrowGenerator,
    visualPresetSelector?: VisualPresetSelector,
  ): ActiveDie[] {
    const dice: ActiveDie[] = [];
    const specs = this.#createPhysicalSpecs(parsed, simulationId, visualPresetSelector);
    const totalDice = specs.length;
    try {
      for (const [index, spec] of specs.entries()) {
        const geometry = getDieGeometry(spec.geometryType);
        const faceLabels = mergeFaceLabels(spec.preset.faceLabels, spec.faceLabels);
        const id = `${simulationId}:die-${index}`;
        const generated = throwGenerator.generate();
        const position = this.#placeDie(generated.position, index, totalDice);
        const body = this.#physics.createDie({
          id,
          type: spec.geometryType,
          collider: {
            kind: 'convex-hull',
            vertices: geometry.vertices.map(([x, y, z]) => ({ x, y, z })),
          },
          scale: spec.preset.scale ?? 1,
          mass: 1,
          material: this.#diceMaterial,
          position,
          quaternion: generated.quaternion,
        });
        const state = body.getState();
        const die: ActiveDie = {
          id,
          type: spec.type,
          geometryType: spec.geometryType,
          preset: spec.preset,
          termId: spec.termId,
          expressionIndex: spec.expressionIndex,
          dieIndex: spec.dieIndex,
          physicalIndex: spec.physicalIndex,
          ...(spec.selection === undefined ? {} : { selection: spec.selection }),
          ...(spec.scoreRules === undefined ? {} : { scoreRules: spec.scoreRules }),
          ...(spec.component === undefined ? {} : { component: spec.component }),
          ...(faceLabels === undefined ? {} : { faceLabels }),
          initial: generated,
          body,
          detector: new SettlingDetector(this.#settling),
          previous: state,
          current: state,
        };
        dice.push(die);
        body.applyImpulse(generated.impulse, generated.torqueImpulse);
      }
      return dice;
    } catch (error) {
      const cleanupErrors = this.#removeSimulationDice(dice);
      if (cleanupErrors.length === 0) throw error;
      throw new AggregateError([error, ...cleanupErrors], 'Failed to create simulation dice', {
        cause: error,
      });
    }
  }

  #removeSimulationDice(dice: readonly ActiveDie[]): unknown[] {
    const errors: unknown[] = [];
    for (const die of dice) {
      try {
        this.#physics.removeDie(die.id);
      } catch (error) {
        errors.push(error);
      }
    }
    return errors;
  }

  #appendTraceFrame(
    frames: PhysicalRollFrame[],
    dice: readonly ActiveDie[],
    elapsedSeconds: number,
  ): void {
    const frameCount = frames.length + 1;
    if (frameCount > this.#traceLimits.maxFrames) {
      throw new TraceLimitExceededError('frames', this.#traceLimits.maxFrames, frameCount);
    }
    const sampleCount = frameCount * dice.length;
    if (sampleCount > this.#traceLimits.maxSamples) {
      throw new TraceLimitExceededError('samples', this.#traceLimits.maxSamples, sampleCount);
    }
    frames.push(snapshotFrame(dice, elapsedSeconds));
  }

  #appendTraceEvent(events: PhysicalRollTraceEvent[], event: PhysicalRollTraceEvent): void {
    const eventCount = events.length + 1;
    if (eventCount > this.#traceLimits.maxEvents) {
      throw new TraceLimitExceededError('events', this.#traceLimits.maxEvents, eventCount);
    }
    events.push(Object.freeze(event));
  }

  #createPhysicalSpecs(
    parsed: RollNotation,
    sessionId: string,
    visualPresetSelector?: VisualPresetSelector,
  ): PhysicalDieSpec[] {
    const specs: PhysicalDieSpec[] = [];
    let groupIndex = 0;
    for (const [expressionIndex, expression] of parsed.expressions.entries()) {
      if (expression.kind === 'modifier') continue;
      const termId = `term-${expressionIndex}`;
      if (expression.kind === 'dice') {
        const type = `d${expression.sides}`;
        if (!isDieType(type)) throw new RangeError(`${type} is not a standard die type`);
        if (!isPhysicalDieType(type)) throw new RangeError(`${type} is not a physical die type`);
        for (let count = 0; count < expression.count; count += 1) {
          const physicalIndex = specs.length;
          const preset = this.#resolveVisualPreset(
            {
              physicalDieType: type,
              logicalDieType: type,
              termId,
              expressionIndex,
              dieIndex: count,
              physicalIndex,
            },
            visualPresetSelector,
          );
          specs.push({
            type,
            geometryType: this.#getPresetGeometryType(preset),
            preset,
            termId,
            expressionIndex,
            dieIndex: count,
            physicalIndex,
            ...(expression.selection === undefined ? {} : { selection: expression.selection }),
            ...(expression.score === undefined ? {} : { scoreRules: expression.score }),
          });
        }
        continue;
      }

      for (let count = 0; count < expression.count; count += 1) {
        const groupId = `${sessionId}:group-${groupIndex++}`;
        if (expression.type === 'd100') {
          const tensPhysicalIndex = specs.length;
          const tensPreset = this.#resolveVisualPreset(
            {
              physicalDieType: 'd10',
              logicalDieType: 'd100',
              termId,
              expressionIndex,
              dieIndex: count,
              physicalIndex: tensPhysicalIndex,
              component: { groupType: 'd100', role: 'tens' },
            },
            visualPresetSelector,
          );
          specs.push({
            type: 'd100',
            geometryType: this.#getPresetGeometryType(tensPreset),
            preset: tensPreset,
            termId,
            expressionIndex,
            dieIndex: count,
            physicalIndex: tensPhysicalIndex,
            component: { groupId, groupType: 'd100', role: 'tens' },
            faceLabels: D100_TENS_LABELS,
          });
          const unitsPhysicalIndex = specs.length;
          const unitsPreset = this.#resolveVisualPreset(
            {
              physicalDieType: 'd10',
              logicalDieType: 'd100',
              termId,
              expressionIndex,
              dieIndex: count,
              physicalIndex: unitsPhysicalIndex,
              component: { groupType: 'd100', role: 'units' },
            },
            visualPresetSelector,
          );
          specs.push({
            type: 'd10',
            geometryType: this.#getPresetGeometryType(unitsPreset),
            preset: unitsPreset,
            termId,
            expressionIndex,
            dieIndex: count,
            physicalIndex: unitsPhysicalIndex,
            component: { groupId, groupType: 'd100', role: 'units' },
          });
          continue;
        }
        const tensPhysicalIndex = specs.length;
        const tensPreset = this.#resolveVisualPreset(
          {
            physicalDieType: 'd6',
            logicalDieType: 'd66',
            termId,
            expressionIndex,
            dieIndex: count,
            physicalIndex: tensPhysicalIndex,
            component: { groupType: 'd66', role: 'tens' },
          },
          visualPresetSelector,
        );
        specs.push({
          type: 'd6',
          geometryType: this.#getPresetGeometryType(tensPreset),
          preset: tensPreset,
          termId,
          expressionIndex,
          dieIndex: count,
          physicalIndex: tensPhysicalIndex,
          component: { groupId, groupType: 'd66', role: 'tens' },
          faceLabels: D66_TENS_LABELS,
        });
        const unitsPhysicalIndex = specs.length;
        const unitsPreset = this.#resolveVisualPreset(
          {
            physicalDieType: 'd6',
            logicalDieType: 'd66',
            termId,
            expressionIndex,
            dieIndex: count,
            physicalIndex: unitsPhysicalIndex,
            component: { groupType: 'd66', role: 'units' },
          },
          visualPresetSelector,
        );
        specs.push({
          type: 'd6',
          geometryType: this.#getPresetGeometryType(unitsPreset),
          preset: unitsPreset,
          termId,
          expressionIndex,
          dieIndex: count,
          physicalIndex: unitsPhysicalIndex,
          component: { groupId, groupType: 'd66', role: 'units' },
        });
      }
    }
    return specs;
  }

  #resolveVisualPreset(
    coordinates: Omit<VisualPresetSelectionContext, 'defaultPresetId'>,
    selector?: VisualPresetSelector,
  ): VisualPresetDescriptor {
    const defaultPreset = this.getVisualPreset(coordinates.physicalDieType);
    if (selector === undefined) return defaultPreset;
    const context: VisualPresetSelectionContext = Object.freeze({
      ...coordinates,
      ...(coordinates.component === undefined
        ? {}
        : { component: Object.freeze({ ...coordinates.component }) }),
      defaultPresetId: defaultPreset.id,
    });
    const selectedId = selector(context);
    if (selectedId === undefined) return defaultPreset;
    if (typeof selectedId !== 'string') {
      throw new TypeError('visualPresetSelector must return a preset ID or undefined');
    }
    const preset = this.#visualPresets.get(selectedId);
    if (preset === undefined) throw new RangeError(`Unknown visual preset: ${selectedId}`);
    if (preset.dieType !== coordinates.physicalDieType) {
      throw new RangeError(
        `Visual preset "${selectedId}" is for ${preset.dieType}, not ${coordinates.physicalDieType}`,
      );
    }
    return preset;
  }

  #placeDie(
    generated: { readonly x: number; readonly y: number; readonly z: number },
    index: number,
    total: number,
  ): { readonly x: number; readonly y: number; readonly z: number } {
    if (total <= 4) return generated;
    const columns = Math.ceil(Math.sqrt((total * this.#tray.width) / this.#tray.depth));
    const rows = Math.ceil(total / columns);
    const column = index % columns;
    const row = Math.floor(index / columns);
    const cellWidth = (this.#tray.width - 1) / columns;
    const cellDepth = (this.#tray.depth - 1) / rows;
    return {
      x: (column - (columns - 1) / 2) * cellWidth + generated.x * 0.03,
      y: generated.y,
      z: (row - (rows - 1) / 2) * cellDepth + generated.z * 0.03,
    };
  }

  #scheduleFrame(): void {
    if (this.#active === undefined || this.#frameToken !== undefined) return;
    this.#frameToken = this.#scheduler.request((timestampMs) => {
      this.#frameToken = undefined;
      this.#runFrame(timestampMs);
    });
  }

  #scheduleReplayFrame(): void {
    if (this.#replay === undefined || this.#frameToken !== undefined) return;
    this.#frameToken = this.#scheduler.request((timestampMs) => {
      this.#frameToken = undefined;
      this.#runReplayFrame(timestampMs);
    });
  }

  #runReplayFrame(timestampMs: number): void {
    const replay = this.#replay;
    if (replay === undefined) return;
    try {
      replay.startMs ??= timestampMs;
      const elapsedSeconds = Math.max(0, (timestampMs - replay.startMs) / 1_000);
      const frames = replay.trace.frames;
      const finalFrame = frames.at(-1)!;
      if (frames.length === 1 || elapsedSeconds >= finalFrame.elapsedSeconds) {
        this.#dispatchReplayEvents(replay, Number.POSITIVE_INFINITY);
        this.#renderReplayPair(replay.trace, finalFrame, finalFrame, 1);
        this.#completeReplay(replay);
        return;
      }

      let nextIndex = frames.findIndex((frame) => frame.elapsedSeconds > elapsedSeconds);
      if (nextIndex < 0) nextIndex = frames.length - 1;
      const previous = frames[Math.max(0, nextIndex - 1)]!;
      const current = frames[nextIndex]!;
      const duration = current.elapsedSeconds - previous.elapsedSeconds;
      const alpha = duration <= 0 ? 1 : (elapsedSeconds - previous.elapsedSeconds) / duration;
      this.#dispatchReplayEvents(replay, elapsedSeconds);
      this.#renderReplayPair(replay.trace, previous, current, alpha);
      this.#scheduleReplayFrame();
    } catch (error) {
      this.#finishReplay(replay, error);
    }
  }

  #renderReplayPair(
    trace: PhysicalRollTrace,
    previous: PhysicalRollFrame,
    current: PhysicalRollFrame,
    alpha: number,
  ): void {
    for (const die of trace.dice) {
      this.#renderer.updateDie({
        id: die.id,
        presetId: die.presetId,
        geometryId: die.geometryId,
        scale: die.scale,
        ...(die.faceLabels === undefined ? {} : { faceLabels: die.faceLabels }),
        previous: getFrameDie(previous, die.id),
        current: getFrameDie(current, die.id),
      });
    }
    this.#renderer.render(alpha);
  }

  #dispatchReplayEvents(replay: ActiveReplay, elapsedSeconds: number): void {
    while (replay.nextEventIndex < replay.trace.events.length) {
      const traceEvent = replay.trace.events[replay.nextEventIndex]!;
      if (traceEvent.elapsedSeconds > elapsedSeconds) return;
      replay.nextEventIndex += 1;
      const visual = this.#dieEvents.get(traceEvent.dieId);
      if (visual === undefined) continue;
      if (traceEvent.kind === 'collision') {
        this.emit(
          'die:collision',
          Object.freeze({
            ...visual,
            ...(traceEvent.otherDieId === undefined ? {} : { otherDieId: traceEvent.otherDieId }),
            started: traceEvent.started,
          }),
        );
      } else {
        this.emit(
          'die:impact',
          Object.freeze({
            ...visual,
            ...(traceEvent.otherDieId === undefined ? {} : { otherDieId: traceEvent.otherDieId }),
            force: traceEvent.force,
          }),
        );
      }
    }
  }

  #completeReplay(replay: ActiveReplay): void {
    this.#finishReplay(replay);
  }

  #cancelReplay(): void {
    const replay = this.#replay;
    if (replay === undefined) return;
    this.#frameToken?.cancel();
    this.#frameToken = undefined;
    this.#finishReplay(replay, new RollCancelledError(replay.trace.result.id));
  }

  #finishReplay(replay: ActiveReplay, error?: unknown): void {
    if (this.#replay !== replay) return;
    this.#replay = undefined;
    if (replay.signal !== undefined && replay.abortListener !== undefined) {
      replay.signal.removeEventListener('abort', replay.abortListener);
    }
    if (error === undefined) {
      for (const id of replay.createdIds) this.#displayedDieIds.add(id);
      replay.resolve();
      return;
    }
    const reason = error instanceof RollCancelledError ? 'cancelled' : 'failed';
    const cleanupErrors = this.#removeDiceByIdSafely(replay.createdIds, reason);
    if (cleanupErrors.length === 0) replay.reject(error);
    else {
      replay.reject(
        new AggregateError([error, ...cleanupErrors], 'Trace replay failed', { cause: error }),
      );
    }
  }

  #removeDiceByIdSafely(ids: readonly string[], reason: DiceRemovalReason): unknown[] {
    const errors: unknown[] = [];
    for (const id of ids) {
      try {
        this.#removeDie(id, reason);
      } catch (error) {
        if (error instanceof AggregateError) errors.push(...error.errors);
        else errors.push(error);
      }
    }
    return errors;
  }

  #runFrame(timestampMs: number): void {
    const active = this.#active;
    if (active === undefined) return;
    try {
      const frameDelta = Math.max(
        0,
        Math.min((timestampMs - this.#lastFrameMs) / 1_000, this.#maxFrameDeltaSeconds),
      );
      this.#lastFrameMs = timestampMs;
      this.#accumulatorSeconds += frameDelta;

      let emittedCollisionEvents = 0;
      while (this.#accumulatorSeconds >= this.#fixedStepSeconds) {
        for (const die of active.dice) die.previous = die.current;
        this.#physics.step(this.#fixedStepSeconds);
        if (this.#collisionEvents.enabled) {
          for (const collision of this.#physics.drainCollisionEvents()) {
            if (emittedCollisionEvents >= this.#collisionEvents.maxEventsPerFrame) continue;
            const event = this.#dieEvents.get(collision.dieId);
            if (event === undefined) continue;
            this.emit(
              'die:collision',
              Object.freeze({
                ...event,
                ...(collision.otherDieId === undefined ? {} : { otherDieId: collision.otherDieId }),
                started: collision.started,
              }),
            );
            emittedCollisionEvents += 1;
          }
          for (const impact of this.#physics.drainImpactEvents()) {
            if (emittedCollisionEvents >= this.#collisionEvents.maxEventsPerFrame) continue;
            const event = this.#dieEvents.get(impact.dieId);
            if (event === undefined) continue;
            this.emit(
              'die:impact',
              Object.freeze({
                ...event,
                ...(impact.otherDieId === undefined ? {} : { otherDieId: impact.otherDieId }),
                force: impact.force,
              }),
            );
            emittedCollisionEvents += 1;
          }
        }
        this.#accumulatorSeconds -= this.#fixedStepSeconds;
        for (const die of active.dice) {
          die.current = die.body.getState();
          if (die.result !== undefined) continue;
          const settling = die.detector.update(die.current, this.#fixedStepSeconds * 1_000);
          if (settling === 'timed-out') throw new RollTimeoutError(active.task.session.id);
          if (settling === 'settled') {
            const geometry = getDieGeometry(die.geometryType);
            const faceValue = resolveFace(geometry, die.current.quaternion);
            die.result = this.#createDieResult(die, faceValue);
            this.emit('die:settled', { sessionId: active.task.session.id, die: die.result });
          }
        }
      }

      for (const die of active.dice) this.#renderer.updateDie(toRenderState(die));
      const allSettled = active.dice.every((die) => die.result !== undefined);
      this.#renderer.render(allSettled ? 1 : this.#accumulatorSeconds / this.#fixedStepSeconds);
      if (allSettled) {
        this.#completeActive(active);
        return;
      }
      this.#scheduleFrame();
    } catch (error) {
      this.#failActive(active, error);
    }
  }

  #createDieResult(die: ActiveDie, faceValue: number): DieResult {
    const mappedValue = die.preset.valueMap?.[faceValue] ?? faceValue;
    const provenance = {
      termId: die.termId,
      termIndex: die.expressionIndex,
      dieIndex: die.dieIndex,
      physicalIndex: die.physicalIndex,
      state: 'included' as const,
      faceValue: mappedValue,
    };
    if (die.component === undefined) {
      if (die.type === 'd100') throw new Error('A d100 result requires percentile component data');
      return Object.freeze({
        id: die.id,
        type: die.type,
        value: mappedValue,
        provenance: Object.freeze({ ...provenance, contribution: mappedValue }),
      });
    }
    const { groupId, groupType, role } = die.component;
    const digit = groupType === 'd100' ? mappedValue % 10 : mappedValue;
    return Object.freeze({
      id: die.id,
      type: die.type,
      value: role === 'tens' ? digit * 10 : digit,
      component: Object.freeze({ groupId, groupType, role, faceValue: mappedValue }),
      provenance: Object.freeze(provenance),
    });
  }

  #completeActive(active: ActiveRoll): void {
    const session = active.task.session;
    session.state = 'settled';
    session.completedAt = this.#now();
    if (session.startedAt === undefined) throw new Error('Active roll has no start time');
    const diceResults = this.#applyRollRules(active.dice);
    const result = createRollResult({
      id: session.id,
      notation: session.notation,
      dice: diceResults,
      modifier: getNotationModifier(active.task.parsed),
      startedAt: session.startedAt,
      completedAt: session.completedAt,
    });
    for (const die of active.dice) this.#displayedDieIds.add(die.id);
    this.#active = undefined;
    this.#detachAbort(active.task);
    active.task.resolve(result);
    this.emit('roll:complete', result);
    this.#startNext();
  }

  #applyRollRules(dice: readonly ActiveDie[]): DieResult[] {
    const expressionGroups = new Map<number, ActiveDie[]>();
    for (const die of dice) {
      const group = expressionGroups.get(die.expressionIndex) ?? [];
      group.push(die);
      expressionGroups.set(die.expressionIndex, group);
    }

    const inclusion = new Map<string, boolean>();
    for (const group of expressionGroups.values()) {
      const selection = group[0]?.selection;
      if (selection === undefined) continue;
      const ranked = group
        .map((die, index) => {
          if (die.result === undefined) throw new Error(`Die ${die.id} has no settled result`);
          return { die, index, value: die.result.value };
        })
        .toSorted((left, right) => {
          const highest = selection.operator === 'kh' || selection.operator === 'dh';
          const valueOrder = highest ? right.value - left.value : left.value - right.value;
          return valueOrder === 0 ? left.index - right.index : valueOrder;
        });
      const selected = new Set(ranked.slice(0, selection.count).map(({ die }) => die.id));
      const keepsSelected = selection.operator === 'kh' || selection.operator === 'kl';
      for (const die of group) {
        inclusion.set(die.id, keepsSelected ? selected.has(die.id) : !selected.has(die.id));
      }
    }

    return dice.map((die) => {
      if (die.result === undefined) throw new Error(`Die ${die.id} has no settled result`);
      const included = inclusion.get(die.id);
      const score =
        die.scoreRules === undefined
          ? undefined
          : this.#scoreFace(die.result.value, die.scoreRules);
      if (included === undefined && score === undefined) return die.result;
      if (die.result.component !== undefined) {
        throw new Error(`Paired die ${die.id} cannot use keep/drop or score rules`);
      }
      const provenance = die.result.provenance;
      if (provenance === undefined) throw new Error(`Die ${die.id} has no result provenance`);
      return Object.freeze({
        ...die.result,
        ...(included === undefined ? {} : { included }),
        ...(score === undefined ? {} : { score }),
        provenance: Object.freeze({
          ...provenance,
          state: included === false ? ('discarded' as const) : ('included' as const),
          contribution: included === false ? 0 : (score ?? die.result.value),
        }),
      });
    });
  }

  #scoreFace(value: number, rules: readonly DiceScoreRule[]): number {
    return rules.find((rule) => value >= rule.minimum && value <= rule.maximum)?.score ?? 0;
  }

  #cancelActive(task: RollTask): void {
    this.#frameToken?.cancel();
    this.#frameToken = undefined;
    const active = this.#active;
    this.#active = undefined;
    const cleanupErrors =
      active === undefined ? [] : this.#removeDiceSafely(active.dice, 'cancelled');
    this.#rejectCancelled(task);
    if (cleanupErrors.length > 0) {
      this.emit('error', {
        session: snapshotSession(task.session),
        error: new AggregateError(cleanupErrors, `Failed to clean up ${task.session.id}`),
      });
    }
    this.#startNext();
  }

  #rejectCancelled(task: RollTask): void {
    task.session.state = 'cancelled';
    task.session.completedAt = this.#now();
    this.#detachAbort(task);
    task.reject(new RollCancelledError(task.session.id));
    this.emit('roll:cancel', snapshotSession(task.session));
  }

  #failActive(active: ActiveRoll, error: unknown): void {
    this.#active = undefined;
    const cleanupErrors = this.#removeDiceSafely(active.dice, 'failed');
    this.#failTask(
      active.task,
      cleanupErrors.length === 0
        ? error
        : new AggregateError([error, ...cleanupErrors], `Roll ${active.task.session.id} failed`, {
            cause: error,
          }),
    );
  }

  #failTask(task: RollTask, error: unknown): void {
    task.session.state = 'failed';
    task.session.completedAt = this.#now();
    this.#detachAbort(task);
    task.reject(error);
    this.emit('error', { session: snapshotSession(task.session), error });
    this.#startNext();
  }

  #removeDiceSafely(dice: readonly ActiveDie[], reason: DiceRemovalReason): unknown[] {
    const errors: unknown[] = [];
    for (const die of dice) {
      try {
        this.#removeDie(die.id, reason);
      } catch (error) {
        if (error instanceof AggregateError) errors.push(...error.errors);
        else errors.push(error);
      }
    }
    return errors;
  }

  #removeDisplayedDice(): void {
    const cleanupErrors: unknown[] = [];
    for (const id of this.#displayedDieIds) {
      try {
        this.#removeDie(id, 'replaced');
      } catch (error) {
        if (error instanceof AggregateError) cleanupErrors.push(...error.errors);
        else cleanupErrors.push(error);
      }
    }
    this.#displayedDieIds.clear();
    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, 'Failed to remove displayed dice');
    }
  }

  #removeDie(id: string, reason: DiceRemovalReason): void {
    const cleanupErrors = this.#runCleanup([
      () => this.#physics.removeDie(id),
      () => this.#renderer.removeDie(id),
    ]);
    const event = this.#dieEvents.get(id);
    if (event !== undefined) {
      this.#dieEvents.delete(id);
      this.emit('die:remove', Object.freeze({ ...event, reason }));
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, `Failed to remove die ${id}`);
    }
  }

  #clearRenderedDice(reason: DiceRemovalReason): void {
    const cleanupErrors = this.#runCleanup([
      () => this.#physics.clear(),
      () => this.#renderer.clear(),
    ]);
    this.#forgetRenderedDice(reason);
    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, 'Failed to clear rendered dice');
    }
  }

  #forgetRenderedDice(reason: DiceRemovalReason): void {
    for (const event of this.#dieEvents.values()) {
      this.emit('die:remove', Object.freeze({ ...event, reason }));
    }
    this.#dieEvents.clear();
    this.#displayedDieIds.clear();
  }

  #runCleanup(actions: readonly (() => void)[]): unknown[] {
    const errors: unknown[] = [];
    for (const action of actions) {
      try {
        action();
      } catch (error) {
        errors.push(error);
      }
    }
    return errors;
  }

  #detachAbort(task: RollTask): void {
    if (task.signal !== undefined && task.abortListener !== undefined) {
      task.signal.removeEventListener('abort', task.abortListener);
    }
  }

  #assertExclusiveOperationAvailable(operation: 'simulate' | 'replay'): void {
    if (this.#active !== undefined || this.#queue.length > 0 || this.#replay !== undefined) {
      throw new Error(`Cannot ${operation} while the engine is busy`);
    }
  }

  #assertValidTrace(trace: PhysicalRollTrace): void {
    if (trace.version !== 1) throw new TypeError(`Unsupported physical roll trace version`);
    if (trace.producer.name !== '@dice-o-rolla/dice-engine') {
      throw new TypeError('Trace producer metadata is invalid');
    }
    if (trace.producer.version !== DICE_ENGINE_VERSION) {
      throw new TypeError(
        `Trace producer version ${trace.producer.version} is incompatible with ${DICE_ENGINE_VERSION}`,
      );
    }
    if (!Number.isSafeInteger(trace.seed)) throw new TypeError('Trace seed must be a safe integer');
    assertPositive(trace.fixedStepSeconds, 'trace.fixedStepSeconds');
    assertPositiveSafeInteger(trace.frameIntervalSteps, 'trace.frameIntervalSteps');
    if (trace.profile.fixedStepSeconds !== trace.fixedStepSeconds) {
      throw new TypeError('Trace profile fixed step does not match its envelope');
    }
    const profileValidators = [
      new SettlingDetector(trace.profile.settling),
      new ThrowGenerator(new SeededRandomSource(trace.seed), trace.profile.throw),
    ];
    void profileValidators;
    for (const [name, value] of [
      ['tray.width', trace.profile.tray.width],
      ['tray.depth', trace.profile.tray.depth],
      ['tray.wallHeight', trace.profile.tray.wallHeight],
      ['tray.wallThickness', trace.profile.tray.wallThickness],
    ] as const) {
      assertPositive(value, `trace.profile.${name}`);
    }
    for (const [name, value] of [
      ['tray.material.friction', trace.profile.tray.material.friction],
      ['tray.material.restitution', trace.profile.tray.material.restitution],
      ['diceMaterial.friction', trace.profile.diceMaterial.friction],
      ['diceMaterial.restitution', trace.profile.diceMaterial.restitution],
      ['diceMaterial.linearDamping', trace.profile.diceMaterial.linearDamping],
      ['diceMaterial.angularDamping', trace.profile.diceMaterial.angularDamping],
    ] as const) {
      if (!Number.isFinite(value) || value < 0) {
        throw new RangeError(`trace.profile.${name} must be a non-negative finite number`);
      }
    }
    if (!Number.isFinite(trace.durationSeconds) || trace.durationSeconds < 0) {
      throw new RangeError('trace.durationSeconds must be a non-negative finite number');
    }
    if (trace.frames.length === 0) throw new TypeError('Trace must contain at least one frame');
    if (trace.dice.length === 0) throw new TypeError('Trace must contain at least one die');
    if (trace.frames.length > this.#traceLimits.maxFrames) {
      throw new TraceLimitExceededError('frames', this.#traceLimits.maxFrames, trace.frames.length);
    }
    const sampleCount = trace.frames.length * trace.dice.length;
    if (sampleCount > this.#traceLimits.maxSamples) {
      throw new TraceLimitExceededError('samples', this.#traceLimits.maxSamples, sampleCount);
    }
    if (trace.events.length > this.#traceLimits.maxEvents) {
      throw new TraceLimitExceededError('events', this.#traceLimits.maxEvents, trace.events.length);
    }
    if (trace.result.notation !== trace.notation) {
      throw new TypeError('Trace result notation does not match its envelope');
    }

    const ids = new Set<string>();
    for (const die of trace.dice) {
      if (ids.has(die.id)) throw new TypeError(`Trace contains duplicate die id "${die.id}"`);
      ids.add(die.id);
      if (!isDieType(die.type) || !isDieType(die.geometryId) || !hasDieGeometry(die.geometryId)) {
        throw new TypeError(`Trace die "${die.id}" has an unsupported type or geometry`);
      }
      assertPositive(die.scale, `trace die "${die.id}" scale`);
      const preset = this.#visualPresets.get(die.presetId);
      if (preset === undefined) {
        throw new TypeError(`Trace requires unregistered visual preset "${die.presetId}"`);
      }
      if (preset.geometryId !== die.geometryId) {
        throw new TypeError(`Trace geometry does not match visual preset "${die.presetId}"`);
      }
      if ((preset.scale ?? 1) !== die.scale) {
        throw new TypeError(`Trace scale does not match visual preset "${die.presetId}"`);
      }
      const fingerprint = definitionFingerprint(
        getDieGeometry(die.geometryId),
        preset,
        die.faceLabels,
      );
      if (die.definitionFingerprint !== fingerprint) {
        throw new TypeError(`Trace definition fingerprint mismatch for "${die.id}"`);
      }
      this.#assertFiniteTraceTransform(die.initial, `trace die "${die.id}" initial`);
      for (const [name, value] of Object.entries({
        impulseX: die.initial.impulse.x,
        impulseY: die.initial.impulse.y,
        impulseZ: die.initial.impulse.z,
        torqueX: die.initial.torqueImpulse.x,
        torqueY: die.initial.torqueImpulse.y,
        torqueZ: die.initial.torqueImpulse.z,
      })) {
        if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
      }
    }

    let previousElapsed = -1;
    for (const frame of trace.frames) {
      if (
        !Number.isFinite(frame.elapsedSeconds) ||
        frame.elapsedSeconds < 0 ||
        frame.elapsedSeconds < previousElapsed
      ) {
        throw new RangeError('Trace frame times must be finite, non-negative, and ordered');
      }
      previousElapsed = frame.elapsedSeconds;
      if (frame.dice.length !== trace.dice.length) {
        throw new TypeError('Every trace frame must contain every die exactly once');
      }
      const frameIds = new Set<string>();
      for (const die of frame.dice) {
        if (!ids.has(die.id) || frameIds.has(die.id)) {
          throw new TypeError(`Trace frame contains an unknown or duplicate die id "${die.id}"`);
        }
        frameIds.add(die.id);
        this.#assertFiniteTraceTransform(die, `trace frame die "${die.id}"`);
      }
    }
    const finalFrame = trace.frames.at(-1)!;
    if (Math.abs(finalFrame.elapsedSeconds - trace.durationSeconds) > 1e-9) {
      throw new RangeError('Trace final frame must match trace duration');
    }

    let previousEventTime = -1;
    for (const event of trace.events) {
      if (event.kind !== 'collision' && event.kind !== 'impact') {
        throw new TypeError('Trace event kind is invalid');
      }
      if (!ids.has(event.dieId) || (event.otherDieId !== undefined && !ids.has(event.otherDieId))) {
        throw new TypeError('Trace event references an unknown die');
      }
      if (
        !Number.isFinite(event.elapsedSeconds) ||
        event.elapsedSeconds < previousEventTime ||
        event.elapsedSeconds > trace.durationSeconds
      ) {
        throw new RangeError('Trace event times must be finite, ordered, and inside the trace');
      }
      previousEventTime = event.elapsedSeconds;
      if (event.kind === 'collision' && typeof event.started !== 'boolean') {
        throw new TypeError('Trace collision state must be boolean');
      }
      if (event.kind === 'impact' && (!Number.isFinite(event.force) || event.force < 0)) {
        throw new RangeError('Trace impact force must be a non-negative finite number');
      }
    }

    const resultDice = new Map(trace.result.dice.map((die) => [die.id, die]));
    if (resultDice.size !== trace.dice.length || trace.result.dice.length !== trace.dice.length) {
      throw new TypeError('Trace result must contain every physical die exactly once');
    }
    for (const die of trace.dice) {
      const result = resultDice.get(die.id);
      if (result === undefined) throw new TypeError(`Trace result is missing die "${die.id}"`);
      if (!isDieType(die.geometryId)) {
        throw new TypeError(`Trace die "${die.id}" has an unsupported geometry`);
      }
      const preset = this.#visualPresets.get(die.presetId)!;
      const resolved = resolveFace(
        getDieGeometry(die.geometryId),
        getFrameDie(finalFrame, die.id).quaternion,
      );
      const mapped = preset.valueMap?.[resolved] ?? resolved;
      const reportedFace = result.component?.faceValue ?? result.value;
      if (mapped !== reportedFace) {
        throw new TypeError(`Trace final orientation does not match result die "${die.id}"`);
      }
    }
    const verifiedResult = createRollResult({
      id: trace.result.id,
      notation: trace.result.notation,
      dice: trace.result.dice,
      modifier: trace.result.modifier,
      startedAt: trace.result.startedAt,
      completedAt: trace.result.completedAt,
    });
    if (verifiedResult.total !== trace.result.total) {
      throw new TypeError('Trace result total does not match its dice and modifier');
    }
  }

  #assertFiniteTraceTransform(
    transform: {
      readonly position: { readonly x: number; readonly y: number; readonly z: number };
      readonly quaternion: {
        readonly x: number;
        readonly y: number;
        readonly z: number;
        readonly w: number;
      };
    },
    description: string,
  ): void {
    if (
      ![
        transform.position.x,
        transform.position.y,
        transform.position.z,
        transform.quaternion.x,
        transform.quaternion.y,
        transform.quaternion.z,
        transform.quaternion.w,
      ].every(Number.isFinite)
    ) {
      throw new RangeError(`${description} transform must contain finite values`);
    }
  }

  #assertSupportedAndWithinLimits(parsed: RollNotation): void {
    let logicalDice = 0;
    let physicalDice = 0;
    for (const expression of parsed.expressions) {
      if (expression.kind === 'modifier') continue;
      if (expression.kind === 'dice') {
        const type = `d${expression.sides}`;
        if (!isDieType(type) || !hasDieGeometry(type)) {
          throw new RangeError(`${type} is not supported by the current engine`);
        }
      }

      logicalDice = this.#addWithinLimit(
        logicalDice,
        expression.count,
        'logical-dice',
        this.#limits.maxLogicalDice,
      );
      physicalDice = this.#addWeightedWithinLimit(
        physicalDice,
        expression.count,
        expression.kind === 'paired-dice' ? 2 : 1,
        'physical-dice',
        this.#limits.maxPhysicalDice,
      );
    }
  }

  #addWithinLimit(
    current: number,
    increment: number,
    limit: 'logical-dice' | 'physical-dice',
    maximum: number,
  ): number {
    if (increment > maximum - current) {
      throw new RollLimitExceededError(limit, maximum, current + increment);
    }
    return current + increment;
  }

  #addWeightedWithinLimit(
    current: number,
    count: number,
    weight: number,
    limit: 'physical-dice',
    maximum: number,
  ): number {
    if (count > Math.floor((maximum - current) / weight)) {
      throw new RollLimitExceededError(limit, maximum, current + count * weight);
    }
    return current + count * weight;
  }

  #mergeTheme(theme: Partial<DiceTheme>): DiceTheme {
    const merged = Object.freeze({ ...DEFAULT_THEME, ...theme });
    if (merged.bodyColor.length === 0 || merged.labelColor.length === 0) {
      throw new RangeError('Theme colors must not be empty');
    }
    for (const [name, value] of [
      ['roughness', merged.roughness],
      ['metalness', merged.metalness],
    ] as const) {
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new RangeError(`Theme ${name} must be a finite number in [0, 1]`);
      }
    }
    return merged;
  }

  #assertValidVisualPreset(preset: VisualPresetDescriptor): void {
    if (!isDieType(preset.dieType) || !isPhysicalDieType(preset.dieType)) {
      throw new RangeError(`Visual preset die type is not supported: ${preset.dieType}`);
    }
    if (!isDieType(preset.geometryId) || !hasDieGeometry(preset.geometryId)) {
      throw new RangeError(`Visual preset geometry is not registered: ${preset.geometryId}`);
    }
    const geometry = getDieGeometry(preset.geometryId);
    const faceValues = new Set(geometry.faces.map((face) => face.value));
    const logicalSides = Number(preset.dieType.slice(1));
    if (preset.valueMap !== undefined) {
      const mappedFaces = Object.keys(preset.valueMap).map(Number);
      if (
        mappedFaces.length !== faceValues.size ||
        mappedFaces.some((face) => !faceValues.has(face))
      ) {
        throw new RangeError('Visual preset valueMap must map every geometry face exactly once');
      }
    }
    for (const face of faceValues) {
      const value = preset.valueMap?.[face] ?? face;
      if (!Number.isSafeInteger(value) || value < 1 || value > logicalSides) {
        throw new RangeError(`Visual preset maps geometry face ${face} outside ${preset.dieType}`);
      }
    }
    if (
      preset.faceLabels !== undefined &&
      Object.keys(preset.faceLabels).some((face) => !faceValues.has(Number(face)))
    ) {
      throw new RangeError('Visual preset faceLabels contain a face absent from its geometry');
    }
  }

  #getPresetGeometryType(preset: VisualPresetDescriptor): DieType {
    if (!isDieType(preset.geometryId) || !hasDieGeometry(preset.geometryId)) {
      throw new RangeError(`Visual preset geometry is not registered: ${preset.geometryId}`);
    }
    return preset.geometryId;
  }

  #assertReady(): void {
    this.#assertAlive();
    if (!this.#initialized) throw new Error('DiceEngine has not been initialized');
  }

  #assertAlive(): void {
    if (this.#destroyed) throw new DiceEngineDestroyedError();
  }
}
