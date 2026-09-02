import type { RendererTheme } from '@dice-o-rolla/dice-renderer';
import type { WebGLRenderer } from 'three';

import type { ThreeFaceMaterialProvider } from './mesh-factory.js';
import type { ViewportLimitOptions } from './viewport-limits.js';

/** Options shared by every official Three.js dice renderer. */
export interface ThreeRendererOptions extends Partial<RendererTheme>, ViewportLimitOptions {
  readonly antialias?: boolean;
  readonly observeResize?: boolean;
  readonly materialProvider?:
    | ThreeFaceMaterialProvider
    | ((renderer: WebGLRenderer) => ThreeFaceMaterialProvider);
}
