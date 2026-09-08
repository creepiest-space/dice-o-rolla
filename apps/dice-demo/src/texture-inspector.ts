import { ThreeAssetMaterialProvider, type DiceAssetRegistry } from '@dice-o-rolla/dice-assets';
import { getDieGeometry, calculateFaceNormal } from '@dice-o-rolla/dice-geometry';
import { ThreeDiceMeshFactory, type ThreeDiceMesh } from '@dice-o-rolla/dice-renderer-three';
import {
  AmbientLight,
  Color,
  DirectionalLight,
  OrthographicCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function createTextureInspector(
  registry: DiceAssetRegistry,
  container: HTMLElement,
  image: HTMLImageElement,
  status: HTMLElement,
  faceSelect: HTMLSelectElement,
) {
  const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  container.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', 'Rotatable textured die');
  const scene = new Scene();
  scene.background = new Color('#e9eef4');
  scene.add(new AmbientLight('#ffffff', 2));
  const light = new DirectionalLight('#ffffff', 2);
  light.position.set(3, 4, 5);
  scene.add(light);
  const camera = new OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.1, 20);
  camera.position.set(0, 0, 4);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.minZoom = 0.6;
  controls.maxZoom = 2;
  const provider = new ThreeAssetMaterialProvider(registry, {
    renderer,
    transcoderPath: './assets/basis/',
  });
  const factory = new ThreeDiceMeshFactory(provider);
  let die: ThreeDiceMesh | undefined;
  let definition = getDieGeometry('d6');
  let skinId = 'diagnostic-d6';
  let generation = 0;
  let disposed = false;
  const draw = () => {
    if (!disposed) renderer.render(scene, camera);
  };
  const resize = () => {
    const width = Math.max(1, container.clientWidth),
      height = Math.max(1, container.clientHeight);
    const aspect = width / height;
    camera.left = -1.5 * Math.max(1, aspect);
    camera.right = -camera.left;
    camera.top = 1.5 * Math.max(1, 1 / aspect);
    camera.bottom = -camera.top;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    draw();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  controls.addEventListener('change', draw);
  function reset(): void {
    if (die === undefined) return;
    camera.position.set(0, 0, 4);
    camera.up.set(0, 1, 0);
    camera.zoom = 1.35;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.update();
    die.mesh.rotation.set(0.35, 0.55, 0.1);
    faceSelect.value = '';
    container.dataset.face = 'overview';
    draw();
  }
  function showFace(value: number): void {
    const face = definition.faces.find((candidate) => candidate.value === value);
    if (die === undefined || face === undefined) return;
    reset();
    const normal = calculateFaceNormal(definition, face);
    die.mesh.quaternion.setFromUnitVectors(new Vector3(...normal), new Vector3(0, 0, 1));
    // Orient the texture's V axis upwards, independently of the face's vertex order.
    const pattern = registry.patterns.get(registry.skins.get(skinId)!.patternId)!;
    const uv = pattern.unwrap!.faces[value]!;
    const origin = new Vector3(...definition.vertices[face.indices[0]!]!);
    const a = new Vector3(...definition.vertices[face.indices[1]!]!).sub(origin);
    const b = new Vector3(...definition.vertices[face.indices[2]!]!).sub(origin);
    const au = uv[1]![0] - uv[0]![0],
      av = uv[1]![1] - uv[0]![1];
    const bu = uv[2]![0] - uv[0]![0],
      bv = uv[2]![1] - uv[0]![1];
    const up = a
      .multiplyScalar(-bu)
      .add(b.multiplyScalar(au))
      .divideScalar(au * bv - av * bu)
      .applyQuaternion(die.mesh.quaternion);
    die.mesh.rotateOnWorldAxis(new Vector3(0, 0, 1), Math.PI / 2 - Math.atan2(up.y, up.x));
    faceSelect.value = String(value);
    container.dataset.face = String(value);
    draw();
  }
  async function select(type: string): Promise<void> {
    const current = ++generation;
    status.textContent = 'Loading texture…';
    faceSelect.disabled = true;
    image.removeAttribute('src');
    if (die !== undefined) {
      scene.remove(die.mesh);
      die.dispose();
      die = undefined;
      draw();
    }
    try {
      const selectedSkin = registry.skinSets.get('diagnostic')?.skins[type];
      if (selectedSkin === undefined) throw new Error(`Missing diagnostic skin: ${type}`);
      const pattern = registry.patterns.get(registry.skins.get(selectedSkin)!.patternId)!;
      const geometryId = pattern.unwrap?.geometryId;
      if (
        geometryId !== 'd4' &&
        geometryId !== 'd6' &&
        geometryId !== 'd8' &&
        geometryId !== 'd10' &&
        geometryId !== 'd12' &&
        geometryId !== 'd20'
      )
        throw new Error('Unsupported diagnostic geometry');
      await provider.prepareSkin(selectedSkin);
      if (disposed || current !== generation) return;
      definition = getDieGeometry(geometryId);
      skinId = selectedSkin;
      die = factory.create(definition, undefined, 1, undefined, {
        id: `inspect:${type}`,
        dieType: geometryId,
        geometryId,
        skinId,
      });
      scene.add(die.mesh);
      image.src = pattern.unwrap!.preview!.uri;
      image.alt = `${type} connected surface net`;
      faceSelect.replaceChildren(
        new Option('Overview', ''),
        ...definition.faces.map((face) => new Option(`Face ${face.value}`, String(face.value))),
      );
      faceSelect.disabled = false;
      reset();
      resize();
      status.textContent = `${type} texture ready`;
    } catch (error) {
      if (!disposed && current === generation)
        status.textContent = error instanceof Error ? error.message : String(error);
    }
  }
  return {
    select,
    reset,
    showFace,
    dispose(): void {
      disposed = true;
      generation++;
      observer.disconnect();
      controls.dispose();
      die?.dispose();
      provider.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      image.removeAttribute('src');
      faceSelect.disabled = true;
    },
  };
}
