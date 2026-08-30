import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const sourceRoot = join(import.meta.dir, '..', 'assets', 'source');
const size = 256;

await mkdir(join(sourceRoot, 'audio'), { recursive: true });
await mkdir(join(sourceRoot, 'textures'), { recursive: true });
await mkdir(join(sourceRoot, 'faces'), { recursive: true });

await Promise.all([
  writeWav('audio/resin-1.wav', 620, 13, 0.18),
  writeWav('audio/resin-2.wav', 710, 17, 0.18),
  writeWav('audio/wood-1.wav', 240, 29, 0.2),
  writeWav('audio/wood-2.wav', 285, 37, 0.2),
  writePng('textures/speckle-base.png', pixelBase),
  writePng('textures/speckle-normal.png', pixelNormal),
  writePng('textures/speckle-orm.png', pixelOrm),
  writeFile(join(sourceRoot, 'faces', 'digits.svg'), faceSvg()),
]);

console.log(`Generated original procedural masters in ${sourceRoot}`);

async function writeWav(
  relative: string,
  frequency: number,
  seed: number,
  duration: number,
): Promise<void> {
  const sampleRate = 48_000;
  const sampleCount = Math.floor(sampleRate * duration);
  const buffer = Buffer.alloc(44 + sampleCount * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + sampleCount * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(sampleCount * 2, 40);
  let noise = seed;
  for (let index = 0; index < sampleCount; index += 1) {
    noise = (noise * 16_807) % 2_147_483_647;
    const time = index / sampleRate;
    const envelope = Math.exp(-time * 30);
    const transient = ((noise / 2_147_483_647) * 2 - 1) * Math.exp(-time * 70);
    const tone = Math.sin(Math.PI * 2 * frequency * time) * 0.55;
    buffer.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, (tone + transient * 0.7) * envelope)) * 32_767),
      44 + index * 2,
    );
  }
  await writeFile(join(sourceRoot, relative), buffer);
}

type Pixel = readonly [number, number, number, number];

function pixelBase(x: number, y: number): Pixel {
  const grain = hash(x, y) % 36;
  const vein = Math.sin((x + Math.sin(y / 17) * 12) / 19) * 14;
  return [clamp(115 + grain + vein), clamp(83 + grain / 2 + vein), clamp(148 + grain / 3), 255];
}

function pixelNormal(x: number, y: number): Pixel {
  const dx = ((hash(x + 1, y) % 17) - (hash(x - 1, y) % 17)) * 0.7;
  const dy = ((hash(x, y + 1) % 17) - (hash(x, y - 1) % 17)) * 0.7;
  return [clamp(128 + dx), clamp(128 + dy), 250, 255];
}

function pixelOrm(x: number, y: number): Pixel {
  const roughness = 135 + (hash(x >> 2, y >> 2) % 45);
  return [255, roughness, 8, 255];
}

async function writePng(relative: string, pixel: (x: number, y: number) => Pixel): Promise<void> {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const value = pixel(x, y);
      const offset = row + 1 + x * 4;
      raw[offset] = value[0];
      raw[offset + 1] = value[1];
      raw[offset + 2] = value[2];
      raw[offset + 3] = value[3];
    }
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  await writeFile(
    join(sourceRoot, relative),
    Buffer.concat([
      signature,
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

function chunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type);
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  name.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return output;
}

function crc32(data: Buffer): number {
  let crc = 0xffff_ffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb8_8320 : 0);
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function hash(x: number, y: number): number {
  return Math.abs(Math.imul(x + 91, 73_856_093) ^ Math.imul(y + 47, 19_349_663));
}
function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function faceSvg(): string {
  const cells = Array.from({ length: 20 }, (_, index) => {
    const x = (index % 5) * 128;
    const y = Math.floor(index / 5) * 128;
    const label = index + 1;
    return `<text x="${x + 64}" y="${y + 82}" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="70" font-weight="700" fill="white">${label}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="512" viewBox="0 0 640 512"><rect width="640" height="512" fill="transparent"/>${cells}</svg>`;
}
