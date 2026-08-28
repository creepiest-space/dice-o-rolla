import type { RendererViewport } from '@creepiest-space/dice-renderer';

export interface ViewportLimitOptions {
  readonly maxPixelRatio?: number;
  readonly maxViewportDimension?: number;
  readonly maxFramebufferPixels?: number;
}

export interface ViewportLimits {
  readonly maxPixelRatio: number;
  readonly maxViewportDimension: number;
  readonly maxFramebufferPixels: number;
}

const DEFAULT_VIEWPORT_LIMITS: ViewportLimits = Object.freeze({
  maxPixelRatio: 2,
  maxViewportDimension: 8_192,
  maxFramebufferPixels: 33_554_432,
});

export function resolveViewportLimits(options: ViewportLimitOptions): ViewportLimits {
  const limits = Object.freeze({
    maxPixelRatio: options.maxPixelRatio ?? DEFAULT_VIEWPORT_LIMITS.maxPixelRatio,
    maxViewportDimension:
      options.maxViewportDimension ?? DEFAULT_VIEWPORT_LIMITS.maxViewportDimension,
    maxFramebufferPixels:
      options.maxFramebufferPixels ?? DEFAULT_VIEWPORT_LIMITS.maxFramebufferPixels,
  });
  for (const [name, value] of [
    ['maxPixelRatio', limits.maxPixelRatio],
    ['maxViewportDimension', limits.maxViewportDimension],
    ['maxFramebufferPixels', limits.maxFramebufferPixels],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive finite number`);
    }
  }
  return limits;
}

export function validateViewport(viewport: RendererViewport, limits: ViewportLimits): void {
  if (![viewport.width, viewport.height, viewport.pixelRatio].every(Number.isFinite)) {
    throw new RangeError('Viewport values must be finite');
  }
  if (viewport.width <= 0 || viewport.height <= 0 || viewport.pixelRatio <= 0) {
    throw new RangeError('Viewport values must be positive');
  }
  if (
    viewport.width > limits.maxViewportDimension ||
    viewport.height > limits.maxViewportDimension
  ) {
    throw new RangeError(`Viewport dimensions must not exceed ${limits.maxViewportDimension}`);
  }
  if (viewport.pixelRatio > limits.maxPixelRatio) {
    throw new RangeError(`Viewport pixel ratio must not exceed ${limits.maxPixelRatio}`);
  }
  if (framebufferPixels(viewport) > limits.maxFramebufferPixels) {
    throw new RangeError(`Framebuffer must not exceed ${limits.maxFramebufferPixels} pixels`);
  }
}

export function fitViewportToLimits(
  viewport: RendererViewport,
  limits: ViewportLimits,
): RendererViewport {
  const width = Math.min(viewport.width, limits.maxViewportDimension);
  const height = Math.min(viewport.height, limits.maxViewportDimension);
  const pixelBudgetRatio =
    Math.sqrt(limits.maxFramebufferPixels / (width * height)) * (1 - Number.EPSILON);
  const pixelRatio = Math.min(viewport.pixelRatio, limits.maxPixelRatio, pixelBudgetRatio);
  return { width, height, pixelRatio };
}

function framebufferPixels(viewport: RendererViewport): number {
  return viewport.width * viewport.height * viewport.pixelRatio ** 2;
}
