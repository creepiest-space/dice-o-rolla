import type {
  DiceAssetMetadataValue,
  DiceAssetReference,
  DiceSkinDefinition,
  DiceSkinTextures,
  DiceSoundCue,
  DiceSoundPackDefinition,
  DiceSoundSample,
} from './types.js';

export interface RegisterDiceAssetOptions {
  readonly replace?: boolean;
}

const ASSET_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/i;

function assertId(value: string): void {
  if (!ASSET_ID_PATTERN.test(value)) {
    throw new RangeError('asset id must be a non-empty portable identifier');
  }
}

function copyReference(reference: DiceAssetReference): DiceAssetReference {
  if (reference.uri.trim().length === 0) throw new RangeError('asset uri must not be empty');
  return Object.freeze({ ...reference });
}

function copySample(sample: DiceSoundSample): DiceSoundSample {
  const reference = copyReference(sample);
  const volume = sample.volume ?? 1;
  const weight = sample.weight ?? 1;
  if (!Number.isFinite(volume) || volume < 0) {
    throw new RangeError('sound sample volume must be a non-negative finite number');
  }
  if (!Number.isFinite(weight) || weight <= 0) {
    throw new RangeError('sound sample weight must be a positive finite number');
  }
  return Object.freeze({ ...reference, volume, weight });
}

function copyCue(cue: DiceSoundCue | undefined): DiceSoundCue | undefined {
  if (cue === undefined) return undefined;
  if (cue.samples.length === 0) throw new RangeError('sound cue must contain at least one sample');
  const maxVoices = cue.maxVoices ?? 4;
  if (!Number.isSafeInteger(maxVoices) || maxVoices <= 0) {
    throw new RangeError('sound cue maxVoices must be a positive safe integer');
  }
  return Object.freeze({
    samples: Object.freeze(cue.samples.map(copySample)),
    maxVoices,
  });
}

function copyMetadata(
  metadata: Readonly<Record<string, DiceAssetMetadataValue>> | undefined,
): Readonly<Record<string, DiceAssetMetadataValue>> | undefined {
  if (metadata === undefined) return undefined;
  const copy: Record<string, DiceAssetMetadataValue> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (key.length === 0) throw new RangeError('asset metadata keys must not be empty');
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new RangeError('asset metadata numeric values must be finite');
    }
    copy[key] = value;
  }
  return Object.freeze(copy);
}

function copyTextures(textures: DiceSkinTextures | undefined): DiceSkinTextures | undefined {
  if (textures === undefined) return undefined;
  return Object.freeze({
    ...(textures.body === undefined ? {} : { body: copyReference(textures.body) }),
    ...(textures.labels === undefined ? {} : { labels: copyReference(textures.labels) }),
    ...(textures.normal === undefined ? {} : { normal: copyReference(textures.normal) }),
    ...(textures.emissive === undefined ? {} : { emissive: copyReference(textures.emissive) }),
  });
}

export function createDiceSkinDefinition(source: DiceSkinDefinition): DiceSkinDefinition {
  assertId(source.id);
  for (const [name, value] of [
    ['roughness', source.roughness],
    ['metalness', source.metalness],
  ] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1)) {
      throw new RangeError(`${name} must be within [0, 1]`);
    }
  }
  const textures = copyTextures(source.textures);
  const metadata = copyMetadata(source.metadata);
  return Object.freeze({
    id: source.id,
    ...(source.name === undefined ? {} : { name: source.name }),
    material: source.material,
    ...(source.bodyColor === undefined ? {} : { bodyColor: source.bodyColor }),
    ...(source.labelColor === undefined ? {} : { labelColor: source.labelColor }),
    ...(source.roughness === undefined ? {} : { roughness: source.roughness }),
    ...(source.metalness === undefined ? {} : { metalness: source.metalness }),
    ...(textures === undefined ? {} : { textures }),
    ...(metadata === undefined ? {} : { metadata }),
  });
}

export function createDiceSoundPackDefinition(
  source: DiceSoundPackDefinition,
): DiceSoundPackDefinition {
  assertId(source.id);
  const dieCollision = copyCue(source.dieCollision);
  const trayCollision = copyCue(source.trayCollision);
  const settle = copyCue(source.settle);
  const metadata = copyMetadata(source.metadata);
  return Object.freeze({
    id: source.id,
    ...(source.name === undefined ? {} : { name: source.name }),
    ...(dieCollision === undefined ? {} : { dieCollision }),
    ...(trayCollision === undefined ? {} : { trayCollision }),
    ...(settle === undefined ? {} : { settle }),
    ...(metadata === undefined ? {} : { metadata }),
  });
}

export class DiceAssetRegistry {
  readonly #skins = new Map<string, DiceSkinDefinition>();
  readonly #soundPacks = new Map<string, DiceSoundPackDefinition>();
  #revision = 0;

  get revision(): number {
    return this.#revision;
  }

  registerSkin(
    source: DiceSkinDefinition,
    options: RegisterDiceAssetOptions = {},
  ): DiceSkinDefinition {
    const skin = createDiceSkinDefinition(source);
    this.#set(this.#skins, skin, options);
    return skin;
  }

  unregisterSkin(id: string): DiceSkinDefinition | undefined {
    return this.#delete(this.#skins, id);
  }

  getSkin(id: string): DiceSkinDefinition | undefined {
    return this.#skins.get(id);
  }

  listSkins(): readonly DiceSkinDefinition[] {
    return Object.freeze(Array.from(this.#skins.values()));
  }

  registerSoundPack(
    source: DiceSoundPackDefinition,
    options: RegisterDiceAssetOptions = {},
  ): DiceSoundPackDefinition {
    const pack = createDiceSoundPackDefinition(source);
    this.#set(this.#soundPacks, pack, options);
    return pack;
  }

  unregisterSoundPack(id: string): DiceSoundPackDefinition | undefined {
    return this.#delete(this.#soundPacks, id);
  }

  getSoundPack(id: string): DiceSoundPackDefinition | undefined {
    return this.#soundPacks.get(id);
  }

  listSoundPacks(): readonly DiceSoundPackDefinition[] {
    return Object.freeze(Array.from(this.#soundPacks.values()));
  }

  #set<T extends { readonly id: string }>(
    registry: Map<string, T>,
    asset: T,
    options: RegisterDiceAssetOptions,
  ): void {
    if (registry.has(asset.id) && options.replace !== true) {
      throw new Error(`Dice asset "${asset.id}" is already registered`);
    }
    registry.set(asset.id, asset);
    this.#revision += 1;
  }

  #delete<T>(registry: Map<string, T>, id: string): T | undefined {
    const asset = registry.get(id);
    if (asset === undefined) return undefined;
    registry.delete(id);
    this.#revision += 1;
    return asset;
  }
}
