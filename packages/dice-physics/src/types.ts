import type { DieType, QuaternionLike, Vector3Like } from '@creepiest-space/dice-core';

export interface PhysicsTransform {
  readonly position: Vector3Like;
  readonly quaternion: QuaternionLike;
}

export interface PhysicsDieState extends PhysicsTransform {
  readonly linearVelocity: Vector3Like;
  readonly angularVelocity: Vector3Like;
  readonly sleeping: boolean;
}

export interface ConvexHullColliderDefinition {
  readonly kind: 'convex-hull';
  readonly vertices: readonly Vector3Like[];
}

export interface DicePhysicsMaterial {
  readonly friction: number;
  readonly restitution: number;
  readonly linearDamping: number;
  readonly angularDamping: number;
}

export interface TrayPhysicsMaterial {
  readonly friction: number;
  readonly restitution: number;
}

export interface PhysicsProfile {
  readonly dice: DicePhysicsMaterial;
  readonly tray: TrayPhysicsMaterial;
}

export interface CreatePhysicsDieOptions extends PhysicsTransform {
  readonly id: string;
  readonly type: DieType;
  readonly collider: ConvexHullColliderDefinition;
  readonly scale: number;
  readonly mass: number;
  readonly material: DicePhysicsMaterial;
}

export interface TrayOptions {
  readonly width: number;
  readonly depth: number;
  readonly wallHeight: number;
  readonly wallThickness: number;
  readonly material: TrayPhysicsMaterial;
}

export interface PhysicsDieHandle {
  readonly id: string;

  getState(): PhysicsDieState;
  applyImpulse(impulse: Vector3Like, torqueImpulse?: Vector3Like): void;
  wakeUp(): void;
}

export interface PhysicsWorld {
  createDie(options: CreatePhysicsDieOptions): PhysicsDieHandle;
  configureTray(options: TrayOptions): void;
  setGravity(gravity: Vector3Like): void;
  step(dtSeconds: number): void;
  removeDie(id: string): void;
  clear(): void;
  destroy(): void;
}
