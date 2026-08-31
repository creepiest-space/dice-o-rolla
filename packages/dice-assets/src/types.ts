export type DiceAssetMetadataValue = string | number | boolean;

export interface DiceAssetReference {
  readonly uri: string;
  readonly mediaType?: string;
  readonly integrity?: string;
}

export interface RuntimeTextureReference extends DiceAssetReference {
  readonly mediaType: 'image/ktx2';
  readonly colorSpace: 'srgb' | 'linear';
  readonly mipmaps: true;
}

export interface AudioSpriteClip {
  readonly offsetSeconds: number;
  readonly durationSeconds: number;
  readonly gain?: number;
  readonly weight?: number;
}

export interface AudioSpriteManifest {
  readonly id: string;
  readonly audio: DiceAssetReference & { readonly mediaType: 'audio/webm; codecs=opus' };
  readonly channels: 1;
  readonly clips: Readonly<Record<string, AudioSpriteClip>>;
}

export type AudioBankKind = 'die-material' | 'surface-material';

export interface AudioBankDefinition {
  readonly id: string;
  readonly kind: AudioBankKind;
  readonly spriteId: string;
  readonly clipIds: readonly string[];
  readonly forceRange: readonly [minimum: number, maximum: number];
  readonly gainRange: readonly [minimum: number, maximum: number];
  readonly pitchVariationCents?: number;
  readonly gainVariation?: number;
  readonly maxVoices?: number;
  readonly metadata?: Readonly<Record<string, DiceAssetMetadataValue>>;
}

export interface DiceMaterialDefinition {
  readonly id: string;
  readonly roughness: number;
  readonly metalness: number;
  readonly normalScale?: number;
  readonly clearcoat?: number;
  readonly clearcoatRoughness?: number;
  readonly metadata?: Readonly<Record<string, DiceAssetMetadataValue>>;
}

export interface DicePatternDefinition {
  readonly id: string;
  readonly baseColor: RuntimeTextureReference;
  readonly normal?: RuntimeTextureReference;
  /** Occlusion, roughness and metalness packed into R, G and B channels. */
  readonly orm?: RuntimeTextureReference;
  readonly repeat?: readonly [u: number, v: number];
  readonly metadata?: Readonly<Record<string, DiceAssetMetadataValue>>;
}

export interface DiceFaceRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DiceFaceAtlasDefinition {
  readonly id: string;
  readonly texture: RuntimeTextureReference;
  readonly width: number;
  readonly height: number;
  readonly faces: Readonly<Record<string, DiceFaceRegion>>;
  readonly metadata?: Readonly<Record<string, DiceAssetMetadataValue>>;
}

export type DiceSkinCompositeMode = 'normal' | 'multiply' | 'overlay';

export interface DiceSkinDefinition {
  readonly id: string;
  readonly name?: string;
  readonly materialId: string;
  readonly patternId: string;
  readonly faceAtlasId?: string;
  readonly tint?: string;
  readonly labelColor?: string;
  readonly hueRotation?: number;
  readonly saturation?: number;
  readonly patternScale?: readonly [u: number, v: number];
  readonly composite?: DiceSkinCompositeMode;
  readonly metadata?: Readonly<Record<string, DiceAssetMetadataValue>>;
}

export interface DiceAssetCatalogManifest {
  readonly schemaVersion: 1;
  readonly audioSprites?: readonly AudioSpriteManifest[];
  readonly audioBanks?: readonly AudioBankDefinition[];
  readonly materials?: readonly DiceMaterialDefinition[];
  readonly patterns?: readonly DicePatternDefinition[];
  readonly skins?: readonly DiceSkinDefinition[];
  readonly faces?: readonly DiceFaceAtlasDefinition[];
}
