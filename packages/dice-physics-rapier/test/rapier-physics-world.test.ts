import { describe, expect, test } from 'bun:test';

import { D6_DEFINITION, resolveFace } from '@dice-o-rolla/dice-geometry';
import type { CreatePhysicsDieOptions, PhysicsCollisionEvent } from '@dice-o-rolla/dice-physics';

import { RapierPhysics } from '../src/index.js';

const dieMaterial = {
  friction: 0.7,
  restitution: 0.15,
  linearDamping: 0.25,
  angularDamping: 0.25,
};

function createD6Options(id: string, y = 4): CreatePhysicsDieOptions {
  return {
    id,
    type: 'd6',
    collider: {
      kind: 'convex-hull',
      vertices: D6_DEFINITION.vertices.map(([x, vertexY, z]) => ({ x, y: vertexY, z })),
    },
    scale: 1,
    mass: 1,
    material: dieMaterial,
    position: { x: 0, y, z: 0 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
  };
}

function configureTray(world: Awaited<ReturnType<typeof RapierPhysics.create>>): void {
  world.configureTray({
    width: 10,
    depth: 10,
    wallHeight: 2,
    wallThickness: 0.25,
    material: { friction: 0.8, restitution: 0.1 },
  });
}

describe('RapierPhysicsWorld', () => {
  test('initializes WASM safely for concurrent world creation', async () => {
    const worlds = await Promise.all([RapierPhysics.create(), RapierPhysics.create()]);
    for (const world of worlds) world.destroy();
  });

  test('creates a d6 and exposes copied state', async () => {
    const world = await RapierPhysics.create({ gravity: { x: 0, y: 0, z: 0 } });
    const die = world.createDie(createD6Options('first', 2));

    const before = die.getState();
    expect(before.position).toEqual({ x: 0, y: 2, z: 0 });
    expect(before.quaternion).toEqual({ x: 0, y: 0, z: 0, w: 1 });

    die.applyImpulse({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    world.step(1 / 60);
    const after = die.getState();
    expect(after.linearVelocity.x).toBeGreaterThan(0);
    expect(after.angularVelocity.y).toBeGreaterThan(0);

    world.destroy();
  });

  test('settles a headless d6 inside the tray and resolves its face', async () => {
    const world = await RapierPhysics.create();
    configureTray(world);
    const die = world.createDie(createD6Options('rolling'));
    die.applyImpulse({ x: 1.25, y: 0.5, z: -0.8 }, { x: 2.5, y: -1.5, z: 2 });

    for (let step = 0; step < 1_200 && !die.getState().sleeping; step += 1) {
      world.step(1 / 60);
    }

    const state = die.getState();
    expect(state.sleeping).toBeTrue();
    expect(state.position.y).toBeWithin(0.5, 0.7);
    expect(state.position.x).toBeWithin(-5, 5);
    expect(state.position.z).toBeWithin(-5, 5);
    expect([1, 2, 3, 4, 5, 6]).toContain(resolveFace(D6_DEFINITION, state.quaternion));

    world.destroy();
  });

  test('collects collision events only when explicitly enabled', async () => {
    const disabled = await RapierPhysics.create();
    configureTray(disabled);
    disabled.createDie(createD6Options('silent', 1.5));
    for (let step = 0; step < 120; step += 1) disabled.step(1 / 60);
    expect(disabled.drainCollisionEvents()).toEqual([]);
    disabled.destroy();

    const enabled = await RapierPhysics.create();
    configureTray(enabled);
    enabled.setCollisionEventsEnabled(true);
    enabled.createDie(createD6Options('audible', 1.5));
    const collisions: PhysicsCollisionEvent[] = [];
    for (let step = 0; step < 120 && collisions.length === 0; step += 1) {
      enabled.step(1 / 60);
      collisions.push(...enabled.drainCollisionEvents());
    }
    expect(collisions).toContainEqual({ dieId: 'audible', started: true });
    enabled.destroy();
  });

  test('replaces a tray and invalidates removed handles', async () => {
    const world = await RapierPhysics.create();
    configureTray(world);
    configureTray(world);
    const die = world.createDie(createD6Options('removed'));

    expect(() => world.createDie(createD6Options('removed'))).toThrow('already exists');
    world.removeDie('removed');
    expect(() => die.getState()).toThrow('has been removed');
    expect(() => world.step(0)).toThrow(RangeError);

    world.destroy();
    world.destroy();
    expect(() => world.step(1 / 60)).toThrow('has been destroyed');
  });
});
