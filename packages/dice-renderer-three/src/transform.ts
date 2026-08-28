import type { RenderDieState } from '@dice-o-rolla/dice-renderer';
import type { Object3D } from 'three';

export function applyInterpolatedTransform(
  object: Object3D,
  state: RenderDieState,
  alpha: number,
): void {
  if (!Number.isFinite(alpha)) throw new RangeError('alpha must be finite');
  const t = Math.max(0, Math.min(1, alpha));
  const previous = state.previous;
  const current = state.current;

  object.position.set(
    previous.position.x + (current.position.x - previous.position.x) * t,
    previous.position.y + (current.position.y - previous.position.y) * t,
    previous.position.z + (current.position.z - previous.position.z) * t,
  );
  object.quaternion
    .set(previous.quaternion.x, previous.quaternion.y, previous.quaternion.z, previous.quaternion.w)
    .normalize()
    .slerp(
      object.quaternion
        .clone()
        .set(current.quaternion.x, current.quaternion.y, current.quaternion.z, current.quaternion.w)
        .normalize(),
      t,
    );
}
