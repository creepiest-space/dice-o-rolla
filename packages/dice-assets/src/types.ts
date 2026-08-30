export type DiceAssetMetadataValue = string | number | boolean;

export interface DiceAssetReference {
  readonly uri: string;
  readonly mediaType?: string;
  readonly integrity?: string;
}

export interface DiceSkinTextures {
  readonly body?: DiceAssetReference;
  readonly labels?: DiceAssetReference;
  readonly normal?: DiceAssetReference;
  readonly emissive?: DiceAssetReference;
}

export interface DiceSkinDefinition {
  readonly id: string;
  readonly name?: string;
  readonly material: 'plastic' | 'matte' | 'custom';
  readonly bodyColor?: string;
  readonly labelColor?: string;
  readonly roughness?: number;
  readonly metalness?: number;
  readonly textures?: DiceSkinTextures;
  readonly metadata?: Readonly<Record<string, DiceAssetMetadataValue>>;
}

export interface DiceSoundSample extends DiceAssetReference {
  readonly volume?: number;
  readonly weight?: number;
}

export interface DiceSoundCue {
  readonly samples: readonly DiceSoundSample[];
  readonly maxVoices?: number;
}

export interface DiceSoundPackDefinition {
  readonly id: string;
  readonly name?: string;
  readonly dieCollision?: DiceSoundCue;
  readonly trayCollision?: DiceSoundCue;
  readonly settle?: DiceSoundCue;
  readonly metadata?: Readonly<Record<string, DiceAssetMetadataValue>>;
}
