import { getDieGeometry, getRegisteredDieTypes } from '@dice-o-rolla/dice-geometry';
import type {
  RenderDieState,
  RendererTheme,
  VisualPresetDescriptor,
} from '@dice-o-rolla/dice-renderer';

import type { ThreeDiceMesh, ThreeDiceMeshFactory } from './mesh-factory.js';

export interface ThreeRenderEntry {
  resource: ThreeDiceMesh;
  state: RenderDieState;
}

export function copyRenderState(state: RenderDieState): RenderDieState {
  return {
    id: state.id,
    presetId: state.presetId,
    geometryId: state.geometryId,
    scale: state.scale,
    ...(state.faceLabels === undefined ? {} : { faceLabels: { ...state.faceLabels } }),
    previous: {
      position: { ...state.previous.position },
      quaternion: { ...state.previous.quaternion },
    },
    current: {
      position: { ...state.current.position },
      quaternion: { ...state.current.quaternion },
    },
  };
}

export function haveEqualFaceLabels(
  left: RenderDieState['faceLabels'],
  right: RenderDieState['faceLabels'],
): boolean {
  if (left === right) return true;
  if (left === undefined || right === undefined) return false;
  const leftEntries = Object.entries(left);
  return (
    leftEntries.length === Object.keys(right).length &&
    leftEntries.every(([face, label]) => right[Number(face)] === label)
  );
}

export function createDiceMeshResource(
  state: RenderDieState,
  presets: ReadonlyMap<string, VisualPresetDescriptor>,
  meshFactory: ThreeDiceMeshFactory,
  theme: RendererTheme,
): ThreeDiceMesh {
  const preset = presets.get(state.presetId);
  if (preset === undefined) throw new Error(`Unknown visual preset: ${state.presetId}`);
  if (preset.geometryId !== state.geometryId || (preset.scale ?? 1) !== state.scale) {
    throw new Error(`Render state does not match visual preset "${state.presetId}"`);
  }
  const type = getRegisteredDieTypes().find((registered) => registered === state.geometryId);
  if (type === undefined) throw new Error(`Unsupported geometry: ${state.geometryId}`);
  return meshFactory.create(getDieGeometry(type), theme, state.scale, state.faceLabels, preset);
}
