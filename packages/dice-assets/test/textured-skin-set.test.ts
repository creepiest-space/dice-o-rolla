import { expect, test } from 'bun:test';

import { createStandardDiceNet, type StandardDiceNetType } from '@dice-o-rolla/dice-geometry';
import type { VisualPresetDescriptor } from '@dice-o-rolla/dice-renderer';

import {
  DiceAssetRegistry,
  prepareTexturedSkinSet,
  type TexturedSkinSetTarget,
} from '../src/index.js';

function assets(types: readonly string[] = ['d6', 'd10', 'd100', 'd66'], roughness = 0.7) {
  const registry = new DiceAssetRegistry();
  registry.materials.register({ id: 'mat', roughness, metalness: 0 });
  for (const type of types) {
    const geometry: StandardDiceNetType = type === 'd100' || type === 'd10' ? 'd10' : 'd6';
    registry.patterns.register({
      id: type,
      baseColor: {
        uri: `/${type}.ktx2`,
        mediaType: 'image/ktx2',
        colorSpace: 'srgb',
        mipmaps: true,
      },
      unwrap: createStandardDiceNet(geometry),
    });
    registry.skins.register({ id: type, patternId: type, materialId: 'mat' });
  }
  registry.skinSets.register({
    id: 'painted',
    skins: Object.fromEntries(types.map((type) => [type, type])),
  });
  const loaded: string[] = [];
  const provider = {
    registry,
    async prepareSkin(id: string) {
      loaded.push(id);
    },
  };
  return { registry, provider, loaded, skinSetId: 'painted' };
}
function target() {
  const presets = new Map<string, VisualPresetDescriptor>();
  let calls = 0;
  const engine: TexturedSkinSetTarget = {
    registerVisualPreset(preset) {
      calls++;
      if (presets.has(preset.id)) throw new Error('already registered');
      presets.set(preset.id, preset);
      return preset;
    },
    unregisterVisualPreset(id) {
      return presets.delete(id);
    },
  };
  return {
    engine,
    presets,
    get calls() {
      return calls;
    },
  };
}
const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => 'unexpected success',
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );

test('prepares a set, registers idempotently and selects paired components', async () => {
  const options = assets(),
    engine = target();
  const set = await prepareTexturedSkinSet(options);
  expect(options.loaded).toEqual(['d6', 'd10', 'd100', 'd66']);
  expect(engine.presets.size).toBe(0);
  set.register(engine.engine);
  set.register(engine.engine);
  (await prepareTexturedSkinSet(options)).register(engine.engine);
  expect(engine.calls).toBe(4);
  expect(Object.isFrozen(set.presets)).toBe(true);
  expect(
    set.visualPresetSelector({
      physicalDieType: 'd10',
      component: { groupType: 'd100', role: 'tens' },
    }),
  ).toBe('skin-set:painted:d100');
  expect(
    set.visualPresetSelector({
      physicalDieType: 'd10',
      component: { groupType: 'd100', role: 'units' },
    }),
  ).toBe('skin-set:painted:d10');
  expect(
    set.visualPresetSelector({
      physicalDieType: 'd6',
      component: { groupType: 'd66', role: 'tens' },
    }),
  ).toBe('skin-set:painted:d66');
  expect(set.visualPresetSelector({ physicalDieType: 'd20' })).toBeUndefined();
});

test('a partial set leaves absent dice and tens variants to the caller default', async () => {
  const set = await prepareTexturedSkinSet(assets(['d6']));
  expect(set.visualPresetSelector({ physicalDieType: 'd6' })).toBe('skin-set:painted:d6');
  expect(
    set.visualPresetSelector({
      physicalDieType: 'd6',
      component: { groupType: 'd66', role: 'tens' },
    }),
  ).toBeUndefined();
});

test('conflicting content does not replace registered presets', async () => {
  const engine = target();
  (await prepareTexturedSkinSet(assets(['d6']))).register(engine.engine);
  const conflicting = await prepareTexturedSkinSet(assets(['d6'], 0.2));
  expect(() => conflicting.register(engine.engine)).toThrow('Conflicting preset');
  expect(engine.calls).toBe(1);
});

test('registration failure rolls back only presets registered by that call', async () => {
  const engine = target(),
    set = await prepareTexturedSkinSet(assets());
  engine.presets.set('skin-set:painted:d10', {
    id: 'skin-set:painted:d10',
    geometryId: 'd10',
    dieType: 'd10',
  });
  expect(() => set.register(engine.engine)).toThrow('already registered');
  expect([...engine.presets.keys()]).toEqual(['skin-set:painted:d10']);
  engine.presets.clear();
  set.register(engine.engine);
  expect(engine.presets.size).toBe(4);
});

test('rejects mismatched registries and geometry before any texture loads', async () => {
  const options = assets(['d6']);
  expect(
    await rejection(prepareTexturedSkinSet({ ...options, registry: new DiceAssetRegistry() })),
  ).toContain('supplied asset registry');
  options.registry.patterns.register(
    {
      id: 'd6',
      baseColor: { uri: '/bad.ktx2', mediaType: 'image/ktx2', colorSpace: 'srgb', mipmaps: true },
      unwrap: createStandardDiceNet('d4'),
    },
    { replace: true },
  );
  expect(await rejection(prepareTexturedSkinSet(options))).toContain('unwrap for d6');
  expect(options.loaded).toEqual([]);
});

test('propagates preload errors without registering a set', async () => {
  const options = assets(['d6']);
  options.provider.prepareSkin = async () => {
    throw new Error('offline');
  };
  expect(await rejection(prepareTexturedSkinSet(options))).toBe('offline');
});
