import type {
  DiceAssetCatalogManifest,
  DiceMaterialDefinition,
  DiceSurfaceUnwrap,
} from '@dice-o-rolla/dice-assets';

export const TEXTURE_TEMPLATE_TYPES = [
  'd4',
  'd6',
  'd8',
  'd10',
  'd12',
  'd20',
  'd100',
  'd66',
] as const;
export type TextureTemplateType = (typeof TEXTURE_TEMPLATE_TYPES)[number];
export interface TextureTemplate {
  readonly type: TextureTemplateType;
  readonly unwrap: DiceSurfaceUnwrap;
  readonly svg: string;
}
export interface TextureSourceEntry {
  readonly unwrap: string;
  readonly baseColor: string;
  readonly normal?: string;
  readonly orm?: string;
}
export interface TexturedSkinSetSource {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly name?: string;
  readonly material?: Omit<DiceMaterialDefinition, 'id'>;
  readonly dice: Partial<Readonly<Record<TextureTemplateType, TextureSourceEntry>>>;
}
export interface WriteTextureTemplatesOptions {
  readonly outputDirectory: string;
  readonly types?: readonly TextureTemplateType[];
  readonly id?: string;
  readonly size?: number;
  /** Replace the entire output directory after successful preparation. */
  readonly overwrite?: boolean;
}
export interface BuildTexturedSkinSetOptions {
  readonly input: string;
  readonly outputDirectory: string;
  readonly ktxExecutable?: string;
  /** Replace the entire output directory only after a successful build. */
  readonly overwrite?: boolean;
}
export interface BuiltTexturedSkinSet {
  readonly outputDirectory: string;
  readonly catalog: DiceAssetCatalogManifest;
}
