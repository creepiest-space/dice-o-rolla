import { afterEach, expect, mock, spyOn, test } from 'bun:test';

import { D4_DEFINITION, D6_DEFINITION } from '@dice-o-rolla/dice-geometry';
import { DEFAULT_THREE_THEME } from '@dice-o-rolla/dice-renderer-three';
import {
  ClampToEdgeWrapping,
  CompressedTexture,
  RepeatWrapping,
  type WebGLRenderer,
  type MeshPhysicalMaterial,
} from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

import {
  DiceAssetRegistry,
  ThreeAssetMaterialProvider,
  type RuntimeTextureReference,
} from '../src/index.js';

const reference = (uri: string): RuntimeTextureReference => ({
  uri,
  mediaType: 'image/ktx2',
  mipmaps: true,
  colorSpace: 'srgb',
});
const faces = Object.fromEntries(
  D6_DEFINITION.faces.map((face) => [
    face.value,
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ] as const,
  ]),
);
function setup() {
  spyOn(KTX2Loader.prototype, 'detectSupport').mockImplementation(function (this: KTX2Loader) {
    return this;
  });
  const registry = new DiceAssetRegistry();
  registry.registerCatalog({
    schemaVersion: 1,
    materials: [{ id: 'mat', roughness: 0.5, metalness: 0.2 }],
    patterns: [
      {
        id: 'net',
        baseColor: reference('base'),
        normal: reference('normal'),
        orm: reference('orm'),
        unwrap: { geometryId: 'd6', faces },
      },
      { id: 'repeat', baseColor: reference('base') },
    ],
    skins: [
      { id: 'net', materialId: 'mat', patternId: 'net' },
      { id: 'repeat', materialId: 'mat', patternId: 'repeat' },
    ],
  });
  // Capability detection is mocked; these tests allocate no GPU or DOM resources.
  const provider = new ThreeAssetMaterialProvider(registry, {
    renderer: Object.create(null) as WebGLRenderer,
    transcoderPath: '/',
  });
  return { provider, registry };
}
const preset = { id: 'net', dieType: 'd6', geometryId: 'd6', skinId: 'net' };
afterEach(() => mock.restore());

test('surface PBR maps share channel 1 and do not mutate a repeating use of the same URI', async () => {
  const { provider } = setup();
  spyOn(KTX2Loader.prototype, 'loadAsync').mockImplementation(
    async () => new CompressedTexture([], 4, 4),
  );
  await Promise.all([provider.prepareSkin('net'), provider.prepareSkin('repeat')]);
  const resource = provider.createFace({
    faceValue: 1,
    label: 1,
    theme: DEFAULT_THREE_THEME,
    preset,
  });
  const material = resource.material as MeshPhysicalMaterial;
  for (const texture of [
    material.map,
    material.normalMap,
    material.aoMap,
    material.roughnessMap,
    material.metalnessMap,
  ]) {
    expect(texture?.channel).toBe(1);
    expect(texture?.wrapS).toBe(ClampToEdgeWrapping);
    expect(texture?.wrapT).toBe(ClampToEdgeWrapping);
  }
  const repeated = provider.createFace({
    faceValue: 1,
    label: 1,
    theme: DEFAULT_THREE_THEME,
    preset: { ...preset, skinId: 'repeat' },
  });
  expect(repeated.material.map?.channel).toBe(0);
  expect(repeated.material.map?.wrapS).toBe(RepeatWrapping);
  expect(repeated.material.map).not.toBe(material.map);
  expect(provider.getSurfaceUvs(D6_DEFINITION, preset)).toEqual(faces);
  expect(() => provider.getSurfaceUvs(D4_DEFINITION, preset)).toThrow('requires geometry');
  resource.dispose();
  repeated.dispose();
  provider.dispose();
});

test('reports incomplete geometry with the skin and face before material creation', () => {
  const { provider, registry } = setup();
  registry.patterns.register(
    {
      id: 'net',
      baseColor: reference('base'),
      unwrap: { geometryId: 'd6', faces: { 1: faces[1]! } },
    },
    { replace: true },
  );
  expect(() => provider.getSurfaceUvs(D6_DEFINITION, preset)).toThrow(
    'Skin "net": Geometry "d6" face 2',
  );
  provider.dispose();
});

test('failed texture loads can be retried', async () => {
  const { provider } = setup();
  const loader = spyOn(KTX2Loader.prototype, 'loadAsync')
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(new CompressedTexture([], 4, 4));
  expect(await rejection(provider.prepareSkin('repeat'))).toContain('offline');
  await provider.prepareSkin('repeat');
  expect(loader).toHaveBeenCalledTimes(2);
  provider.dispose();
});

test('disposing during a load releases the texture and prevents late skin registration', async () => {
  const { provider } = setup();
  const pending = Promise.withResolvers<CompressedTexture>();
  spyOn(KTX2Loader.prototype, 'loadAsync').mockReturnValue(pending.promise);
  const texture = new CompressedTexture([], 4, 4);
  const dispose = spyOn(texture, 'dispose');
  const preparing = provider.prepareSkin('repeat');
  provider.dispose();
  pending.resolve(texture);
  expect(await rejection(preparing)).toContain('disposed');
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(await rejection(provider.prepareSkin('repeat'))).toContain('disposed');
});

async function rejection(promise: Promise<unknown>): Promise<string> {
  return promise.then(
    () => 'resolved unexpectedly',
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );
}
