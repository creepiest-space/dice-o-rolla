export { DiceEngine } from './dice-engine.js';
export {
  DiceEngineDestroyedError,
  RollCancelledError,
  RollLimitExceededError,
  RollTimeoutError,
  TraceLimitExceededError,
} from './errors.js';
export type { RollLimit, TraceLimit } from './errors.js';
export type {
  DiceEngineEvents,
  DiceEngineFacade,
  DiceEngineLimits,
  DiceEngineOptions,
  DiceCollisionEvent,
  DiceImpactEvent,
  DiceCollisionEventOptions,
  DiceMaterialType,
  DiceRemovalReason,
  DiceRemoveEvent,
  DiceTheme,
  DiceTraceLimits,
  DiceVisualEvent,
  FrameScheduler,
  FrameToken,
  PhysicalRollFrame,
  PhysicalRollFrameDie,
  PhysicalRollTrace,
  PhysicalRollTraceCollisionEvent,
  PhysicalRollTraceDie,
  PhysicalRollTraceEvent,
  PhysicalRollTraceImpactEvent,
  PhysicalRollTraceProducer,
  PhysicalRollTraceProfile,
  RegisterEngineVisualPresetOptions,
  ReplayOptions,
  RollOptions,
  SimulateOptions,
} from './types.js';
export {
  getStandardVisualPresetId,
  PHYSICAL_DIE_TYPES,
  STANDARD_VISUAL_PRESETS,
  type PhysicalDieType,
} from './visual-presets.js';
export { DICE_ENGINE_VERSION } from './version.js';
