export type VisualPresetMetadataValue = string | number | boolean;

export interface VisualPresetDescriptor {
  readonly id: string;
  readonly dieType: string;
  readonly geometryId: string;
  readonly scale?: number;
  readonly skinId?: string;
  readonly soundPackId?: string;
  readonly faceLabels?: Readonly<Record<number, string | number>>;
  readonly valueMap?: Readonly<Record<number, number>>;
  readonly metadata?: Readonly<Record<string, VisualPresetMetadataValue>>;
}

export interface RegisterVisualPresetOptions {
  readonly replace?: boolean;
}

const PRESET_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/i;

function assertIdentifier(value: string, name: string): void {
  if (!PRESET_ID_PATTERN.test(value)) {
    throw new RangeError(`${name} must be a non-empty portable identifier`);
  }
}

function cloneNumericRecord<T extends string | number>(
  source: Readonly<Record<number, T>> | undefined,
  name: string,
): Readonly<Record<number, T>> | undefined {
  if (source === undefined) return undefined;
  const copy: Record<number, T> = {};
  for (const [rawKey, value] of Object.entries(source)) {
    const key = Number(rawKey);
    if (!Number.isSafeInteger(key) || key <= 0) {
      throw new RangeError(`${name} keys must be positive safe integers`);
    }
    if (typeof value === 'number' && !Number.isSafeInteger(value)) {
      throw new RangeError(`${name} numeric values must be safe integers`);
    }
    copy[key] = value;
  }
  return Object.freeze(copy);
}

function cloneMetadata(
  source: Readonly<Record<string, VisualPresetMetadataValue>> | undefined,
): Readonly<Record<string, VisualPresetMetadataValue>> | undefined {
  if (source === undefined) return undefined;
  const copy: Record<string, VisualPresetMetadataValue> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key.length === 0) throw new RangeError('metadata keys must not be empty');
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new RangeError('metadata numeric values must be finite');
    }
    copy[key] = value;
  }
  return Object.freeze(copy);
}

export function createVisualPresetDescriptor(
  source: VisualPresetDescriptor,
): VisualPresetDescriptor {
  assertIdentifier(source.id, 'id');
  assertIdentifier(source.dieType, 'dieType');
  assertIdentifier(source.geometryId, 'geometryId');
  if (source.skinId !== undefined) assertIdentifier(source.skinId, 'skinId');
  if (source.soundPackId !== undefined) assertIdentifier(source.soundPackId, 'soundPackId');
  const scale = source.scale ?? 1;
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new RangeError('scale must be a positive finite number');
  }
  const faceLabels = cloneNumericRecord(source.faceLabels, 'faceLabels');
  const valueMap = cloneNumericRecord(source.valueMap, 'valueMap');
  const metadata = cloneMetadata(source.metadata);
  return Object.freeze({
    id: source.id,
    dieType: source.dieType,
    geometryId: source.geometryId,
    scale,
    ...(source.skinId === undefined ? {} : { skinId: source.skinId }),
    ...(source.soundPackId === undefined ? {} : { soundPackId: source.soundPackId }),
    ...(faceLabels === undefined ? {} : { faceLabels }),
    ...(valueMap === undefined ? {} : { valueMap }),
    ...(metadata === undefined ? {} : { metadata }),
  });
}

export class VisualPresetRegistry {
  readonly #presets = new Map<string, VisualPresetDescriptor>();
  #revision = 0;

  constructor(presets: readonly VisualPresetDescriptor[] = []) {
    for (const preset of presets) this.register(preset);
  }

  get revision(): number {
    return this.#revision;
  }

  register(
    source: VisualPresetDescriptor,
    options: RegisterVisualPresetOptions = {},
  ): VisualPresetDescriptor {
    const preset = createVisualPresetDescriptor(source);
    if (this.#presets.has(preset.id) && options.replace !== true) {
      throw new Error(`Visual preset "${preset.id}" is already registered`);
    }
    this.#presets.set(preset.id, preset);
    this.#revision += 1;
    return preset;
  }

  unregister(id: string): VisualPresetDescriptor | undefined {
    const preset = this.#presets.get(id);
    if (preset === undefined) return undefined;
    this.#presets.delete(id);
    this.#revision += 1;
    return preset;
  }

  get(id: string): VisualPresetDescriptor | undefined {
    return this.#presets.get(id);
  }

  has(id: string): boolean {
    return this.#presets.has(id);
  }

  list(): readonly VisualPresetDescriptor[] {
    return Object.freeze(Array.from(this.#presets.values()));
  }
}
