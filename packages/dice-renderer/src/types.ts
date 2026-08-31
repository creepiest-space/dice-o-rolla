import type { QuaternionLike, Vector3Like } from '@dice-o-rolla/dice-core';

import type { VisualPresetDescriptor } from './visual-preset-registry.js';

export interface RenderTransform {
  readonly position: Vector3Like;
  readonly quaternion: QuaternionLike;
}

export interface RenderDieState {
  readonly id: string;
  readonly presetId: string;
  readonly geometryId: string;
  readonly scale: number;
  readonly faceLabels?: Readonly<Record<number, string | number>>;
  readonly previous: RenderTransform;
  readonly current: RenderTransform;
}

export interface RendererViewport {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

export interface RendererTheme {
  readonly material: 'plastic' | 'matte';
  readonly bodyColor: string;
  readonly labelColor: string;
  readonly roughness: number;
  readonly metalness: number;
}

export interface DiceRenderer {
  initialize(): Promise<void> | void;
  registerPreset(preset: VisualPresetDescriptor): void;
  unregisterPreset(id: string): void;
  createDie(state: RenderDieState): void;
  updateDie(state: RenderDieState): void;
  removeDie(id: string): void;
  render(alpha: number): void;
  resize(viewport: RendererViewport): void;
  setTheme(theme: RendererTheme): void;
  clear(): void;
  destroy(): void;
}
