import {
  createRollResult,
  getNotationModifier,
  isDieType,
  mathRandomSource,
  parseNotation,
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
import { SettlingDetector, ThrowGenerator } from '@dice-o-rolla/dice-physics';
import type { PhysicsDieHandle, PhysicsDieState } from '@dice-o-rolla/dice-physics';
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
} from './errors.js';
import type {
  DiceEngineEvents,
  DiceEngineFacade,
  DiceEngineLimits,
  DiceEngineOptions,
  DiceRemovalReason,
  DiceTheme,
  DiceVisualEvent,
  FrameToken,
  RegisterEngineVisualPresetOptions,
  RollOptions,
} from './types.js';
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
}

interface ActiveDie {
  readonly id: string;
  readonly type: DieType;
  readonly geometryType: DieType;
  readonly preset: VisualPresetDescriptor;
  readonly expressionIndex: number;
  readonly selection?: DiceSelection;
  readonly scoreRules?: readonly DiceScoreRule[];
  readonly component?: {
    readonly groupId: string;
    readonly groupType: PairedDiceType;
    readonly role: DiceComponentRole;
  };
  readonly faceLabels?: Readonly<Record<number, string | number>>;
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
  readonly expressionIndex: number;
  readonly selection?: DiceSelection;
  readonly scoreRules?: readonly DiceScoreRule[];
  readonly component?: ActiveDie['component'];
  readonly faceLabels?: Readonly<Record<number, string | number>>;
}

interface ActiveRoll {
  readonly task: RollTask;
  readonly dice: ActiveDie[];
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
  readonly #throwGenerator: ThrowGenerator;
  readonly #tray: NonNullable<DiceEngineOptions['tray']>;
  readonly #diceMaterial: NonNullable<DiceEngineOptions['diceMaterial']>;
  readonly #limits: DiceEngineLimits;
  readonly #collisionEvents: Readonly<{ enabled: boolean; maxEventsPerFrame: number }>;
  readonly #visualPresets = new VisualPresetRegistry(STANDARD_VISUAL_PRESETS);
  readonly #visualPresetIds = new Map<PhysicalDieType, string>();
  readonly #queue: RollTask[] = [];
  readonly #displayedDieIds = new Set<string>();
  readonly #dieEvents = new Map<string, DiceVisualEvent>();
  #active: ActiveRoll | undefined;
  #frameToken: FrameToken | undefined;
  #lastFrameMs = 0;
  #accumulatorSeconds = 0;
  #nextSessionId = 1;
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
    this.#throwGenerator = new ThrowGenerator(
      options.random ?? mathRandomSource,
      options.throw ?? DEFAULT_THROW,
    );
    this.#tray = options.tray ?? DEFAULT_TRAY;
    this.#diceMaterial = options.diceMaterial ?? DEFAULT_DICE_MATERIAL;
    this.#limits = Object.freeze({ ...DEFAULT_LIMITS, ...options.limits });
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
      const task = this.#createTask(notation, parsed, options.signal);
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

  cancel(sessionId?: string): boolean {
    this.#assertAlive();
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

  #createTask(notation: string, parsed: RollNotation, signal?: AbortSignal): RollTask {
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
    const specs = this.#createPhysicalSpecs(task);
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
          expressionIndex: spec.expressionIndex,
          ...(spec.selection === undefined ? {} : { selection: spec.selection }),
          ...(spec.scoreRules === undefined ? {} : { scoreRules: spec.scoreRules }),
          ...(spec.component === undefined ? {} : { component: spec.component }),
          ...(faceLabels === undefined ? {} : { faceLabels }),
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

  #createPhysicalSpecs(task: RollTask): PhysicalDieSpec[] {
    const specs: PhysicalDieSpec[] = [];
    let groupIndex = 0;
    for (const [expressionIndex, expression] of task.parsed.expressions.entries()) {
      if (expression.kind === 'modifier') continue;
      if (expression.kind === 'dice') {
        const type = `d${expression.sides}`;
        if (!isDieType(type)) throw new RangeError(`${type} is not a standard die type`);
        if (!isPhysicalDieType(type)) throw new RangeError(`${type} is not a physical die type`);
        const preset = this.getVisualPreset(type);
        for (let count = 0; count < expression.count; count += 1) {
          specs.push({
            type,
            geometryType: this.#getPresetGeometryType(preset),
            preset,
            expressionIndex,
            ...(expression.selection === undefined ? {} : { selection: expression.selection }),
            ...(expression.score === undefined ? {} : { scoreRules: expression.score }),
          });
        }
        continue;
      }

      for (let count = 0; count < expression.count; count += 1) {
        const groupId = `${task.session.id}:group-${groupIndex++}`;
        if (expression.type === 'd100') {
          const preset = this.getVisualPreset('d10');
          specs.push({
            type: 'd100',
            geometryType: this.#getPresetGeometryType(preset),
            preset,
            expressionIndex,
            component: { groupId, groupType: 'd100', role: 'tens' },
            faceLabels: D100_TENS_LABELS,
          });
          specs.push({
            type: 'd10',
            geometryType: this.#getPresetGeometryType(preset),
            preset,
            expressionIndex,
            component: { groupId, groupType: 'd100', role: 'units' },
          });
          continue;
        }
        const preset = this.getVisualPreset('d6');
        specs.push({
          type: 'd6',
          geometryType: this.#getPresetGeometryType(preset),
          preset,
          expressionIndex,
          component: { groupId, groupType: 'd66', role: 'tens' },
          faceLabels: D66_TENS_LABELS,
        });
        specs.push({
          type: 'd6',
          geometryType: this.#getPresetGeometryType(preset),
          preset,
          expressionIndex,
          component: { groupId, groupType: 'd66', role: 'units' },
        });
      }
    }
    return specs;
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
    if (die.component === undefined) {
      if (die.type === 'd100') throw new Error('A d100 result requires percentile component data');
      return Object.freeze({ id: die.id, type: die.type, value: mappedValue });
    }
    const { groupId, groupType, role } = die.component;
    const digit = groupType === 'd100' ? mappedValue % 10 : mappedValue;
    return Object.freeze({
      id: die.id,
      type: die.type,
      value: role === 'tens' ? digit * 10 : digit,
      component: Object.freeze({ groupId, groupType, role, faceValue: mappedValue }),
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
      return Object.freeze({
        ...die.result,
        ...(included === undefined ? {} : { included }),
        ...(score === undefined ? {} : { score }),
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
