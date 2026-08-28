import type { RendererTheme } from '@dice-o-rolla/dice-renderer';
import { CanvasTexture, MeshStandardMaterial, SRGBColorSpace } from 'three';

export type DiceMaterialStyle = RendererTheme['material'];
export type FaceLabel = string | number | readonly number[];

export interface FaceMaterialOptions {
  readonly labelScale?: number;
}

const ORIENTATION_DOT_LABELS = new Set(['6', '9', '60', '90']);

export class ThreeMaterialFactory {
  createFace(
    label: FaceLabel,
    theme: RendererTheme,
    options: FaceMaterialOptions = {},
  ): MeshStandardMaterial {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('A 2D canvas context is required for die labels');

    context.fillStyle = theme.bodyColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = theme.labelColor;
    const scalarLabel = typeof label === 'string' || typeof label === 'number';
    const labelScale = options.labelScale ?? 1;
    const fontSize = (scalarLabel && String(label).length >= 2 ? 100 : 128) * labelScale;
    context.font = `700 ${fontSize}px system-ui, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    if (scalarLabel) {
      const labelY = canvas.height / 2 + 8;
      context.fillText(String(label), canvas.width / 2, labelY);
      if (requiresOrientationDot(label)) {
        context.beginPath();
        context.arc(
          canvas.width / 2,
          labelY + fontSize * 0.55,
          canvas.width * 0.025,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
    } else {
      context.font = '700 58px system-ui, sans-serif';
      context.save();
      context.translate(canvas.width / 2, canvas.height / 2);
      for (const value of label) {
        context.fillText(String(value), 0, -canvas.height * 0.31);
        context.rotate((Math.PI * 2) / 3);
      }
      context.restore();
    }

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return new MeshStandardMaterial({
      color: 0xffffff,
      map: texture,
      metalness: theme.metalness,
      roughness: theme.roughness,
    });
  }
}

export function requiresOrientationDot(label: FaceLabel): boolean {
  if (typeof label !== 'string' && typeof label !== 'number') return false;
  return ORIENTATION_DOT_LABELS.has(String(label));
}
