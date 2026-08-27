import * as RAPIER from '@dimforge/rapier3d-compat';

let initialization: Promise<void> | undefined;

export async function initializeRapier(): Promise<typeof RAPIER> {
  initialization ??= RAPIER.init();
  await initialization;
  return RAPIER;
}
