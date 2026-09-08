export {
  AssetRegistry,
  DiceAssetRegistry,
  type RegisterDiceAssetOptions,
} from './asset-registry.js';
export {
  resolveImpactGain,
  WebAudioSpritePlayer,
  type AudioBufferSourceNodeLike,
  type AudioContextLike,
  type AudioParamLike,
  type GainNodeLike,
  type PlayImpactOptions,
  type WebAudioSpritePlayerOptions,
} from './web-audio-player.js';
export {
  ThreeAssetMaterialProvider,
  type ThreeAssetMaterialProviderOptions,
} from './three-material-provider.js';
export {
  DiceAssetCatalogLoader,
  parseCatalog,
  resolveCatalogReferences,
  type DiceAssetCatalogLoaderOptions,
} from './catalog-loader.js';
export {
  ImpactSoundGate,
  type SoundCollisionEvent,
  type SoundImpactEvent,
} from './impact-sound-gate.js';
export type {
  AudioBankDefinition,
  AudioBankKind,
  AudioSpriteClip,
  AudioSpriteManifest,
  DiceAssetCatalogManifest,
  DiceAssetMetadataValue,
  DiceAssetReference,
  DiceFaceAtlasDefinition,
  DiceFaceRegion,
  DiceMaterialDefinition,
  DicePatternDefinition,
  DiceSkinCompositeMode,
  DiceSkinDefinition,
  DiceSkinSetDefinition,
  DiceSurfaceUnwrap,
  RuntimeTextureReference,
} from './types.js';

export {
  prepareTexturedSkinSet,
  type PreparedTexturedSkinSet,
  type PrepareTexturedSkinSetOptions,
  type TexturedSkinSetTarget,
  type TexturedSkinSetProvider,
  type TexturedSkinSetSelectionContext,
} from './textured-skin-set.js';
