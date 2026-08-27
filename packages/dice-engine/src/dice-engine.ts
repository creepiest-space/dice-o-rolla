import {
  createRollResult,
  getNotationModifier,
  isDieType,
  mathRandomSource,
  parseNotation,
  TypedEventEmitter,
} from '@creepiest-space/dice-core';
import type {
  DieResult,
  DieType,
  RollNotation,
  RollResult,
  RollSession,
  RollState,
} from '@creepiest-space/dice-core';
import { getDieGeometry, hasDieGeometry, resolveFace } from '@creepiest-space/dice-geometry';
import { SettlingDetector, ThrowGenerator } from '@creepiest-space/dice-physics';
import type { PhysicsDieHandle, PhysicsDieState } from '@creepiest-space/dice-physics';
import type { RenderDieState, RendererViewport } from '@creepiest-space/dice-renderer';

import { DEFAULT_THEME, defaultFrameScheduler } from './defaults.js';
import { DiceEngineDestroyedError, RollCancelledError, RollTimeoutError } from './errors.js';
import type {
  DiceEngineEvents,
  DiceEngineFacade,
  DiceEngineOptions,
  DiceTheme,
  FrameToken,
  RollOptions,
} from './types.js';

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
  readonly body: PhysicsDieHandle;
  readonly detector: SettlingDetector;
  previous: PhysicsDieState;
  current: PhysicsDieState;
  result?: DieResult;
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
  wallHeight: 2,
  wallThickness: 0.25,
  material: { friction: 0.8, restitution: 0.1 },
} as const;

const DEFAULT_DICE_MATERIAL = {
  friction: 0.7,
  restitution: 0.15,
  linearDamping: 0.25,
  angularDamping: 0.25,
} as const;

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
    geometryId: die.type,
    previous: die.previous,
    current: die.current,
  };
}

function assertPositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
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
  readonly #queue: RollTask[] = [];
  readonly #displayedDieIds = new Set<string>();
  #active: ActiveRoll | undefined;
  #frameToken: FrameToken | undefined;
  #lastFrameMs = 0;
  #accumulatorSeconds = 0;
  #nextSessionId = 1;
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
    this.#theme = this.#mergeTheme(options.theme ?? {});
  }

  async initialize(): Promise<void> {
    this.#assertAlive();
    if (this.#initialized) return;
    this.#physics.configureTray(this.#tray);
    await this.#renderer.initialize();
    this.#renderer.setTheme(this.#theme);
    this.#initialized = true;
  }

  roll(notation: string, options: RollOptions = {}): Promise<RollResult> {
    try {
      this.#assertReady();
      if ((options.mode ?? 'queue') !== 'queue') {
        throw new RangeError('Only queue roll mode is currently supported');
      }
      const parsed = parseNotation(notation);
      this.#assertSupported(parsed);
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
    this.#physics.clear();
    this.#renderer.clear();
    this.#displayedDieIds.clear();
    this.#accumulatorSeconds = 0;
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

  destroy(): void {
    if (this.#destroyed) return;
    this.clear();
    this.#renderer.destroy();
    this.#physics.destroy();
    super.clear();
    this.#initialized = false;
    this.#destroyed = true;
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
      this.#failTask(task, error);
    }
  }

  #createDice(task: RollTask): ActiveDie[] {
    const dice: ActiveDie[] = [];
    let index = 0;
    const totalDice = task.parsed.expressions.reduce(
      (total, expression) => total + (expression.kind === 'dice' ? expression.count : 0),
      0,
    );
    try {
      for (const expression of task.parsed.expressions) {
        if (expression.kind !== 'dice') continue;
        const type = `d${expression.sides}`;
        if (!isDieType(type)) throw new RangeError(`${type} is not a standard die type`);
        const geometry = getDieGeometry(type);
        for (let count = 0; count < expression.count; count += 1) {
          const id = `${task.session.id}:die-${index++}`;
          const generated = this.#throwGenerator.generate();
          const position = this.#placeDie(generated.position, index - 1, totalDice);
          const body = this.#physics.createDie({
            id,
            type,
            collider: {
              kind: 'convex-hull',
              vertices: geometry.vertices.map(([x, y, z]) => ({ x, y, z })),
            },
            scale: 1,
            mass: 1,
            material: this.#diceMaterial,
            position,
            quaternion: generated.quaternion,
          });
          const state = body.getState();
          const die: ActiveDie = {
            id,
            type,
            body,
            detector: new SettlingDetector(this.#settling),
            previous: state,
            current: state,
          };
          dice.push(die);
          this.#renderer.createDie(toRenderState(die));
          body.applyImpulse(generated.impulse, generated.torqueImpulse);
        }
      }
      return dice;
    } catch (error) {
      for (const die of dice) {
        this.#physics.removeDie(die.id);
        this.#renderer.removeDie(die.id);
      }
      throw error;
    }
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

      while (this.#accumulatorSeconds >= this.#fixedStepSeconds) {
        for (const die of active.dice) die.previous = die.current;
        this.#physics.step(this.#fixedStepSeconds);
        this.#accumulatorSeconds -= this.#fixedStepSeconds;
        for (const die of active.dice) {
          die.current = die.body.getState();
          if (die.result !== undefined) continue;
          const settling = die.detector.update(die.current, this.#fixedStepSeconds * 1_000);
          if (settling === 'timed-out') throw new RollTimeoutError(active.task.session.id);
          if (settling === 'settled') {
            const geometry = getDieGeometry(die.type);
            die.result = Object.freeze({
              id: die.id,
              type: die.type,
              value: resolveFace(geometry, die.current.quaternion),
            });
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

  #completeActive(active: ActiveRoll): void {
    const session = active.task.session;
    session.state = 'settled';
    session.completedAt = this.#now();
    if (session.startedAt === undefined) throw new Error('Active roll has no start time');
    const diceResults = active.dice.map((die) => {
      if (die.result === undefined) throw new Error(`Die ${die.id} has no settled result`);
      return die.result;
    });
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
    this.emit('roll:complete', result);
    active.task.resolve(result);
    this.#startNext();
  }

  #cancelActive(task: RollTask): void {
    this.#frameToken?.cancel();
    this.#frameToken = undefined;
    const active = this.#active;
    this.#active = undefined;
    if (active !== undefined) this.#removeDice(active.dice);
    this.#rejectCancelled(task);
    this.#startNext();
  }

  #rejectCancelled(task: RollTask): void {
    task.session.state = 'cancelled';
    task.session.completedAt = this.#now();
    this.#detachAbort(task);
    this.emit('roll:cancel', snapshotSession(task.session));
    task.reject(new RollCancelledError(task.session.id));
  }

  #failActive(active: ActiveRoll, error: unknown): void {
    this.#active = undefined;
    this.#removeDice(active.dice);
    this.#failTask(active.task, error);
  }

  #failTask(task: RollTask, error: unknown): void {
    task.session.state = 'failed';
    task.session.completedAt = this.#now();
    this.#detachAbort(task);
    this.emit('error', { session: snapshotSession(task.session), error });
    task.reject(error);
    this.#startNext();
  }

  #removeDice(dice: readonly ActiveDie[]): void {
    for (const die of dice) {
      this.#physics.removeDie(die.id);
      this.#renderer.removeDie(die.id);
    }
  }

  #removeDisplayedDice(): void {
    for (const id of this.#displayedDieIds) {
      this.#physics.removeDie(id);
      this.#renderer.removeDie(id);
    }
    this.#displayedDieIds.clear();
  }

  #detachAbort(task: RollTask): void {
    if (task.signal !== undefined && task.abortListener !== undefined) {
      task.signal.removeEventListener('abort', task.abortListener);
    }
  }

  #assertSupported(parsed: RollNotation): void {
    for (const expression of parsed.expressions) {
      if (expression.kind !== 'dice') continue;
      const type = `d${expression.sides}`;
      if (!isDieType(type) || !hasDieGeometry(type)) {
        throw new RangeError(`${type} is not supported by the current engine`);
      }
    }
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

  #assertReady(): void {
    this.#assertAlive();
    if (!this.#initialized) throw new Error('DiceEngine has not been initialized');
  }

  #assertAlive(): void {
    if (this.#destroyed) throw new DiceEngineDestroyedError();
  }
}
