import { describe, expect, test } from 'bun:test';

import { TypedEventEmitter } from '../src/index.js';

interface TestEvents {
  readonly count: number;
  readonly message: { readonly value: string };
}

describe('TypedEventEmitter', () => {
  test('subscribes, emits, and unsubscribes listeners', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const values: number[] = [];
    const unsubscribe = emitter.on('count', (value) => values.push(value));

    emitter.emit('count', 1);
    unsubscribe();
    emitter.emit('count', 2);

    expect(values).toEqual([1]);
    expect(emitter.listenerCount('count')).toBe(0);
  });

  test('removes once listeners before invoking them', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const values: string[] = [];

    emitter.once('message', ({ value }) => {
      values.push(value);
      emitter.emit('message', { value: 'nested' });
    });
    emitter.emit('message', { value: 'first' });

    expect(values).toEqual(['first']);
  });

  test('can clear one event or every event', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    emitter.on('count', () => undefined);
    emitter.on('message', () => undefined);

    emitter.clear('count');
    expect(emitter.listenerCount('count')).toBe(0);
    expect(emitter.listenerCount('message')).toBe(1);

    emitter.clear();
    expect(emitter.listenerCount('message')).toBe(0);
  });

  test('isolates listener failures and reports them to the emitter', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const listenerError = new Error('listener failed');
    const values: number[] = [];
    emitter.on('count', () => {
      throw listenerError;
    });
    emitter.on('count', (value) => values.push(value));

    const errors = emitter.emit('count', 7);

    expect(errors).toEqual([listenerError]);
    expect(values).toEqual([7]);
  });
});
