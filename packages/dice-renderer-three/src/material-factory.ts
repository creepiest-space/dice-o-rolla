import { CanvasTexture, MeshStandardMaterial, SRGBColorSpace } from 'three';

export type DiceMaterialStyle = 'plastic' | 'matte';

export class ThreeMaterialFactory {
  createFace(value: number, style: DiceMaterialStyle): MeshStandardMaterial {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('A 2D canvas context is required for die labels');

    context.fillStyle = style === 'plastic' ? '#f7f3e8' : '#282c34';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = style === 'plastic' ? '#181818' : '#f5f5f5';
    context.font = '700 128px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(String(value), canvas.width / 2, canvas.height / 2 + 8);

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return new MeshStandardMaterial({
      color: 0xffffff,
      map: texture,
      metalness: 0,
      roughness: style === 'plastic' ? 0.28 : 0.82,
    });
  }
}
