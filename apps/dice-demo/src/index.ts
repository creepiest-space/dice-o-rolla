import {
  DiceAssetCatalogLoader,
  DiceAssetRegistry,
  ImpactSoundGate,
  ThreeAssetMaterialProvider,
  WebAudioSpritePlayer,
} from '@dice-o-rolla/dice-assets';
import { getStandardVisualPresetId, type PhysicalRollTrace } from '@dice-o-rolla/dice-engine';
import { createDefaultDiceEngine } from '@dice-o-rolla/dice-engine/browser';
import type { DefaultDiceEngineOptions } from '@dice-o-rolla/dice-engine/browser';

import { presentRollResult } from './presentation.js';

type Engine = Awaited<ReturnType<typeof createDefaultDiceEngine>>;
type PhysicsPreset = 'calm' | 'classic' | 'lively';
type AssetSkin = 'amethyst' | 'classic' | 'emerald';
type AudioSurface = 'felt' | 'metal' | 'wood-table' | 'wood-tray';

const tray = element('tray', HTMLDivElement);
const form = element('roll-form', HTMLFormElement);
const notation = element('notation', HTMLInputElement);
const rollButton = element('roll', HTMLButtonElement);
const clearButton = element('clear', HTMLButtonElement);
const simulateButton = element('simulate', HTMLButtonElement);
const replayButton = element('replay', HTMLButtonElement);
const cancelReplayButton = element('cancel-replay', HTMLButtonElement);
const simulationSeed = element('simulation-seed', HTMLInputElement);
const traceSummary = element('trace-summary', HTMLOutputElement);
const result = element('result', HTMLOutputElement);
const status = element('status', HTMLParagraphElement);
const theme = element('theme', HTMLSelectElement);
const preset = element('preset', HTMLSelectElement);
const assets = element('assets', HTMLSelectElement);
const audio = element('audio', HTMLInputElement);
const audioSurface = element('audio-surface', HTMLSelectElement);
const shortcuts = document.querySelectorAll<HTMLButtonElement>('.shortcuts [data-notation]');
const assetCases = document.querySelectorAll<HTMLButtonElement>('[data-asset-skin]');

const assetRegistry = new DiceAssetRegistry();
const assetsReady = loadAssets();

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
let lastTrace: PhysicalRollTrace | undefined;
let replayController: AbortController | undefined;
let audioContext: AudioContext | undefined;
let audioPlayer: WebAudioSpritePlayer | undefined;

form.addEventListener('submit', (event) => {
  event.preventDefault();
  void roll(notation.value);
});

clearButton.addEventListener('click', () => {
  replayController?.abort();
  engine?.clear();
  clearTrace();
  showEmptyResult();
  setStatus('Tray cleared');
});

simulateButton.addEventListener('click', () => void simulate(notation.value));
replayButton.addEventListener('click', () => void replay());
cancelReplayButton.addEventListener('click', () => replayController?.abort());

for (const shortcut of shortcuts) {
  shortcut.addEventListener('click', () => {
    const quickNotation = shortcut.dataset.notation;
    if (quickNotation === undefined) return;
    notation.value = quickNotation;
    void roll(quickNotation);
  });
}

theme.addEventListener('change', () => {
  engine?.setTheme(selectedTheme());
});

preset.addEventListener('change', () => void initializeEngine(toPreset(preset.value)));
assets.addEventListener('change', () => {
  const activeEngine = engine;
  if (activeEngine === undefined) return;
  applyAssetSkin(activeEngine, toAssetSkin(assets.value));
  setStatus(`${capitalize(assets.value)} assets ready`);
});
audio.addEventListener('change', () => {
  if (audio.checked) void enableAudio();
});
for (const assetCase of assetCases) {
  assetCase.addEventListener('click', () => void runAssetCase(assetCase));
}
window.addEventListener(
  'beforeunload',
  () => {
    engine?.destroy();
    void audioContext?.close();
  },
  { once: true },
);

void initializeEngine('classic');

async function initializeEngine(selectedPreset: PhysicsPreset): Promise<void> {
  const generation = ++engineGeneration;
  replayController?.abort();
  replayController = undefined;
  clearTrace();
  rolling = false;
  setEnabled(false);
  setStatus('Starting engine…');
  engine?.destroy();
  engine = undefined;

  try {
    await assetsReady;
    let materialProvider: ThreeAssetMaterialProvider | undefined;
    const nextEngine = await createDefaultDiceEngine({
      container: tray,
      renderer: {
        materialProvider: (renderer) => {
          materialProvider = new ThreeAssetMaterialProvider(assetRegistry, {
            renderer,
            transcoderPath: './assets/basis/',
          });
          return materialProvider;
        },
      },
      engine: {
        ...PRESETS[selectedPreset],
        collisionEvents: { enabled: true, maxEventsPerFrame: 24 },
      },
    });
    if (materialProvider === undefined) throw new Error('Asset material provider was not created');
    await Promise.all([
      materialProvider.prepareSkin('procedural-amethyst'),
      materialProvider.prepareSkin('procedural-emerald'),
    ]);
    registerAssetPresets(nextEngine);
    applyAssetSkin(nextEngine, toAssetSkin(assets.value));
    const impactSoundGate = new ImpactSoundGate();
    let soundSessionId: string | undefined;
    nextEngine.on('die:spawn', (event) => {
      if (event.sessionId === soundSessionId) return;
      soundSessionId = event.sessionId;
      impactSoundGate.clear();
    });
    nextEngine.on('die:collision', (event) => impactSoundGate.observeCollision(event));
    nextEngine.on('die:impact', (event) => {
      if (!impactSoundGate.consumeImpact(event)) return;
      if (!audio.checked || audioPlayer === undefined || event.soundPackId === undefined) return;
      void audioPlayer.playImpact({
        force: event.force,
        dieMaterialBankId: event.soundPackId,
        ...(event.otherDieId === undefined
          ? { surfaceMaterialBankId: toAudioSurfaceBank(audioSurface.value) }
          : {}),
      });
    });
    if (generation !== engineGeneration) {
      nextEngine.destroy();
      return;
    }
    engine = nextEngine;
    engine.setTheme(selectedTheme());
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
    showRollResult(rollResult);
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

async function simulate(source: string): Promise<void> {
  const activeEngine = engine;
  if (activeEngine === undefined || rolling) return;
  const seed = Number(simulationSeed.value);
  if (!Number.isSafeInteger(seed)) {
    setStatus('Simulation seed must be a safe integer', true);
    return;
  }
  rolling = true;
  lastTrace = undefined;
  setRolling(true);
  setTraceSummary('Capturing fixed-step frames…');
  setStatus(`Simulating ${source} with seed ${seed}…`);
  try {
    const trace = await activeEngine.simulate(source, { seed, captureFrames: true });
    if (engine !== activeEngine) return;
    lastTrace = trace;
    showRollResult(trace.result);
    const bytes = new TextEncoder().encode(JSON.stringify(trace)).byteLength;
    setTraceSummary(
      `Seed ${trace.seed} · ${trace.dice.length} dice · ${trace.frames.length} frames · ${trace.events.length} events · ${trace.durationSeconds.toFixed(2)} s · ${formatBytes(bytes)}`,
    );
    setStatus('Simulation captured — ready to replay');
  } catch (error) {
    clearTrace();
    showError(error);
  } finally {
    if (engine === activeEngine) {
      rolling = false;
      setRolling(false);
    }
  }
}

async function replay(): Promise<void> {
  const activeEngine = engine;
  const trace = lastTrace;
  if (activeEngine === undefined || trace === undefined || rolling) return;
  const controller = new AbortController();
  replayController = controller;
  rolling = true;
  setRolling(true);
  setStatus(`Replaying ${trace.dice.length} captured dice…`);
  try {
    await activeEngine.replay(trace, { theme: selectedTheme(), signal: controller.signal });
    setStatus('Replay complete');
  } catch (error) {
    if (error instanceof Error && error.name === 'RollCancelledError') {
      if (engine === activeEngine && lastTrace === trace) setStatus('Replay cancelled');
      return;
    }
    showError(error);
  } finally {
    if (engine === activeEngine) {
      replayController = undefined;
      rolling = false;
      setRolling(false);
    }
  }
}

function showRollResult(rollResult: Parameters<typeof presentRollResult>[0]): void {
  const presentation = presentRollResult(rollResult);
  result.replaceChildren(
    text('span', 'result-label', presentation.notation),
    text('strong', '', presentation.total),
    text('span', '', presentation.dice),
  );
}

function showEmptyResult(): void {
  result.replaceChildren(
    text('span', 'result-label', 'Last roll'),
    text('strong', '', '—'),
    text('span', '', 'Choose a die or enter notation.'),
  );
}

function clearTrace(): void {
  lastTrace = undefined;
  replayButton.disabled = true;
  setTraceSummary('No captured simulation.');
}

function setTraceSummary(value: string): void {
  traceSummary.textContent = value;
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
  simulateButton.disabled = !enabled;
  replayButton.disabled = !enabled || lastTrace === undefined;
  cancelReplayButton.disabled = true;
  simulationSeed.disabled = !enabled;
  theme.disabled = !enabled;
  preset.disabled = !enabled;
  assets.disabled = !enabled;
  audio.disabled = !enabled;
  for (const shortcut of shortcuts) shortcut.disabled = !enabled;
  for (const assetCase of assetCases) assetCase.disabled = !enabled;
}

function setRolling(active: boolean): void {
  rollButton.disabled = active;
  simulateButton.disabled = active;
  replayButton.disabled = active || lastTrace === undefined;
  cancelReplayButton.disabled = !active || replayController === undefined;
  simulationSeed.disabled = active;
  theme.disabled = active;
  preset.disabled = active;
  assets.disabled = active;
  for (const shortcut of shortcuts) shortcut.disabled = active;
  for (const assetCase of assetCases) assetCase.disabled = active;
}

function selectedTheme(): Parameters<Engine['setTheme']>[0] {
  return {
    material: theme.value === 'matte' ? 'matte' : 'plastic',
    roughness: theme.value === 'matte' ? 0.86 : 0.28,
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KiB`;
  return `${(bytes / 1_048_576).toFixed(1)} MiB`;
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

function toAssetSkin(value: string): AssetSkin {
  return value === 'amethyst' || value === 'emerald' ? value : 'classic';
}

async function loadAssets(): Promise<void> {
  const loader = new DiceAssetCatalogLoader(assetRegistry);
  await loader.load('./assets/dice/catalog.json');
  const amethyst = assetRegistry.skins.get('procedural-amethyst');
  if (amethyst === undefined) throw new Error('Procedural skin is missing from the asset catalog');
  assetRegistry.skins.register({
    ...amethyst,
    id: 'procedural-emerald',
    name: 'Procedural emerald',
    tint: '#72e0b5',
    hueRotation: 0.38,
    saturation: 1.16,
    composite: 'overlay',
  });
}

function registerAssetPresets(activeEngine: Engine): void {
  for (const dieType of ['d6', 'd20'] as const) {
    for (const skin of ['amethyst', 'emerald'] as const) {
      activeEngine.registerVisualPreset({
        id: `assets:${skin}:${dieType}`,
        dieType,
        geometryId: dieType,
        skinId: `procedural-${skin}`,
        soundPackId: 'classic-dice',
      });
    }
  }
}

function applyAssetSkin(activeEngine: Engine, skin: AssetSkin): void {
  for (const dieType of ['d6', 'd20'] as const) {
    activeEngine.setVisualPreset(
      dieType,
      skin === 'classic' ? getStandardVisualPresetId(dieType) : `assets:${skin}:${dieType}`,
    );
  }
}

async function enableAudio(): Promise<void> {
  try {
    if (audioContext === undefined) {
      audioContext = new AudioContext();
      audioPlayer = new WebAudioSpritePlayer(assetRegistry, { context: audioContext });
      await Promise.all([
        audioPlayer.preloadBank('classic-dice'),
        audioPlayer.preloadBank('classic-felt'),
        audioPlayer.preloadBank('classic-metal'),
        audioPlayer.preloadBank('classic-wood-table'),
        audioPlayer.preloadBank('classic-wood-tray'),
      ]);
    }
    await audioContext.resume();
    setStatus('Impact audio ready');
  } catch (error) {
    audio.checked = false;
    showError(error);
  }
}

async function runAssetCase(button: HTMLButtonElement): Promise<void> {
  const skin = toAssetSkin(button.dataset.assetSkin ?? 'classic');
  const source = button.dataset.notation;
  if (source === undefined) return;
  assets.value = skin;
  if (engine !== undefined) applyAssetSkin(engine, skin);
  if (button.dataset.audio === 'true') {
    audioSurface.value = toAudioSurface(button.dataset.audioSurface ?? 'wood-table');
    audio.checked = true;
    await enableAudio();
  }
  notation.value = source;
  await roll(source);
}

function toAudioSurface(value: string): AudioSurface {
  if (value === 'felt' || value === 'metal' || value === 'wood-tray') return value;
  return 'wood-table';
}

function toAudioSurfaceBank(value: string): string {
  return `classic-${toAudioSurface(value)}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
