export interface SoundCollisionEvent {
  readonly dieId: string;
  readonly otherDieId?: string;
  readonly started: boolean;
}

export interface SoundImpactEvent {
  readonly dieId: string;
  readonly otherDieId?: string;
}

/**
 * Converts Rapier's persistent contact-force stream into one audible impact
 * for each collision lifecycle. Collision-start events must be observed before
 * their matching impact events, as emitted by DiceEngine.
 */
export class ImpactSoundGate {
  readonly #armedContacts = new Set<string>();

  observeCollision(event: SoundCollisionEvent): void {
    const key = contactKey(event);
    if (event.started) this.#armedContacts.add(key);
    else this.#armedContacts.delete(key);
  }

  consumeImpact(event: SoundImpactEvent): boolean {
    const key = contactKey(event);
    if (!this.#armedContacts.has(key)) return false;
    this.#armedContacts.delete(key);
    return true;
  }

  clear(): void {
    this.#armedContacts.clear();
  }
}

function contactKey(event: SoundImpactEvent): string {
  if (event.otherDieId === undefined) return JSON.stringify([event.dieId, 'surface']);
  return JSON.stringify([event.dieId, event.otherDieId].toSorted());
}
