import type { RollResult } from '@dice-o-rolla/dice-core';
import {
  DiceEngine,
  DiceEngineDestroyedError,
  RollCancelledError,
  RollLimitExceededError,
  RollTimeoutError,
  getStandardVisualPresetId,
  type DiceEngineEvents,
  type DiceEngineFacade,
  type DiceEngineOptions,
  type DiceTheme,
  type RollOptions,
} from '@dice-o-rolla/dice-engine';

declare const options: DiceEngineOptions;
declare const facade: DiceEngineFacade;
declare const rollOptions: RollOptions;
declare const theme: DiceTheme;
declare const events: DiceEngineEvents;
declare const result: RollResult;

const engine = new DiceEngine(options);
const roll: Promise<RollResult> = engine.roll('4d6kh3', rollOptions);
const selectedTheme: DiceTheme = engine.setTheme(theme);
const standardD20: string = getStandardVisualPresetId('d20');
const constructors = [
  DiceEngineDestroyedError,
  RollCancelledError,
  RollLimitExceededError,
  RollTimeoutError,
] as const;

void facade;
void events;
void result;
void roll;
void selectedTheme;
void standardD20;
void constructors;

// @ts-expect-error Published results are immutable snapshots.
result.total = 0;
// @ts-expect-error Published dice collections cannot be extended in place.
result.dice.push(result.dice[0]);
// @ts-expect-error Engine option groups are readonly consumer input.
options.limits = { maxLogicalDice: 1 };
