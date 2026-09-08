import { getDieGeometry, type StandardDiceNetType } from '@dice-o-rolla/dice-geometry';
import type { VisualPresetDescriptor } from '@dice-o-rolla/dice-renderer';
import { validateSurfaceUvs } from '@dice-o-rolla/dice-renderer-three';

import type { DiceAssetRegistry } from './asset-registry.js';

export interface TexturedSkinSetTarget {
  registerVisualPreset(preset: VisualPresetDescriptor): VisualPresetDescriptor;
  unregisterVisualPreset(id: string): boolean;
}
export interface TexturedSkinSetProvider {
  readonly registry: DiceAssetRegistry;
  prepareSkin(id: string): Promise<void>;
}
export interface PrepareTexturedSkinSetOptions {
  readonly registry: DiceAssetRegistry;
  readonly provider: TexturedSkinSetProvider;
  readonly skinSetId: string;
  readonly presetPrefix?: string;
  readonly soundPackId?: string;
}
export interface TexturedSkinSetSelectionContext {
  readonly physicalDieType: string;
  readonly component?: { readonly role: string; readonly groupType: string };
}
export interface PreparedTexturedSkinSet {
  readonly presets: readonly VisualPresetDescriptor[];
  /** Register without changing defaults. Repeated registration through this API is idempotent. */
  register(engine: TexturedSkinSetTarget): void;
  readonly visualPresetSelector: (context: TexturedSkinSetSelectionContext) => string | undefined;
}

const registrations = new WeakMap<TexturedSkinSetTarget, Map<string, string>>();
const geometries: Readonly<Record<string, StandardDiceNetType>> = {
  d4: 'd4',
  d6: 'd6',
  d8: 'd8',
  d10: 'd10',
  d12: 'd12',
  d20: 'd20',
  d100: 'd10',
  d66: 'd6',
};
const identifier = /^[a-z0-9][a-z0-9._:-]*$/i;

/** Validate and load first; engine registration is an explicit, separate operation. */
export async function prepareTexturedSkinSet(
  options: PrepareTexturedSkinSetOptions,
): Promise<PreparedTexturedSkinSet> {
  const { registry, provider, skinSetId } = options;
  if (provider.registry !== registry)
    throw new Error('The material provider must use the supplied asset registry');
  registry.validateReferences();
  const set = registry.skinSets.get(skinSetId);
  if (set === undefined) throw new Error(`Unknown skin set: ${skinSetId}`);
  const prefix = options.presetPrefix ?? `skin-set:${skinSetId}`;
  if (
    !identifier.test(prefix) ||
    (options.soundPackId !== undefined && !identifier.test(options.soundPackId))
  )
    throw new RangeError('Preset prefix and sound pack id must be portable identifiers');
  const entries = Object.entries(set.skins).map(([type, skinId]) => {
    const geometryId = Object.hasOwn(geometries, type) ? geometries[type] : undefined;
    if (geometryId === undefined)
      throw new Error(`Skin set "${skinSetId}" has unsupported type "${type}"`);
    const skin = registry.skins.get(skinId)!;
    const pattern = registry.patterns.get(skin.patternId)!;
    if (pattern.unwrap?.geometryId !== geometryId)
      throw new Error(`Skin "${skinId}" for ${type} requires an unwrap for ${geometryId}`);
    try {
      validateSurfaceUvs(getDieGeometry(geometryId), pattern.unwrap.faces);
    } catch (error) {
      throw new Error(
        `Skin "${skinId}": ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    const preset: VisualPresetDescriptor = Object.freeze({
      id: `${prefix}:${type}`,
      dieType: geometryId,
      geometryId,
      skinId,
      ...(options.soundPackId === undefined ? {} : { soundPackId: options.soundPackId }),
    });
    return {
      type,
      skinId,
      preset,
      fingerprint: canonical({
        preset,
        skin,
        pattern,
        material: registry.materials.get(skin.materialId),
        atlas: skin.faceAtlasId === undefined ? null : registry.faces.get(skin.faceAtlasId),
      }),
    };
  });
  await Promise.all(
    [...new Set(entries.map((entry) => entry.skinId))].map((id) => provider.prepareSkin(id)),
  );
  const byType = new Map(entries.map((entry) => [entry.type, entry.preset.id]));
  return Object.freeze({
    presets: Object.freeze(entries.map((entry) => entry.preset)),
    register(engine: TexturedSkinSetTarget): void {
      const known = registrations.get(engine) ?? new Map<string, string>();
      for (const entry of entries) {
        const previous = known.get(entry.preset.id);
        if (previous !== undefined && previous !== entry.fingerprint)
          throw new Error(`Conflicting preset: ${entry.preset.id}`);
      }
      const added: string[] = [];
      try {
        for (const entry of entries) {
          if (known.has(entry.preset.id)) continue;
          engine.registerVisualPreset(entry.preset);
          added.push(entry.preset.id);
          known.set(entry.preset.id, entry.fingerprint);
        }
      } catch (error) {
        const rollbackErrors: unknown[] = [];
        for (const id of added.toReversed()) {
          try {
            engine.unregisterVisualPreset(id);
            known.delete(id);
          } catch (rollbackError) {
            rollbackErrors.push(rollbackError);
          }
        }
        registrations.set(engine, known);
        if (rollbackErrors.length > 0)
          throw new AggregateError(
            [error, ...rollbackErrors],
            'Preset registration and rollback failed',
            { cause: error },
          );
        throw error;
      }
      registrations.set(engine, known);
    },
    visualPresetSelector(context: TexturedSkinSetSelectionContext): string | undefined {
      return byType.get(
        context.component?.role === 'tens' ? context.component.groupType : context.physicalDieType,
      );
    },
  });
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
