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
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  async load(uri: string): Promise<DiceAssetCatalogManifest> {
    if (uri.trim().length === 0) throw new RangeError('catalog uri must not be empty');
    const source = await (await this.#fetch(uri)).json();
    const catalog = parseCatalog(source);
    this.registry.registerCatalog(catalog);
    return catalog;
  }
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
