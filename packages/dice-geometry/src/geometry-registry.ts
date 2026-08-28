import type { DieType } from '@dice-o-rolla/dice-core';

import { D4_DEFINITION } from './definitions/d4.js';
import { D6_DEFINITION } from './definitions/d6.js';
import { D8_DEFINITION } from './definitions/d8.js';
import { D10_DEFINITION } from './definitions/d10.js';
import { D12_DEFINITION } from './definitions/d12.js';
import { D20_DEFINITION } from './definitions/d20.js';
import type { PolyhedronDefinition } from './types.js';
import { assertValidPolyhedronDefinition } from './validation.js';

const definitions = new Map<DieType, PolyhedronDefinition>(
  [D4_DEFINITION, D6_DEFINITION, D8_DEFINITION, D10_DEFINITION, D12_DEFINITION, D20_DEFINITION].map(
    (definition) => [definition.id, definition],
  ),
);

for (const definition of definitions.values()) assertValidPolyhedronDefinition(definition);

export function hasDieGeometry(type: DieType): boolean {
  return definitions.has(type);
}

export function getDieGeometry(type: DieType): PolyhedronDefinition {
  const definition = definitions.get(type);
  if (definition === undefined) throw new RangeError(`Geometry is not registered for ${type}`);
  return definition;
}

export function getRegisteredDieTypes(): readonly DieType[] {
  return Object.freeze(Array.from(definitions.keys()));
}
