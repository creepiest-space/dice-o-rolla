// Compile the public examples from docs/textured-unwraps.md.
import {
  DiceAssetCatalogLoader,
  DiceAssetRegistry,
  ThreeAssetMaterialProvider,
  prepareTexturedSkinSet,
} from '@dice-o-rolla/dice-assets';
import { createDefaultDiceEngine } from '@dice-o-rolla/dice-engine/browser';

export async function createPaintedDice(container: HTMLElement) {
  const registry = new DiceAssetRegistry();
  await new DiceAssetCatalogLoader(registry).load('/dice/painted/catalog.json');

  let provider: ThreeAssetMaterialProvider | undefined;
  const engine = await createDefaultDiceEngine({
    container,
    renderer: {
      materialProvider(renderer) {
        provider = new ThreeAssetMaterialProvider(registry, {
          renderer,
          transcoderPath: '/basis/',
        });
        return provider;
      },
    },
  });

  try {
    if (provider === undefined) throw new Error('Material provider was not created');
    const skinSet = await prepareTexturedSkinSet({
      registry,
      provider,
      skinSetId: 'painted',
    });
    skinSet.register(engine);
    return { engine, skinSet };
  } catch (error) {
    engine.destroy();
    throw error;
  }
}

export async function exercisePaintedDice(container: HTMLElement) {
  const { engine, skinSet } = await createPaintedDice(container);
  const options = { visualPresetSelector: skinSet.visualPresetSelector };
  await engine.roll('d6', options);
  await engine.roll('d4+d6+d8+d10+d12+d20+d%', options);
  const trace = await engine.simulate('d66', { seed: 2026, captureFrames: true, ...options });
  await engine.replay(trace);
  // When the application removes this view:
  engine.destroy();
}

import {
  createTextureTemplate,
  writeTextureTemplates,
  buildTexturedSkinSet,
} from '@dice-o-rolla/dice-assets/tools';
import { createStandardDiceNet } from '@dice-o-rolla/dice-geometry';

const uv = createStandardDiceNet('d6');
const template = createTextureTemplate('d6', { size: 2048 });
// uv and template.unwrap use the same layout; template.svg contains editable groups.
await writeTextureTemplates({ outputDirectory: './art/custom', types: ['d6'], id: 'custom' });
const result = await buildTexturedSkinSet({
  input: './art/custom/skin-set.source.json',
  outputDirectory: './public/dice/custom',
});
console.log(uv.geometryId, template.type, result.outputDirectory);
