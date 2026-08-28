export {
  ThreeMaterialFactory,
  type DiceMaterialStyle,
  type FaceLabel,
  type FaceMaterialOptions,
} from './material-factory.js';
export {
  createPolyhedronGeometry,
  createFaceUvs,
  DEFAULT_THREE_THEME,
  getFaceLabel,
  ThreeDiceMeshFactory,
  type ThreeDiceMesh,
} from './mesh-factory.js';
export { ThreeCamera, ThreeLighting, ThreeScene } from './scene.js';
export { TopDownCamera, type TopDownCameraOptions } from './top-down-camera.js';
export { TopDownDiceRenderer, type TopDownDiceRendererOptions } from './top-down-dice-renderer.js';
export { ThreeDiceRenderer, type ThreeDiceRendererOptions } from './three-dice-renderer.js';
export { applyInterpolatedTransform } from './transform.js';
