import { describe, expect, test } from 'bun:test';

import { ImpactSoundGate } from '../src/index.js';

describe('ImpactSoundGate', () => {
  test('emits one audible impact for a persistent surface contact', () => {
    const gate = new ImpactSoundGate();
    gate.observeCollision({ dieId: 'die-1', started: true });

    expect(gate.consumeImpact({ dieId: 'die-1' })).toBeTrue();
    expect(gate.consumeImpact({ dieId: 'die-1' })).toBeFalse();
    expect(gate.consumeImpact({ dieId: 'die-1' })).toBeFalse();
  });

  test('re-arms after separation and normalizes die-to-die contacts', () => {
    const gate = new ImpactSoundGate();
    gate.observeCollision({ dieId: 'die-2', otherDieId: 'die-1', started: true });
    expect(gate.consumeImpact({ dieId: 'die-1', otherDieId: 'die-2' })).toBeTrue();

    gate.observeCollision({ dieId: 'die-1', otherDieId: 'die-2', started: false });
    gate.observeCollision({ dieId: 'die-1', otherDieId: 'die-2', started: true });
    expect(gate.consumeImpact({ dieId: 'die-2', otherDieId: 'die-1' })).toBeTrue();
  });

  test('ignores force updates without a collision start and can reset', () => {
    const gate = new ImpactSoundGate();
    expect(gate.consumeImpact({ dieId: 'die-1' })).toBeFalse();
    gate.observeCollision({ dieId: 'die-1', started: true });
    gate.clear();
    expect(gate.consumeImpact({ dieId: 'die-1' })).toBeFalse();
  });
});
