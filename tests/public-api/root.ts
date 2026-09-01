import type { DieResultProvenance, RollResult } from '@dice-o-rolla/dice-core';
import {
  DICE_ENGINE_VERSION,
  DiceEngine,
  DiceEngineDestroyedError,
  RollCancelledError,
  RollLimitExceededError,
  RollTimeoutError,
  TraceLimitExceededError,
  getStandardVisualPresetId,
  type DiceEngineEvents,
  type DiceEngineFacade,
  type DiceEngineOptions,
  type DiceTheme,
  type PhysicalRollTrace,
  type ReplayOptions,
  type RollOptions,
  type SimulateOptions,
} from '@dice-o-rolla/dice-engine';

declare const options: DiceEngineOptions;
declare const facade: DiceEngineFacade;
declare const rollOptions: RollOptions;
declare const simulateOptions: SimulateOptions;
declare const replayOptions: ReplayOptions;
declare const trace: PhysicalRollTrace;
declare const theme: DiceTheme;
declare const events: DiceEngineEvents;
declare const result: RollResult;
declare const provenance: DieResultProvenance;

const engine = new DiceEngine(options);
const roll: Promise<RollResult> = engine.roll('4d6kh3', rollOptions);
const simulation: Promise<PhysicalRollTrace> = engine.simulate('4d6kh3', simulateOptions);
const replay: Promise<void> = engine.replay(trace, replayOptions);
const selectedTheme: DiceTheme = engine.setTheme(theme);
const standardD20: string = getStandardVisualPresetId('d20');
const constructors = [
  DiceEngineDestroyedError,
  RollCancelledError,
  RollLimitExceededError,
  RollTimeoutError,
  TraceLimitExceededError,
] as const;
const engineVersion: string = DICE_ENGINE_VERSION;

void facade;
void events;
void result;
void roll;
void simulation;
void replay;
void selectedTheme;
void standardD20;
void constructors;
void engineVersion;
void provenance;

// @ts-expect-error Published results are immutable snapshots.
result.total = 0;
// @ts-expect-error Published dice collections cannot be extended in place.
result.dice.push(result.dice[0]);
// @ts-expect-error Engine option groups are readonly consumer input.
options.limits = { maxLogicalDice: 1 };
// @ts-expect-error Trace provenance is an immutable result snapshot.
provenance.physicalIndex = 0;
