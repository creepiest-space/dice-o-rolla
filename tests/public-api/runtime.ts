import { DiceEngine } from '@dice-o-rolla/dice-engine';
import { createDefaultDiceEngine } from '@dice-o-rolla/dice-engine/browser';

if (typeof DiceEngine !== 'function' || typeof createDefaultDiceEngine !== 'function') {
  throw new TypeError('Published dice-engine entry points are unavailable');
}
