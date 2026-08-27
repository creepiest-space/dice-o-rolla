import type { RendererTheme } from '@creepiest-space/dice-renderer';
import { CanvasTexture, MeshStandardMaterial, SRGBColorSpace } from 'three';

export type DiceMaterialStyle = RendererTheme['material'];

export class ThreeMaterialFactory {
  createFace(value: number, theme: RendererTheme): MeshStandardMaterial {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('A 2D canvas context is required for die labels');

    context.fillStyle = theme.bodyColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = theme.labelColor;
    context.font = '700 128px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(String(value), canvas.width / 2, canvas.height / 2 + 8);

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
