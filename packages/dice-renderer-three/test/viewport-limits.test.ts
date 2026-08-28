import { describe, expect, test } from 'bun:test';

import {
  fitViewportToLimits,
  resolveViewportLimits,
  validateViewport,
} from '../src/viewport-limits.js';

describe('viewport limits', () => {
  test('rejects oversized explicit framebuffers', () => {
    const limits = resolveViewportLimits({});

    expect(() => validateViewport({ width: 8_193, height: 600, pixelRatio: 1 }, limits)).toThrow(
      RangeError,
    );
    expect(() => validateViewport({ width: 800, height: 600, pixelRatio: 3 }, limits)).toThrow(
      RangeError,
    );
    expect(() => validateViewport({ width: 8_192, height: 8_192, pixelRatio: 1 }, limits)).toThrow(
      RangeError,
    );
  });

  test('fits observed container sizes within framebuffer limits', () => {
    const limits = resolveViewportLimits({});
    const viewport = fitViewportToLimits({ width: 10_000, height: 10_000, pixelRatio: 4 }, limits);

    expect(viewport.width).toBe(8_192);
    expect(viewport.height).toBe(8_192);
    expect(viewport.pixelRatio).toBeCloseTo(Math.SQRT1_2);
    expect(() => validateViewport(viewport, limits)).not.toThrow();
  });

  test('validates custom limits', () => {
    expect(() => resolveViewportLimits({ maxPixelRatio: Number.POSITIVE_INFINITY })).toThrow(
      RangeError,
    );
  });
});
