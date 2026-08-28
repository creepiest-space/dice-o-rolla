import { describe, expect, test } from 'bun:test';

import { requiresOrientationDot } from '../src/material-factory.js';

describe('requiresOrientationDot', () => {
  test.each([6, 9, 60, 90, '6', '9', '60', '90'])('marks ambiguous label %s', (label) => {
    expect(requiresOrientationDot(label)).toBeTrue();
  });

  test.each([0, 1, 8, 10, 80, '00', '10', [1, 2, 3] as const])(
    'leaves unambiguous label %s unchanged',
    (label) => {
      expect(requiresOrientationDot(label)).toBeFalse();
    },
  );
});
