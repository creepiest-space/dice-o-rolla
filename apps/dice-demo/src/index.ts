import { createDefaultDiceEngine } from '@dice-o-rolla/dice-engine/browser';
import type { DefaultDiceEngineOptions } from '@dice-o-rolla/dice-engine/browser';

import { presentRollResult } from './presentation.js';

type Engine = Awaited<ReturnType<typeof createDefaultDiceEngine>>;
type PhysicsPreset = 'calm' | 'classic' | 'lively';

const tray = element('tray', HTMLDivElement);
const form = element('roll-form', HTMLFormElement);
const notation = element('notation', HTMLInputElement);
const rollButton = element('roll', HTMLButtonElement);
const clearButton = element('clear', HTMLButtonElement);
const result = element('result', HTMLOutputElement);
const status = element('status', HTMLParagraphElement);
const theme = element('theme', HTMLSelectElement);
const preset = element('preset', HTMLSelectElement);
const shortcuts = document.querySelectorAll<HTMLButtonElement>('[data-notation]');

const PRESETS = {
  classic: {},
  calm: {
    diceMaterial: {
      friction: 0.82,
      restitution: 0.06,
      linearDamping: 0.45,
      angularDamping: 0.45,
    },
    throw: {
      position: {
        x: { min: -1.5, max: 1.5 },
        y: { min: 3.2, max: 4.2 },
        z: { min: -1.5, max: 1.5 },
      },
      impulse: {
        x: { min: -1.4, max: 1.4 },
        y: { min: 0.4, max: 1.2 },
        z: { min: -1.4, max: 1.4 },
      },
      torqueImpulse: {
        x: { min: -2, max: 2 },
        y: { min: -2, max: 2 },
        z: { min: -2, max: 2 },
      },
    },
  },
  lively: {
    diceMaterial: {
      friction: 0.62,
      restitution: 0.28,
      linearDamping: 0.14,
      angularDamping: 0.14,
    },
    throw: {
      position: {
        x: { min: -2.4, max: 2.4 },
        y: { min: 4.5, max: 5.8 },
        z: { min: -2.4, max: 2.4 },
      },
      impulse: {
        x: { min: -3.2, max: 3.2 },
        y: { min: 0.8, max: 2.4 },
        z: { min: -3.2, max: 3.2 },
      },
      torqueImpulse: {
        x: { min: -4, max: 4 },
        y: { min: -4, max: 4 },
        z: { min: -4, max: 4 },
      },
    },
  },
} as const satisfies Record<PhysicsPreset, DefaultDiceEngineOptions['engine']>;

let engine: Engine | undefined;
let engineGeneration = 0;
let rolling = false;

form.addEventListener('submit', (event) => {
  event.preventDefault();
  void roll(notation.value);
});

clearButton.addEventListener('click', () => {
  engine?.clear();
  showEmptyResult();
  setStatus('Tray cleared');
});

for (const shortcut of shortcuts) {
  shortcut.addEventListener('click', () => {
    const quickNotation = shortcut.dataset.notation;
    if (quickNotation === undefined) return;
    notation.value = quickNotation;
    void roll(quickNotation);
  });
}

theme.addEventListener('change', () => {
  engine?.setTheme({
    material: theme.value === 'matte' ? 'matte' : 'plastic',
    roughness: theme.value === 'matte' ? 0.86 : 0.28,
  });
});

preset.addEventListener('change', () => void initializeEngine(toPreset(preset.value)));
window.addEventListener('beforeunload', () => engine?.destroy(), { once: true });

void initializeEngine('classic');

async function initializeEngine(selectedPreset: PhysicsPreset): Promise<void> {
  const generation = ++engineGeneration;
  rolling = false;
  setEnabled(false);
  setStatus('Starting engine…');
  engine?.destroy();
  engine = undefined;

  try {
    const nextEngine = await createDefaultDiceEngine({
      container: tray,
      engine: PRESETS[selectedPreset],
    });
    if (generation !== engineGeneration) {
      nextEngine.destroy();
      return;
    }
    engine = nextEngine;
    engine.setTheme({
      material: theme.value === 'matte' ? 'matte' : 'plastic',
      roughness: theme.value === 'matte' ? 0.86 : 0.28,
    });
    setEnabled(true);
    setStatus(`${capitalize(selectedPreset)} throw ready`);
  } catch (error) {
    if (generation !== engineGeneration) return;
    showError(error);
  }
}

async function roll(source: string): Promise<void> {
  const activeEngine = engine;
  if (activeEngine === undefined || rolling) return;
  rolling = true;
  setRolling(true);
  setStatus(`Rolling ${source}…`);
  try {
    const rollResult = await activeEngine.roll(source);
    const presentation = presentRollResult(rollResult);
    result.replaceChildren(
      text('span', 'result-label', presentation.notation),
      text('strong', '', presentation.total),
      text('span', '', presentation.dice),
    );
    setStatus('Roll settled');
  } catch (error) {
    if (error instanceof Error && error.name === 'RollCancelledError') return;
    showError(error);
  } finally {
    if (engine === activeEngine) {
      rolling = false;
      setRolling(false);
    }
  }
}

function showEmptyResult(): void {
  result.replaceChildren(
    text('span', 'result-label', 'Last roll'),
    text('strong', '', '—'),
    text('span', '', 'Choose a die or enter notation.'),
  );
}

function showError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  setStatus(message, true);
}

function setStatus(message: string, failed = false): void {
  status.textContent = message;
  status.classList.toggle('error', failed);
}

function setEnabled(enabled: boolean): void {
  rollButton.disabled = !enabled;
  clearButton.disabled = !enabled;
  theme.disabled = !enabled;
  preset.disabled = !enabled;
  for (const shortcut of shortcuts) shortcut.disabled = !enabled;
}

function setRolling(active: boolean): void {
  rollButton.disabled = active;
  preset.disabled = active;
  for (const shortcut of shortcuts) shortcut.disabled = active;
}

function text(tag: 'span' | 'strong', className: string, value: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = value;
  return node;
}

function element<T extends HTMLElement>(id: string, constructor: new () => T): T {
  const value = document.getElementById(id);
  if (!(value instanceof constructor)) throw new Error(`Missing required element: #${id}`);
  return value;
}

function toPreset(value: string): PhysicsPreset {
  return value === 'calm' || value === 'lively' ? value : 'classic';
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
