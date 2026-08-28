import { describe, expect, test } from 'bun:test';

import { TopDownCamera } from '../src/top-down-camera.js';

describe('TopDownCamera', () => {
  test('frames a square tray in landscape and portrait viewports', () => {
    const camera = new TopDownCamera();

    camera.resize(1600, 800);
    const landscapeHeight = camera.value.position.y;
    expect(camera.value.aspect).toBe(2);

    camera.resize(800, 1600);
    expect(camera.value.aspect).toBe(0.5);
    expect(camera.value.position.y).toBeCloseTo(landscapeHeight * 2, 12);
    expect(camera.value.up.toArray()).toEqual([0, 0, -1]);
  });

  test('frames rectangular trays without cropping either dimension', () => {
    const wide = new TopDownCamera({ trayWidth: 20, trayDepth: 8, cameraPadding: 1 });
    const deep = new TopDownCamera({ trayWidth: 8, trayDepth: 20, cameraPadding: 1 });

    wide.resize(1000, 1000);
    deep.resize(1000, 1000);
    expect(wide.value.position.y).toBeCloseTo(deep.value.position.y, 12);
  });

  test('rejects invalid camera geometry and viewports', () => {
    expect(() => new TopDownCamera({ trayWidth: 0 })).toThrow(RangeError);
    expect(() => new TopDownCamera({ cameraFieldOfViewDegrees: 180 })).toThrow(RangeError);
    expect(() => new TopDownCamera({ cameraPadding: 0.9 })).toThrow(RangeError);
    expect(() => new TopDownCamera().resize(0, 100)).toThrow(RangeError);
  });
});
