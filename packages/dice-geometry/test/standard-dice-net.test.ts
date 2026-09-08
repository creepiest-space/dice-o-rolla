import { expect, test } from 'bun:test';

import { createStandardDiceNet, getDieGeometry } from '../src/index.js';

for (const type of ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'] as const) {
  test(`${type} produces a complete deterministic net`, () => {
    const net = createStandardDiceNet(type);
    expect(net).toEqual(createStandardDiceNet(type));
    expect(net.geometryId).toBe(type);
    const geometry = getDieGeometry(type);
    expect(Object.keys(net.faces)).toHaveLength(geometry.faces.length);
    for (const face of geometry.faces) {
      const uv = net.faces[face.value]!;
      expect(uv).toHaveLength(face.indices.length);
      expect(uv.flat().every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(
        true,
      );
    }
  });
}
