import type { DiceAssetRegistry } from './asset-registry.js';
import type { DiceAssetCatalogManifest } from './types.js';

export interface DiceAssetCatalogLoaderOptions {
  readonly fetch?: (uri: string) => Promise<{ json(): Promise<unknown> }>;
}

export class DiceAssetCatalogLoader {
  readonly #fetch: (uri: string) => Promise<{ json(): Promise<unknown> }>;

  constructor(
    readonly registry: DiceAssetRegistry,
    options: DiceAssetCatalogLoaderOptions = {},
  ) {
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async load(uri: string): Promise<DiceAssetCatalogManifest> {
    if (uri.trim().length === 0) throw new RangeError('catalog uri must not be empty');
    const source = await (await this.#fetch(uri)).json();
    const catalog = resolveCatalogReferences(parseCatalog(source), uri);
    this.registry.registerCatalog(catalog);
    return catalog;
  }
}

export function resolveCatalogReferences(
  catalog: DiceAssetCatalogManifest,
  catalogUri: string,
): DiceAssetCatalogManifest {
  const resolveReference = <T extends { readonly uri: string }>(reference: T): T => ({
    ...reference,
    uri: resolveAssetUri(reference.uri, catalogUri),
  });
  return {
    ...catalog,
    ...(catalog.audioSprites === undefined
      ? {}
      : {
          audioSprites: catalog.audioSprites.map((sprite) => ({
            ...sprite,
            audio: resolveReference(sprite.audio),
          })),
        }),
    ...(catalog.patterns === undefined
      ? {}
      : {
          patterns: catalog.patterns.map((pattern) => ({
            ...pattern,
            baseColor: resolveReference(pattern.baseColor),
            ...(pattern.normal === undefined ? {} : { normal: resolveReference(pattern.normal) }),
            ...(pattern.orm === undefined ? {} : { orm: resolveReference(pattern.orm) }),
          })),
        }),
    ...(catalog.faces === undefined
      ? {}
      : {
          faces: catalog.faces.map((atlas) => ({
            ...atlas,
            texture: resolveReference(atlas.texture),
          })),
        }),
  };
}

function resolveAssetUri(assetUri: string, catalogUri: string): string {
  if (/^(?:[a-z][a-z\d+.-]*:|\/)/i.test(assetUri)) return assetUri;
  const dummyOrigin = 'https://dice-assets.invalid';
  const resolved = new URL(assetUri, new URL(catalogUri, `${dummyOrigin}/`));
  return resolved.origin === dummyOrigin
    ? `${resolved.pathname}${resolved.search}${resolved.hash}`
    : resolved.href;
}

export function parseCatalog(source: unknown): DiceAssetCatalogManifest {
  if (!isCatalogManifest(source)) {
    throw new TypeError('asset catalog must use schemaVersion 1');
  }
  return source;
}

function isCatalogManifest(source: unknown): source is DiceAssetCatalogManifest {
  if (!isRecord(source)) return false;
  if (source.schemaVersion !== 1) return false;
  for (const key of ['audioSprites', 'audioBanks', 'materials', 'patterns', 'skins', 'faces']) {
    if (source[key] !== undefined && !Array.isArray(source[key])) return false;
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
