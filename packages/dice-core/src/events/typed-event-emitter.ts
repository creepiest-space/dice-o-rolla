type EventMap = object;
type EventListener<Payload> = (payload: Payload) => void;

class EventChannel<Payload> {
  readonly #listeners = new Set<EventListener<Payload>>();

  public add(listener: EventListener<Payload>): void {
    this.#listeners.add(listener);
  }

  public delete(listener: EventListener<Payload>): void {
    this.#listeners.delete(listener);
  }

  public emit(payload: Payload): void {
    for (const listener of Array.from(this.#listeners)) {
      listener(payload);
    }
  }

  public clear(): void {
    this.#listeners.clear();
  }

  public get size(): number {
    return this.#listeners.size;
  }
}

export class TypedEventEmitter<Events extends EventMap> {
  readonly #channels: Partial<{ [Key in keyof Events]: EventChannel<Events[Key]> }> = {};
  readonly #allChannels = new Set<{ clear(): void }>();

  public on<Key extends keyof Events>(
    event: Key,
    listener: EventListener<Events[Key]>,
  ): () => void {
    const channel = this.#getOrCreateChannel(event);
    channel.add(listener);
    return (): void => channel.delete(listener);
  }

  public once<Key extends keyof Events>(
    event: Key,
    listener: EventListener<Events[Key]>,
  ): () => void {
    const channel = this.#getOrCreateChannel(event);
    const onceListener = (payload: Events[Key]): void => {
      channel.delete(onceListener);
      listener(payload);
    };
    channel.add(onceListener);
    return (): void => channel.delete(onceListener);
  }

  public off<Key extends keyof Events>(event: Key, listener: EventListener<Events[Key]>): void {
    this.#channels[event]?.delete(listener);
  }

  public emit<Key extends keyof Events>(event: Key, payload: Events[Key]): void {
    this.#channels[event]?.emit(payload);
  }

  public clear(event?: keyof Events): void {
    if (event !== undefined) {
      this.#channels[event]?.clear();
      return;
    }

    for (const channel of this.#allChannels) {
      channel.clear();
    }
  }

  public listenerCount(event: keyof Events): number {
    return this.#channels[event]?.size ?? 0;
  }

  #getOrCreateChannel<Key extends keyof Events>(event: Key): EventChannel<Events[Key]> {
    const existing = this.#channels[event];
    if (existing !== undefined) return existing;

    const channel = new EventChannel<Events[Key]>();
    this.#channels[event] = channel;
    this.#allChannels.add(channel);
    return channel;
  }
}
