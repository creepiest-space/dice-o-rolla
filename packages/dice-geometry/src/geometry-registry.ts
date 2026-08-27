import type { DieType } from '@creepiest-space/dice-core';

import { D6_DEFINITION } from './definitions/d6.js';
import type { PolyhedronDefinition } from './types.js';
import { assertValidPolyhedronDefinition } from './validation.js';

const definitions = new Map<DieType, PolyhedronDefinition>([[D6_DEFINITION.id, D6_DEFINITION]]);

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
