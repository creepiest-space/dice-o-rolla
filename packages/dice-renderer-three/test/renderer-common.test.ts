import { describe, expect, test } from 'bun:test';

import type {
  RenderDieState,
  RendererTheme,
  VisualPresetDescriptor,
} from '@dice-o-rolla/dice-renderer';
import { MeshStandardMaterial } from 'three';

import { ThreeDiceMeshFactory } from '../src/mesh-factory.js';
import {
  copyRenderState,
  createDiceMeshResource,
  haveEqualFaceLabels,
} from '../src/renderer-common.js';

const state: RenderDieState = {
  id: 'die-1',
  presetId: 'custom:d6',
  geometryId: 'd6',
  scale: 1,
  faceLabels: { 1: 'one' },
  previous: {
    position: { x: 0, y: 1, z: 2 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
  },
  current: {
    position: { x: 3, y: 4, z: 5 },
    quaternion: { x: 0, y: 1, z: 0, w: 0 },
  },
};

const preset: VisualPresetDescriptor = {
  id: 'custom:d6',
  dieType: 'd6',
  geometryId: 'd6',
  scale: 1,
  skinId: 'amethyst',
};

const theme: RendererTheme = {
  material: 'plastic',
  bodyColor: '#ffffff',
  labelColor: '#000000',
  roughness: 0.3,
  metalness: 0,
};

describe('shared Three renderer behavior', () => {
  test('copies render state and compares face labels consistently', () => {
    const copy = copyRenderState(state);
    expect(copy).toEqual(state);
    expect(copy).not.toBe(state);
    expect(copy.current).not.toBe(state.current);
    expect(copy.faceLabels).not.toBe(state.faceLabels);
    expect(haveEqualFaceLabels(copy.faceLabels, { 1: 'one' })).toBeTrue();
    expect(haveEqualFaceLabels(copy.faceLabels, { 1: 'uno' })).toBeFalse();
  });

  test('validates the selected preset and passes it to every material request', () => {
    const contexts: unknown[] = [];
    const meshFactory = new ThreeDiceMeshFactory({
      createFace(context) {
        contexts.push(context);
        const material = new MeshStandardMaterial();
        return { material, dispose: () => material.dispose() };
      },
    });
    const presets = new Map([[preset.id, preset]]);
    const resource = createDiceMeshResource(state, presets, meshFactory, theme);

    expect(contexts).toHaveLength(6);
    expect(contexts[0]).toEqual(expect.objectContaining({ preset }));
    expect(() => createDiceMeshResource(state, new Map(), meshFactory, theme)).toThrow(
      'Unknown visual preset',
    );
    expect(() =>
      createDiceMeshResource({ ...state, scale: 2 }, presets, meshFactory, theme),
    ).toThrow('does not match visual preset');
    resource.dispose();
  });
});
