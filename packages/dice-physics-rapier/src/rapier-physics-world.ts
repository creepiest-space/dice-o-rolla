import type { Vector3Like } from '@dice-o-rolla/dice-core';
import type {
  CreatePhysicsDieOptions,
  PhysicsCollisionEvent,
  PhysicsImpactEvent,
  PhysicsDieHandle,
  PhysicsWorld,
  TrayOptions,
} from '@dice-o-rolla/dice-physics';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { EventQueue, RigidBody, World } from '@dimforge/rapier3d-compat';

import { createConvexHullCollider } from './collider-factory.js';
import { RapierDieBody } from './rapier-die-body.js';
import { initializeRapier } from './rapier-module.js';
import { assertNonNegative, assertPositive, assertQuaternion, assertVector } from './validation.js';

export interface RapierPhysicsWorldOptions {
  readonly gravity?: Vector3Like;
}

const DEFAULT_GRAVITY: Vector3Like = { x: 0, y: -9.81, z: 0 };

export class RapierPhysicsWorld implements PhysicsWorld {
  readonly #rapier: typeof RAPIER;
  readonly #world: World;
  readonly #eventQueue: EventQueue;
  readonly #dice = new Map<string, RapierDieBody>();
  readonly #colliderDice = new Map<number, string>();
  readonly #dieColliders = new Map<string, number>();
  #trayBody: RigidBody | undefined;
  #collisionEventsEnabled = false;
  #destroyed = false;

  private constructor(rapier: typeof RAPIER, gravity: Vector3Like) {
    assertVector(gravity, 'gravity');
    this.#rapier = rapier;
    this.#world = new rapier.World(gravity);
    this.#eventQueue = new rapier.EventQueue(true);
  }

  static async create(options: RapierPhysicsWorldOptions = {}): Promise<RapierPhysicsWorld> {
    const rapier = await initializeRapier();
    return new RapierPhysicsWorld(rapier, options.gravity ?? DEFAULT_GRAVITY);
  }

  createDie(options: CreatePhysicsDieOptions): PhysicsDieHandle {
    this.#assertAlive();
    if (this.#dice.has(options.id)) {
      throw new Error(`A physics die with id "${options.id}" already exists`);
    }
    if (options.id.length === 0) throw new RangeError('id must not be empty');

    assertVector(options.position, 'position');
    assertQuaternion(options.quaternion, 'quaternion');
    assertNonNegative(options.material.linearDamping, 'material.linearDamping');
    assertNonNegative(options.material.angularDamping, 'material.angularDamping');

    const bodyDescriptor = this.#rapier.RigidBodyDesc.dynamic()
      .setTranslation(options.position.x, options.position.y, options.position.z)
      .setRotation(options.quaternion)
      .setLinearDamping(options.material.linearDamping)
      .setAngularDamping(options.material.angularDamping)
      .setCanSleep(true)
      .setCcdEnabled(true);
    const colliderDescriptor = createConvexHullCollider(
      this.#rapier,
      options.collider,
      options.scale,
      options.mass,
      options.material,
    );
    colliderDescriptor.setActiveEvents(
      this.#collisionEventsEnabled
        ? this.#rapier.ActiveEvents.COLLISION_EVENTS |
            this.#rapier.ActiveEvents.CONTACT_FORCE_EVENTS
        : this.#rapier.ActiveEvents.NONE,
    );
    const body = this.#world.createRigidBody(bodyDescriptor);

    try {
      const collider = this.#world.createCollider(colliderDescriptor, body);
      this.#colliderDice.set(collider.handle, options.id);
      this.#dieColliders.set(options.id, collider.handle);
    } catch (error) {
      this.#world.removeRigidBody(body);
      throw error;
    }

    const handle = new RapierDieBody(options.id, body);
    this.#dice.set(options.id, handle);
    return handle;
  }

  configureTray(options: TrayOptions): void {
    this.#assertAlive();
    assertPositive(options.width, 'tray.width');
    assertPositive(options.depth, 'tray.depth');
    assertPositive(options.wallHeight, 'tray.wallHeight');
    assertPositive(options.wallThickness, 'tray.wallThickness');
    assertNonNegative(options.material.friction, 'tray.material.friction');
    assertNonNegative(options.material.restitution, 'tray.material.restitution');

    this.#removeTray();
    const body = this.#world.createRigidBody(this.#rapier.RigidBodyDesc.fixed());
    const halfWidth = options.width / 2;
    const halfDepth = options.depth / 2;
    const halfWallHeight = options.wallHeight / 2;
    const halfThickness = options.wallThickness / 2;
    const createSurface = (
      halfX: number,
      halfY: number,
      halfZ: number,
      x: number,
      y: number,
      z: number,
    ): void => {
      const collider = this.#rapier.ColliderDesc.cuboid(halfX, halfY, halfZ)
        .setTranslation(x, y, z)
        .setFriction(options.material.friction)
        .setRestitution(options.material.restitution);
      this.#world.createCollider(collider, body);
    };

    createSurface(
      halfWidth + options.wallThickness,
      halfThickness,
      halfDepth + options.wallThickness,
      0,
      -halfThickness,
      0,
    );
    createSurface(
      halfThickness,
      halfWallHeight,
      halfDepth,
      -halfWidth - halfThickness,
      halfWallHeight,
      0,
    );
    createSurface(
      halfThickness,
      halfWallHeight,
      halfDepth,
      halfWidth + halfThickness,
      halfWallHeight,
      0,
    );
    createSurface(
      halfWidth,
      halfWallHeight,
      halfThickness,
      0,
      halfWallHeight,
      -halfDepth - halfThickness,
    );
    createSurface(
      halfWidth,
      halfWallHeight,
      halfThickness,
      0,
      halfWallHeight,
      halfDepth + halfThickness,
    );
    this.#trayBody = body;
  }

  setGravity(gravity: Vector3Like): void {
    this.#assertAlive();
    assertVector(gravity, 'gravity');
    this.#world.gravity = { x: gravity.x, y: gravity.y, z: gravity.z };
  }

  setCollisionEventsEnabled(enabled: boolean): void {
    this.#assertAlive();
    this.#collisionEventsEnabled = enabled;
    const activeEvents = enabled
      ? this.#rapier.ActiveEvents.COLLISION_EVENTS | this.#rapier.ActiveEvents.CONTACT_FORCE_EVENTS
      : this.#rapier.ActiveEvents.NONE;
    for (const die of this.#dice.values()) {
      for (let index = 0; index < die.body.numColliders(); index += 1) {
        die.body.collider(index).setActiveEvents(activeEvents);
      }
    }
    this.#eventQueue.clear();
  }

  drainCollisionEvents(): readonly PhysicsCollisionEvent[] {
    this.#assertAlive();
    const events: PhysicsCollisionEvent[] = [];
    this.#eventQueue.drainCollisionEvents((firstHandle, secondHandle, started) => {
      const first = this.#colliderDice.get(firstHandle);
      const second = this.#colliderDice.get(secondHandle);
      const dieId = first ?? second;
      if (dieId === undefined) return;
      const otherDieId = first === undefined || second === undefined ? undefined : second;
      events.push(
        Object.freeze({
          dieId,
          ...(otherDieId === undefined ? {} : { otherDieId }),
          started,
        }),
      );
    });
    return Object.freeze(events);
  }

  drainImpactEvents(): readonly PhysicsImpactEvent[] {
    this.#assertAlive();
    const events: PhysicsImpactEvent[] = [];
    this.#eventQueue.drainContactForceEvents((contact) => {
      const first = this.#colliderDice.get(contact.collider1());
      const second = this.#colliderDice.get(contact.collider2());
      const dieId = first ?? second;
      if (dieId === undefined) return;
      const otherDieId = first === undefined || second === undefined ? undefined : second;
      events.push(
        Object.freeze({
          dieId,
          ...(otherDieId === undefined ? {} : { otherDieId }),
          force: contact.totalForceMagnitude(),
        }),
      );
    });
    return Object.freeze(events);
  }

  step(dtSeconds: number): void {
    this.#assertAlive();
    assertPositive(dtSeconds, 'dtSeconds');
    this.#world.timestep = dtSeconds;
    this.#world.step(this.#collisionEventsEnabled ? this.#eventQueue : undefined);
  }

  removeDie(id: string): void {
    this.#assertAlive();
    const die = this.#dice.get(id);
    if (die === undefined) return;
    const colliderHandle = this.#dieColliders.get(id);
    if (colliderHandle !== undefined) this.#colliderDice.delete(colliderHandle);
    this.#dieColliders.delete(id);
    this.#world.removeRigidBody(die.body);
    die.invalidate();
    this.#dice.delete(id);
  }

  clear(): void {
    this.#assertAlive();
    for (const die of this.#dice.values()) {
      this.#world.removeRigidBody(die.body);
      die.invalidate();
    }
    this.#dice.clear();
    this.#colliderDice.clear();
    this.#dieColliders.clear();
    this.#eventQueue.clear();
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.clear();
    this.#removeTray();
    this.#eventQueue.free();
    this.#world.free();
    this.#destroyed = true;
  }

  #removeTray(): void {
    if (this.#trayBody !== undefined) {
      this.#world.removeRigidBody(this.#trayBody);
      this.#trayBody = undefined;
    }
  }

  #assertAlive(): void {
    if (this.#destroyed) throw new Error('Physics world has been destroyed');
  }
}

export const RapierPhysics = Object.freeze({
  create(options: RapierPhysicsWorldOptions = {}): Promise<RapierPhysicsWorld> {
    return RapierPhysicsWorld.create(options);
  },
});
