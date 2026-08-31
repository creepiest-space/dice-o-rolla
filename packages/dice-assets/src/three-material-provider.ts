import {
  type FaceMaterialContext,
  type FaceMaterialResource,
  ThreeMaterialFactory,
  type ThreeFaceMaterialProvider,
} from '@dice-o-rolla/dice-renderer-three';
import {
  Color,
  MeshPhysicalMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

import type { DiceAssetRegistry } from './asset-registry.js';
import type { DiceFaceRegion, DiceSkinDefinition, RuntimeTextureReference } from './types.js';

export interface ThreeAssetMaterialProviderOptions {
  readonly renderer: WebGLRenderer;
  readonly transcoderPath: string;
}

interface LoadedSkin {
  readonly skin: DiceSkinDefinition;
  readonly baseColor: Texture;
  readonly normal?: Texture;
  readonly orm?: Texture;
  readonly faces?: Texture;
}

/** KTX2-backed PBR adapter; lower-level renderer packages remain asset-schema agnostic. */
export class ThreeAssetMaterialProvider implements ThreeFaceMaterialProvider {
  readonly #loader: KTX2Loader;
  readonly #textures = new Map<string, Promise<Texture>>();
  readonly #skins = new Map<string, LoadedSkin>();
  readonly #fallback = new ThreeMaterialFactory();

  constructor(
    readonly registry: DiceAssetRegistry,
    options: ThreeAssetMaterialProviderOptions,
  ) {
    this.#loader = new KTX2Loader()
      .setTranscoderPath(options.transcoderPath)
      .detectSupport(options.renderer);
  }

  async prepareSkin(skinId: string): Promise<void> {
    if (this.#skins.has(skinId)) return;
    this.registry.validateReferences();
    const skin = this.registry.skins.get(skinId);
    if (skin === undefined) throw new Error(`Unknown skin: ${skinId}`);
    const pattern = this.registry.patterns.get(skin.patternId)!;
    const atlas =
      skin.faceAtlasId === undefined ? undefined : this.registry.faces.get(skin.faceAtlasId);
    const [baseColor, normal, orm, faces] = await Promise.all([
      this.#load(pattern.baseColor),
      pattern.normal === undefined ? undefined : this.#load(pattern.normal),
      pattern.orm === undefined ? undefined : this.#load(pattern.orm),
      atlas === undefined ? undefined : this.#load(atlas.texture),
    ]);
    baseColor.wrapS = baseColor.wrapT = RepeatWrapping;
    if (normal !== undefined) normal.wrapS = normal.wrapT = RepeatWrapping;
    if (orm !== undefined) orm.wrapS = orm.wrapT = RepeatWrapping;
    this.#skins.set(skinId, {
      skin,
      baseColor,
      ...(normal === undefined ? {} : { normal }),
      ...(orm === undefined ? {} : { orm }),
      ...(faces === undefined ? {} : { faces }),
    });
  }

  createFace(context: FaceMaterialContext): FaceMaterialResource {
    const skinId = context.preset?.skinId;
    const loaded = skinId === undefined ? undefined : this.#skins.get(skinId);
    if (skinId !== undefined && loaded === undefined) {
      throw new Error(`Skin "${skinId}" must be prepared before creating dice`);
    }
    if (loaded === undefined) return this.#createFallback(context);
    const definition = this.registry.materials.get(loaded.skin.materialId)!;
    const atlas =
      loaded.skin.faceAtlasId === undefined
        ? undefined
        : this.registry.faces.get(loaded.skin.faceAtlasId);
    const region = atlas?.faces[String(context.label)] ?? atlas?.faces[String(context.faceValue)];
    const material = new MeshPhysicalMaterial({
      color: loaded.skin.tint ?? '#ffffff',
      map: loaded.baseColor,
      normalMap: loaded.normal ?? null,
      aoMap: loaded.orm ?? null,
      roughnessMap: loaded.orm ?? null,
      metalnessMap: loaded.orm ?? null,
      roughness: definition.roughness,
      metalness: definition.metalness,
      clearcoat: definition.clearcoat ?? 0,
      clearcoatRoughness: definition.clearcoatRoughness ?? 0,
    });
    if (definition.normalScale !== undefined)
      material.normalScale.setScalar(definition.normalScale);
    if (loaded.faces !== undefined && region !== undefined && atlas !== undefined) {
      configureCompositingShader(
        material,
        loaded.faces,
        region,
        atlas.width,
        atlas.height,
        loaded.skin,
      );
    }
    return {
      material,
      dispose(): void {
        material.dispose();
      },
    };
  }

  dispose(): void {
    for (const pending of this.#textures.values())
      void pending.then((texture) => texture.dispose());
    this.#textures.clear();
    this.#skins.clear();
    this.#loader.dispose();
  }

  #load(reference: RuntimeTextureReference): Promise<Texture> {
    const existing = this.#textures.get(reference.uri);
    if (existing !== undefined) return existing;
    const pending = this.#loader.loadAsync(reference.uri).then((texture) => {
      texture.colorSpace = reference.colorSpace === 'srgb' ? SRGBColorSpace : '';
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
      return texture;
    });
    this.#textures.set(reference.uri, pending);
    return pending;
  }

  #createFallback(context: FaceMaterialContext): FaceMaterialResource {
    const material = this.#fallback.createFace(
      context.label,
      context.theme,
      context.labelScale === undefined ? {} : { labelScale: context.labelScale },
    );
    return {
      material,
      dispose(): void {
        material.map?.dispose();
        material.dispose();
      },
    };
  }
}

function configureCompositingShader(
  material: MeshPhysicalMaterial,
  atlas: Texture,
  region: DiceFaceRegion,
  width: number,
  height: number,
  skin: DiceSkinDefinition,
): void {
  const labelColor = new Color(skin.labelColor ?? '#111111');
  material.onBeforeCompile = (shader) => {
    shader.uniforms.faceAtlas = { value: atlas };
    shader.uniforms.faceRect = {
      value: [region.x / width, region.y / height, region.width / width, region.height / height],
    };
    shader.uniforms.labelColor = { value: labelColor };
    shader.uniforms.skinHue = { value: skin.hueRotation ?? 0 };
    shader.uniforms.skinSaturation = { value: skin.saturation ?? 1 };
    shader.uniforms.patternScale = { value: skin.patternScale ?? [1, 1] };
    shader.uniforms.compositeMode = {
      value: skin.composite === 'overlay' ? 2 : skin.composite === 'multiply' ? 1 : 0,
    };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <map_pars_fragment>',
        `#include <map_pars_fragment>\nuniform sampler2D faceAtlas;\nuniform vec4 faceRect;\nuniform vec3 labelColor;\nuniform float skinHue;\nuniform float skinSaturation;\nuniform vec2 patternScale;\nuniform int compositeMode;`,
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP\nvec4 skinPattern = texture2D(map, fract(vMapUv * patternScale));\nvec3 skinTint = diffuseColor.rgb;\nif (compositeMode == 0) diffuseColor.rgb = mix(skinTint, skinPattern.rgb, skinPattern.a);\nelse if (compositeMode == 1) diffuseColor.rgb = skinTint * skinPattern.rgb;\nelse { vec3 low = 2.0 * skinTint * skinPattern.rgb; vec3 high = 1.0 - 2.0 * (1.0 - skinTint) * (1.0 - skinPattern.rgb); diffuseColor.rgb = mix(low, high, step(vec3(0.5), skinTint)); }\ndiffuseColor.a *= skinPattern.a;\n#endif\nvec3 skinGray = vec3(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)));\ndiffuseColor.rgb = mix(skinGray, diffuseColor.rgb, skinSaturation);\nfloat skinAngle = skinHue * 6.28318530718;\nvec3 skinAxis = normalize(vec3(1.0));\ndiffuseColor.rgb = diffuseColor.rgb * cos(skinAngle) + cross(skinAxis, diffuseColor.rgb) * sin(skinAngle) + skinAxis * dot(skinAxis, diffuseColor.rgb) * (1.0 - cos(skinAngle));\nvec2 faceUv = faceRect.xy + vMapUv * faceRect.zw;\nfloat faceMask = texture2D(faceAtlas, faceUv).a;\ndiffuseColor.rgb = mix(diffuseColor.rgb, labelColor, faceMask);`,
      );
  };
  material.customProgramCacheKey = () => `dice-skin:${skin.id}`;
}
