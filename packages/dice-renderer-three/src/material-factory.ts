import type { RendererTheme } from '@creepiest-space/dice-renderer';
import { CanvasTexture, MeshStandardMaterial, SRGBColorSpace } from 'three';

export type DiceMaterialStyle = RendererTheme['material'];
export type FaceLabel = string | number | readonly number[];

export class ThreeMaterialFactory {
  createFace(label: FaceLabel, theme: RendererTheme): MeshStandardMaterial {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('A 2D canvas context is required for die labels');

    context.fillStyle = theme.bodyColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = theme.labelColor;
    const scalarLabel = typeof label === 'string' || typeof label === 'number';
    const fontSize = scalarLabel && String(label).length >= 2 ? 100 : 128;
    context.font = `700 ${fontSize}px system-ui, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    if (scalarLabel) {
      context.fillText(String(label), canvas.width / 2, canvas.height / 2 + 8);
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
