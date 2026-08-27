import type { Vector3Like } from '@creepiest-space/dice-core';
import type { PhysicsDieHandle, PhysicsDieState } from '@creepiest-space/dice-physics';
import type { RigidBody } from '@dimforge/rapier3d-compat';

export class RapierDieBody implements PhysicsDieHandle {
  readonly id: string;
  readonly body: RigidBody;
  #active = true;

  constructor(id: string, body: RigidBody) {
    this.id = id;
    this.body = body;
  }

  getState(): PhysicsDieState {
    this.#assertActive();
    const position = this.body.translation();
    const quaternion = this.body.rotation();
    const linearVelocity = this.body.linvel();
    const angularVelocity = this.body.angvel();
    return {
      position: { x: position.x, y: position.y, z: position.z },
      quaternion: { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w },
      linearVelocity: { x: linearVelocity.x, y: linearVelocity.y, z: linearVelocity.z },
      angularVelocity: { x: angularVelocity.x, y: angularVelocity.y, z: angularVelocity.z },
      sleeping: this.body.isSleeping(),
    };
  }

  applyImpulse(impulse: Vector3Like, torqueImpulse?: Vector3Like): void {
    this.#assertActive();
    this.body.applyImpulse(impulse, true);
    if (torqueImpulse !== undefined) this.body.applyTorqueImpulse(torqueImpulse, true);
  }

  wakeUp(): void {
    this.#assertActive();
    this.body.wakeUp();
  }

  invalidate(): void {
    this.#active = false;
  }

  #assertActive(): void {
    if (!this.#active) throw new Error(`Physics die "${this.id}" has been removed`);
  }
}
