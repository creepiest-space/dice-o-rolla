import type { QuaternionLike, Vector3Like } from '@creepiest-space/dice-core';

export interface RenderTransform {
  readonly position: Vector3Like;
  readonly quaternion: QuaternionLike;
}

export interface RenderDieState {
  readonly id: string;
  readonly geometryId: string;
  readonly previous: RenderTransform;
  readonly current: RenderTransform;
}

export interface RendererViewport {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

export interface DiceRenderer {
  initialize(): Promise<void> | void;
  createDie(state: RenderDieState): void;
  updateDie(state: RenderDieState): void;
  removeDie(id: string): void;
  render(alpha: number): void;
  resize(viewport: RendererViewport): void;
  clear(): void;
  destroy(): void;
}
