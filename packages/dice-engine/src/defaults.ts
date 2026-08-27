import type { DiceTheme, FrameScheduler, FrameToken } from './types.js';

export const DEFAULT_THEME: DiceTheme = Object.freeze({
  material: 'plastic',
  bodyColor: '#f7f3e8',
  labelColor: '#181818',
  roughness: 0.28,
  metalness: 0,
});

export const defaultFrameScheduler: FrameScheduler = {
  request(callback): FrameToken {
    const animationFrame = globalThis as typeof globalThis & {
      requestAnimationFrame?: (frameCallback: (timestampMs: number) => void) => number;
      cancelAnimationFrame?: (handle: number) => void;
    };
    if (
      typeof animationFrame.requestAnimationFrame === 'function' &&
      typeof animationFrame.cancelAnimationFrame === 'function'
    ) {
      const handle = animationFrame.requestAnimationFrame(callback);
      return { cancel: () => animationFrame.cancelAnimationFrame?.(handle) };
    }

    const handle = setTimeout(() => callback(performance.now()), 16);
    return { cancel: () => clearTimeout(handle) };
  },
};
