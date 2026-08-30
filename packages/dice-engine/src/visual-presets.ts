import type { DieType } from '@dice-o-rolla/dice-core';
import type { VisualPresetDescriptor } from '@dice-o-rolla/dice-renderer';

export type PhysicalDieType = Exclude<DieType, 'd100'>;

export const PHYSICAL_DIE_TYPES: readonly PhysicalDieType[] = Object.freeze([
  'd4',
  'd6',
  'd8',
  'd10',
  'd12',
  'd20',
]);

export const STANDARD_VISUAL_PRESETS: readonly VisualPresetDescriptor[] = Object.freeze(
  PHYSICAL_DIE_TYPES.map((dieType) =>
    Object.freeze({
      id: `standard:${dieType}`,
      dieType,
      geometryId: dieType,
      scale: 1,
    }),
  ),
);

export function getStandardVisualPresetId(dieType: PhysicalDieType): string {
  return `standard:${dieType}`;
}

export function isPhysicalDieType(value: unknown): value is PhysicalDieType {
  return PHYSICAL_DIE_TYPES.some((type) => type === value);
}
