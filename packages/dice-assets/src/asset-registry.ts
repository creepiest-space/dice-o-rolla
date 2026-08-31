import type {
  AudioBankDefinition,
  AudioSpriteManifest,
  DiceAssetCatalogManifest,
  DiceFaceAtlasDefinition,
  DiceMaterialDefinition,
  DicePatternDefinition,
  DiceSkinDefinition,
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

function immutable<T extends { readonly id: string }>(source: T): T {
  assertId(source.id);
  return deepFreeze(structuredClone(source));
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export class AssetRegistry<T extends { readonly id: string }> {
  readonly #assets = new Map<string, T>();
  readonly #validate: (asset: T) => void;
  #revision = 0;

  constructor(validate: (asset: T) => void = () => undefined) {
    this.#validate = validate;
  }

  get revision(): number {
    return this.#revision;
  }

  register(source: T, options: RegisterDiceAssetOptions = {}): T {
    const asset = immutable(source);
    this.#validate(asset);
    if (this.#assets.has(asset.id) && options.replace !== true) {
      throw new Error(`Dice asset "${asset.id}" is already registered`);
    }
    this.#assets.set(asset.id, asset);
    this.#revision += 1;
    return asset;
  }

  unregister(id: string): T | undefined {
    const asset = this.#assets.get(id);
    if (asset === undefined) return undefined;
    this.#assets.delete(id);
    this.#revision += 1;
    return asset;
  }

  get(id: string): T | undefined {
    return this.#assets.get(id);
  }

  has(id: string): boolean {
    return this.#assets.has(id);
  }

  list(): readonly T[] {
    return Object.freeze(Array.from(this.#assets.values()));
  }
}

export class DiceAssetRegistry {
  readonly audio = new AssetRegistry<AudioSpriteManifest>(validateAudioSprite);
  readonly audioBanks = new AssetRegistry<AudioBankDefinition>(validateAudioBank);
  readonly materials = new AssetRegistry<DiceMaterialDefinition>(validateMaterial);
  readonly patterns = new AssetRegistry<DicePatternDefinition>(validatePattern);
  readonly skins = new AssetRegistry<DiceSkinDefinition>(validateSkin);
  readonly faces = new AssetRegistry<DiceFaceAtlasDefinition>(validateFaceAtlas);

  get revision(): number {
    return (
      this.audio.revision +
      this.audioBanks.revision +
      this.materials.revision +
      this.patterns.revision +
      this.skins.revision +
      this.faces.revision
    );
  }

  registerCatalog(catalog: DiceAssetCatalogManifest): void {
    if (catalog.schemaVersion !== 1) throw new RangeError('unsupported asset catalog schema');
    for (const asset of catalog.audioSprites ?? []) this.audio.register(asset);
    for (const asset of catalog.audioBanks ?? []) this.audioBanks.register(asset);
    for (const asset of catalog.materials ?? []) this.materials.register(asset);
    for (const asset of catalog.patterns ?? []) this.patterns.register(asset);
    for (const asset of catalog.faces ?? []) this.faces.register(asset);
    for (const asset of catalog.skins ?? []) this.skins.register(asset);
    this.validateReferences();
  }

  validateReferences(): void {
    for (const bank of this.audioBanks.list()) {
      const sprite = this.audio.get(bank.spriteId);
      if (sprite === undefined)
        throw new Error(`Audio bank "${bank.id}" references missing sprite`);
      for (const clipId of bank.clipIds) {
        if (sprite.clips[clipId] === undefined) {
          throw new Error(`Audio bank "${bank.id}" references missing clip "${clipId}"`);
        }
      }
      assertRange(bank.forceRange, 'forceRange');
      assertRange(bank.gainRange, 'gainRange');
    }
    for (const skin of this.skins.list()) {
      if (!this.materials.has(skin.materialId)) {
        throw new Error(`Skin "${skin.id}" references missing material`);
      }
      if (!this.patterns.has(skin.patternId)) {
        throw new Error(`Skin "${skin.id}" references missing pattern`);
      }
      if (skin.faceAtlasId !== undefined && !this.faces.has(skin.faceAtlasId)) {
        throw new Error(`Skin "${skin.id}" references missing face atlas`);
      }
    }
  }

  registerSkin(source: DiceSkinDefinition, options?: RegisterDiceAssetOptions): DiceSkinDefinition {
    return this.skins.register(source, options);
  }

  unregisterSkin(id: string): DiceSkinDefinition | undefined {
    return this.skins.unregister(id);
  }
  getSkin(id: string): DiceSkinDefinition | undefined {
    return this.skins.get(id);
  }
  listSkins(): readonly DiceSkinDefinition[] {
    return this.skins.list();
  }
}

function assertRange(range: readonly [number, number], name: string): void {
  if (!range.every(Number.isFinite) || range[0] < 0 || range[1] <= range[0]) {
    throw new RangeError(`${name} must be a finite ascending non-negative range`);
  }
}

function validateReference(reference: { readonly uri: string }, name: string): void {
  if (reference.uri.trim().length === 0) throw new RangeError(`${name} uri must not be empty`);
}

function validateTexture(
  texture: { readonly uri: string; readonly mediaType: string; readonly mipmaps: boolean },
  name: string,
): void {
  validateReference(texture, name);
  if (texture.mediaType !== 'image/ktx2' || !texture.mipmaps) {
    throw new RangeError(`${name} must be a mipmapped KTX2 texture`);
  }
}

function validateAudioSprite(sprite: AudioSpriteManifest): void {
  validateReference(sprite.audio, 'audio sprite');
  if (sprite.channels !== 1) throw new RangeError('runtime audio sprites must be mono');
  if (Object.keys(sprite.clips).length === 0)
    throw new RangeError('audio sprite must contain clips');
  for (const [id, clip] of Object.entries(sprite.clips)) {
    assertId(id);
    if (
      !Number.isFinite(clip.offsetSeconds) ||
      clip.offsetSeconds < 0 ||
      !Number.isFinite(clip.durationSeconds) ||
      clip.durationSeconds <= 0
    ) {
      throw new RangeError('audio sprite clip timing must be finite and non-negative');
    }
  }
}

function validateAudioBank(bank: AudioBankDefinition): void {
  assertId(bank.spriteId);
  if (bank.clipIds.length === 0) throw new RangeError('audio bank must contain clip ids');
  for (const id of bank.clipIds) assertId(id);
  assertRange(bank.forceRange, 'forceRange');
  assertRange(bank.gainRange, 'gainRange');
  if ((bank.pitchVariationCents ?? 0) < 0 || (bank.gainVariation ?? 0) < 0) {
    throw new RangeError('audio variation must not be negative');
  }
}

function validateMaterial(material: DiceMaterialDefinition): void {
  for (const [name, value] of [
    ['roughness', material.roughness],
    ['metalness', material.metalness],
  ] as const) {
    if (!Number.isFinite(value) || value < 0 || value > 1)
      throw new RangeError(`${name} must be within [0, 1]`);
  }
}

function validatePattern(pattern: DicePatternDefinition): void {
  validateTexture(pattern.baseColor, 'baseColor');
  if (pattern.normal !== undefined) validateTexture(pattern.normal, 'normal');
  if (pattern.orm !== undefined) validateTexture(pattern.orm, 'orm');
}

function validateSkin(skin: DiceSkinDefinition): void {
  assertId(skin.materialId);
  assertId(skin.patternId);
  if (skin.faceAtlasId !== undefined) assertId(skin.faceAtlasId);
  if (skin.saturation !== undefined && (!Number.isFinite(skin.saturation) || skin.saturation < 0)) {
    throw new RangeError('skin saturation must be a non-negative finite number');
  }
}

function validateFaceAtlas(atlas: DiceFaceAtlasDefinition): void {
  validateTexture(atlas.texture, 'face atlas');
  if (
    !Number.isSafeInteger(atlas.width) ||
    atlas.width <= 0 ||
    !Number.isSafeInteger(atlas.height) ||
    atlas.height <= 0
  ) {
    throw new RangeError('face atlas dimensions must be positive integers');
  }
}
