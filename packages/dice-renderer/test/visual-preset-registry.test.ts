import { describe, expect, test } from 'bun:test';

import { VisualPresetRegistry } from '../src/index.js';

describe('VisualPresetRegistry', () => {
  test('owns immutable descriptor snapshots', () => {
    const faceLabels: Record<number, string> = { 1: 'one' };
    const metadata: Record<string, string> = { collection: 'custom' };
    const registry = new VisualPresetRegistry();
    const preset = registry.register({
      id: 'custom.d6',
      dieType: 'd6',
      geometryId: 'd6',
      faceLabels,
      metadata,
    });
    faceLabels[1] = 'changed';
    metadata.collection = 'changed';

    expect(preset.scale).toBe(1);
    expect(preset.faceLabels?.[1]).toBe('one');
    expect(preset.metadata?.collection).toBe('custom');
    expect(Object.isFrozen(preset)).toBeTrue();
    expect(Object.isFrozen(preset.faceLabels)).toBeTrue();
    expect(registry.list()).toEqual([preset]);
  });

  test('rejects duplicates unless replacement is explicit', () => {
    const registry = new VisualPresetRegistry([
      { id: 'standard:d6', dieType: 'd6', geometryId: 'd6' },
    ]);
    expect(() => registry.register({ id: 'standard:d6', dieType: 'd6', geometryId: 'd6' })).toThrow(
      'already registered',
    );

    const replacement = registry.register(
      { id: 'standard:d6', dieType: 'd6', geometryId: 'd6', scale: 1.25 },
      { replace: true },
    );
    expect(registry.get('standard:d6')).toBe(replacement);
    expect(registry.revision).toBe(2);
  });

  test('unregisters idempotently and advances revision only on changes', () => {
    const registry = new VisualPresetRegistry([
      { id: 'custom:d6', dieType: 'd6', geometryId: 'd6' },
    ]);
    expect(registry.unregister('custom:d6')?.id).toBe('custom:d6');
    expect(registry.unregister('custom:d6')).toBeUndefined();
    expect(registry.revision).toBe(2);
  });

  test.each([
    [{ id: '', dieType: 'd6', geometryId: 'd6' }, 'id'],
    [{ id: 'custom', dieType: 'd 6', geometryId: 'd6' }, 'dieType'],
    [{ id: 'custom', dieType: 'd6', geometryId: 'd6', scale: 0 }, 'scale'],
    [{ id: 'custom', dieType: 'd6', geometryId: 'd6', valueMap: { 0: 1 } }, 'valueMap'],
    [{ id: 'custom', dieType: 'd6', geometryId: 'd6', metadata: { cost: Infinity } }, 'metadata'],
  ])('rejects invalid descriptors %#', (descriptor, message) => {
    const registry = new VisualPresetRegistry();
    expect(() => registry.register(descriptor)).toThrow(message);
  });
});
