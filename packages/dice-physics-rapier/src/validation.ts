import type { QuaternionLike, Vector3Like } from '@dice-o-rolla/dice-core';

export function assertPositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
}

export function assertNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number`);
  }
}

export function assertVector(value: Vector3Like, name: string): void {
  if (![value.x, value.y, value.z].every(Number.isFinite)) {
    throw new RangeError(`${name} must contain only finite components`);
  }
}

export function assertQuaternion(value: QuaternionLike, name: string): void {
  if (![value.x, value.y, value.z, value.w].every(Number.isFinite)) {
    throw new RangeError(`${name} must contain only finite components`);
  }
  if (Math.hypot(value.x, value.y, value.z, value.w) === 0) {
    throw new RangeError(`${name} must not be zero`);
  }
}
