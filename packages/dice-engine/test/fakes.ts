import type { QuaternionLike, Vector3Like } from '@dice-o-rolla/dice-core';
import type {
  CreatePhysicsDieOptions,
  PhysicsCollisionEvent,
  PhysicsDieHandle,
  PhysicsDieState,
  PhysicsWorld,
  TrayOptions,
} from '@dice-o-rolla/dice-physics';
import type {
  DiceRenderer,
  RenderDieState,
  RendererTheme,
  RendererViewport,
  VisualPresetDescriptor,
} from '@dice-o-rolla/dice-renderer';

import type { FrameScheduler, FrameToken } from '../src/index.js';

class FakeDie implements PhysicsDieHandle {
  readonly id: string;
  readonly #settleAfterSteps: number;
  readonly #position: Vector3Like;
  readonly #quaternion: QuaternionLike;
  #age = 0;

  constructor(options: CreatePhysicsDieOptions, settleAfterSteps: number) {
    this.id = options.id;
    this.#settleAfterSteps = settleAfterSteps;
    this.#position = options.position;
    this.#quaternion = options.quaternion;
  }

  step(): void {
    this.#age += 1;
  }

  getState(): PhysicsDieState {
    const settled = this.#age >= this.#settleAfterSteps;
    const velocity = settled ? 0 : 1;
    return {
      position: { ...this.#position },
      quaternion: { ...this.#quaternion },
      linearVelocity: { x: velocity, y: 0, z: 0 },
      angularVelocity: { x: 0, y: velocity, z: 0 },
      sleeping: settled,
    };
  }

  applyImpulse(): void {}

  wakeUp(): void {}
}

export class FakePhysics implements PhysicsWorld {
  readonly createdIds: string[] = [];
  readonly createdOptions: CreatePhysicsDieOptions[] = [];
  readonly removedIds: string[] = [];
  readonly bodies = new Map<string, FakeDie>();
  readonly settleAfterSteps: number;
  configureTrayCalls = 0;
  stepCalls = 0;
  clearCalls = 0;
  destroyCalls = 0;
  errorOnStep: unknown;
  collisionEventsEnabled = false;
  collisionEvents: PhysicsCollisionEvent[] = [];

  constructor(settleAfterSteps = 2) {
    this.settleAfterSteps = settleAfterSteps;
  }

  createDie(options: CreatePhysicsDieOptions): PhysicsDieHandle {
    const die = new FakeDie(options, this.settleAfterSteps);
    this.createdIds.push(options.id);
    this.createdOptions.push(options);
    this.bodies.set(options.id, die);
    return die;
  }

  configureTray(_options: TrayOptions): void {
    this.configureTrayCalls += 1;
  }

  setGravity(): void {}

  setCollisionEventsEnabled(enabled: boolean): void {
    this.collisionEventsEnabled = enabled;
  }

  drainCollisionEvents(): readonly PhysicsCollisionEvent[] {
    const events = this.collisionEvents.splice(0);
    return events;
  }

  step(): void {
    this.stepCalls += 1;
    if (this.errorOnStep !== undefined) throw this.errorOnStep;
    for (const die of this.bodies.values()) die.step();
  }

  removeDie(id: string): void {
    if (this.bodies.delete(id)) this.removedIds.push(id);
  }

  clear(): void {
    this.clearCalls += 1;
    this.bodies.clear();
  }

  destroy(): void {
    this.destroyCalls += 1;
  }
}

export class FakeRenderer implements DiceRenderer {
  readonly dice = new Map<string, RenderDieState>();
  readonly createdIds: string[] = [];
  readonly removedIds: string[] = [];
  readonly renderAlphas: number[] = [];
  readonly presets = new Map<string, VisualPresetDescriptor>();
  initializeCalls = 0;
  clearCalls = 0;
  destroyCalls = 0;
  lastViewport: RendererViewport | undefined;
  theme: RendererTheme | undefined;
  errorOnInitialize: unknown;

  initialize(): void {
    this.initializeCalls += 1;
    if (this.errorOnInitialize !== undefined) throw this.errorOnInitialize;
  }

  registerPreset(preset: VisualPresetDescriptor): void {
    this.presets.set(preset.id, preset);
  }

  unregisterPreset(id: string): void {
    this.presets.delete(id);
  }

  createDie(state: RenderDieState): void {
    this.createdIds.push(state.id);
    this.dice.set(state.id, state);
  }

  updateDie(state: RenderDieState): void {
    this.dice.set(state.id, state);
  }

  removeDie(id: string): void {
    if (this.dice.delete(id)) this.removedIds.push(id);
  }

  render(alpha: number): void {
    this.renderAlphas.push(alpha);
  }

  resize(viewport: RendererViewport): void {
    this.lastViewport = viewport;
  }

  setTheme(theme: RendererTheme): void {
    this.theme = theme;
  }

  clear(): void {
    this.clearCalls += 1;
    this.dice.clear();
  }

  destroy(): void {
    this.destroyCalls += 1;
  }
}

interface ScheduledFrame {
  active: boolean;
  readonly callback: (timestampMs: number) => void;
}

export class FakeScheduler implements FrameScheduler {
  readonly #frames: ScheduledFrame[] = [];
  now = 0;

  request(callback: (timestampMs: number) => void): FrameToken {
    const frame = { active: true, callback };
    this.#frames.push(frame);
    return { cancel: () => (frame.active = false) };
  }

  advance(deltaMs = 10): boolean {
    let frame = this.#frames.shift();
    while (frame !== undefined && !frame.active) frame = this.#frames.shift();
    if (frame === undefined) return false;
    this.now += deltaMs;
    frame.callback(this.now);
    return true;
  }

  flush(deltaMs = 10, limit = 100): void {
    for (let count = 0; count < limit && this.advance(deltaMs); count += 1) {}
  }
}
