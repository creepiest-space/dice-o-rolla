import { describe, expect, test } from 'bun:test';

import { ThreeCamera, ThreeScene } from '../src/index.js';

describe('Three scene components', () => {
  test('configures a Y-up scene, camera, floor, and lights', () => {
    const scene = new ThreeScene();
    const camera = new ThreeCamera();
    camera.resize(1600, 900);
    expect(camera.value.aspect).toBeCloseTo(16 / 9, 12);
    expect(scene.value.children).toHaveLength(3);

    scene.dispose();
    expect(scene.value.children).toHaveLength(0);
  });
});
