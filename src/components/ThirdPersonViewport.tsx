import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  AnimationName,
  ControllerParams,
  CSGBoxConfig,
  FSMState,
  GridTextureColor,
  InputDeviceMode,
  PlayerTelemetry,
} from '../types/controller';
import { lerpAngle, moveAndSlide, moveToward, prdNoise } from '../utils/physics';
import { audioManager } from '../utils/audioManager';
import { TouchInputState } from './MobileTouchControls';

interface ThirdPersonViewportProps {
  params: ControllerParams;
  boxes: CSGBoxConfig[];
  activeInputDevice: InputDeviceMode;
  onInputDeviceDetected: (device: InputDeviceMode, gamepadName?: string | null) => void;
  onTelemetryUpdate: (telemetry: PlayerTelemetry) => void;
  onPointerLockChange: (locked: boolean) => void;
  resetSignal: number;
  requestedActionAnimation: { name: AnimationName; timestamp: number } | null;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  touchInputRef: React.MutableRefObject<TouchInputState>;
  cameraDeltaSignal: { dx: number; dy: number; timestamp: number } | null;
}

function createFallbackGridTexture(colorHex: string, lineHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = colorHex;
  ctx.fillRect(0, 0, 512, 512);

  ctx.strokeStyle = lineHex;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 508, 508);

  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1.5;
  for (let i = 128; i < 512; i += 128) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * PRD v2.0 Section 4.3.4 Gamepad Vendor Fallback Detection
 */
function resolveGamepadMapping(
  id: string,
  warnedSet: Set<string>
): { label: string; jumpIdx: number; downIdx: number; kickIdx: number } {
  const lower = id.toLowerCase();
  if (lower.includes('xbox') || lower.includes('xinput') || lower.includes('standard')) {
    return { label: 'Xbox / Standard', jumpIdx: 0, downIdx: 1, kickIdx: 2 };
  }
  if (
    lower.includes('054c') ||
    lower.includes('dualsense') ||
    lower.includes('dualshock') ||
    lower.includes('sony')
  ) {
    return { label: 'Sony (054c)', jumpIdx: 0, downIdx: 1, kickIdx: 2 };
  }
  if (lower.includes('nintendo') || lower.includes('switch') || lower.includes('057e')) {
    return { label: 'Nintendo (A↔B Swap)', jumpIdx: 1, downIdx: 0, kickIdx: 2 };
  }
  if (!warnedSet.has(id)) {
    warnedSet.add(id);
    console.warn(`[Gamepad] Unknown controller ID "${id}" — using Standard fallback mapping.`);
  }
  return { label: 'Generic Fallback', jumpIdx: 0, downIdx: 1, kickIdx: 2 };
}

interface DustParticle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  maxAge: number;
}

interface WindParticle {
  mesh: THREE.Mesh;
  kind: 'leaf' | 'mote';
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  speedMult: number;
  phase: number;
  rotSpeedX: number;
  rotSpeedY: number;
  rotSpeedZ: number;
  flutterAmp: number;
}

const MAX_WIND_PARTICLES = 360;
const WIND_BOX_HALF_XZ = 18;
const WIND_BOX_HEIGHT = 9.5;

export const ThirdPersonViewport: React.FC<ThirdPersonViewportProps> = ({
  params,
  boxes,
  activeInputDevice,
  onInputDeviceDetected,
  onTelemetryUpdate,
  onPointerLockChange,
  resetSignal,
  requestedActionAnimation,
  canvasContainerRef,
  touchInputRef,
  cameraDeltaSignal,
}) => {
  const [webglLost, setWebglLost] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);

  const paramsRef = useRef<ControllerParams>(params);
  paramsRef.current = params;

  const boxesRef = useRef<CSGBoxConfig[]>(boxes);
  boxesRef.current = boxes;

  const activeInputDeviceRef = useRef<InputDeviceMode>(activeInputDevice);
  activeInputDeviceRef.current = activeInputDevice;

  const inputDetectedCallbackRef = useRef(onInputDeviceDetected);
  inputDetectedCallbackRef.current = onInputDeviceDetected;

  const telemetryCallbackRef = useRef(onTelemetryUpdate);
  telemetryCallbackRef.current = onTelemetryUpdate;

  const pointerLockCallbackRef = useRef(onPointerLockChange);
  pointerLockCallbackRef.current = onPointerLockChange;

  const sceneRef = useRef<THREE.Scene | null>(null);
  const boxMeshesGroupRef = useRef<THREE.Group | null>(null);
  const texturesMapRef = useRef<Record<GridTextureColor, THREE.Texture> | null>(null);
  const debugGroupRef = useRef<THREE.Group | null>(null);
  const mixamoGroupRef = useRef<THREE.Group | null>(null);
  const capsuleV2GroupRef = useRef<THREE.Group | null>(null);
  const cameraMountRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const camBoomLineRef = useRef<THREE.Line | null>(null);
  const bloomPassRef = useRef<UnrealBloomPass | null>(null);
  const updateSunRef = useRef<((elevationDeg: number) => void) | null>(null);

  const playerStateRef = useRef({
    position: [0, 0, 0] as [number, number, number],
    velocity: [0, 0, 0] as [number, number, number],
    playerRotY: 0,
    visualsRotY: 0,
    cameraPitchX: 0,
    isOnFloor: true,
    wasOnFloor: true,
    isRunning: false,
    currentAnimation: 'idle' as AnimationName,
    fsmState: 'idle' as FSMState,
    oneShotUntil: 0,
    activeFloorName: 'map/floor',
    currentFov: 70,
    prevAnimNormalizedTime: 0,
    fallbackStepPhase: 0,
    cameraShakeTrauma: 0,
    lastWallImpactTime: 0,
    gamepadName: null as string | null,
    gamepadMappingType: 'Standard',
  });

  const playAnimationRef = useRef<((name: AnimationName, oneShot?: boolean) => void) | null>(null);

  // Sync audio manager settings
  useEffect(() => {
    audioManager.setMuted(params.audioMuted);
    audioManager.setVolume(params.audioVolume);
  }, [params.audioMuted, params.audioVolume]);

  // Apply external touch camera delta signals
  useEffect(() => {
    if (!cameraDeltaSignal) return;
    const p = paramsRef.current;
    const st = playerStateRef.current;
    const deltaYaw = cameraDeltaSignal.dx * p.horizontalMouseSensitivity;
    const deltaPitch = cameraDeltaSignal.dy * p.verticalMouseSensitivity;

    st.playerRotY -= deltaYaw;
    st.visualsRotY += deltaYaw;

    const minPitch = THREE.MathUtils.degToRad(p.cameraClampMinDeg);
    const maxPitch = THREE.MathUtils.degToRad(p.cameraClampMaxDeg);
    st.cameraPitchX = THREE.MathUtils.clamp(st.cameraPitchX - deltaPitch, minPitch, maxPitch);
  }, [cameraDeltaSignal]);

  // Handle Reset Player signal
  useEffect(() => {
    if (resetSignal === 0) return;
    const st = playerStateRef.current;
    st.position = [0, 0, 0];
    st.velocity = [0, 0, 0];
    st.playerRotY = 0;
    st.visualsRotY = 0;
    st.cameraPitchX = 0;
    st.isOnFloor = true;
    st.oneShotUntil = 0;
    st.cameraShakeTrauma = 0;
    if (playAnimationRef.current) {
      playAnimationRef.current('idle', false);
    }
  }, [resetSignal]);

  // Handle requested action animation from UI buttons
  useEffect(() => {
    if (!requestedActionAnimation || !playAnimationRef.current) return;
    const isOneShot =
      requestedActionAnimation.name === 'kick' ||
      requestedActionAnimation.name === 'knock_down' ||
      requestedActionAnimation.name === 'get_up';
    playAnimationRef.current(requestedActionAnimation.name, isOneShot);
  }, [requestedActionAnimation]);

  // Dynamic character mesh mode, camera mount, bloom, and sun updates (No Fog)
  useEffect(() => {
    if (mixamoGroupRef.current && capsuleV2GroupRef.current) {
      const useCapsule = params.characterModelMode === 'capsule_v2';
      mixamoGroupRef.current.visible = !useCapsule;
      capsuleV2GroupRef.current.visible = useCapsule;
    }
    if (cameraMountRef.current) {
      cameraMountRef.current.position.set(0, params.cameraMountY, 0);
    }
    if (camBoomLineRef.current) {
      const posAttr = camBoomLineRef.current.geometry.getAttribute(
        'position'
      ) as THREE.BufferAttribute;
      posAttr.setXYZ(1, params.cameraOffsetX, params.cameraOffsetY, params.cameraOffsetZ);
      posAttr.needsUpdate = true;
    }
    if (debugGroupRef.current) {
      debugGroupRef.current.visible = params.showCollisionDebug;
    }
    if (bloomPassRef.current) {
      bloomPassRef.current.strength = params.bloomStrength;
    }
    if (updateSunRef.current) {
      updateSunRef.current(params.sunElevationDeg);
    }
  }, [
    params.characterModelMode,
    params.cameraMountY,
    params.cameraOffsetX,
    params.cameraOffsetY,
    params.cameraOffsetZ,
    params.showCollisionDebug,
    params.bloomStrength,
    params.sunElevationDeg,
  ]);

  // Rebuild OBB / CSGBox3D meshes whenever `boxes` array changes
  useEffect(() => {
    const group = boxMeshesGroupRef.current;
    const texMap = texturesMapRef.current;
    if (!group || !texMap) return;

    while (group.children.length > 0) {
      const child = group.children[0] as THREE.Mesh;
      group.remove(child);
      if (child.geometry) child.geometry.dispose();
    }

    for (const box of boxes) {
      const geom = new THREE.BoxGeometry(box.size[0], box.size[1], box.size[2]);
      const uvAttr = geom.getAttribute('uv') as THREE.BufferAttribute;
      const normAttr = geom.getAttribute('normal') as THREE.BufferAttribute;
      const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;

      for (let i = 0; i < uvAttr.count; i++) {
        const nx = Math.abs(normAttr.getX(i));
        const ny = Math.abs(normAttr.getY(i));
        const px = posAttr.getX(i) + box.size[0] * 0.5;
        const py = posAttr.getY(i) + box.size[1] * 0.5;
        const pz = posAttr.getZ(i) + box.size[2] * 0.5;

        if (ny > 0.5) {
          uvAttr.setXY(i, px, pz);
        } else if (nx > 0.5) {
          uvAttr.setXY(i, pz, py);
        } else {
          uvAttr.setXY(i, px, py);
        }
      }
      uvAttr.needsUpdate = true;

      const mat = new THREE.MeshStandardMaterial({
        map: texMap[box.color] || texMap.Orange,
        roughness: 0.65,
        metalness: 0.08,
      });

      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(box.position[0], box.position[1], box.position[2]);
      mesh.rotation.y = box.rotationY;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }, [boxes]);

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    // 1. Scene Setup — Explicitly NO FOG (`scene.fog = null`)
    const scene = new THREE.Scene();
    scene.fog = null;
    sceneRef.current = scene;

    // 2. Renderer setup
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.85;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Image-Based Lighting (IBL) via PMREMGenerator + RoomEnvironment
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    scene.environmentIntensity = 0.5;

    // Preetham Physical Sky Shader
    const sky = new Sky();
    sky.scale.setScalar(45000);
    scene.add(sky);
    const skyUniforms = sky.material.uniforms;
    skyUniforms['turbidity'].value = 8.0;
    skyUniforms['rayleigh'].value = 2.4;
    skyUniforms['mieCoefficient'].value = 0.006;
    skyUniforms['mieDirectionalG'].value = 0.78;

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setWebglLost(true);
    };
    const handleContextRestored = () => {
      setWebglLost(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    // 3. Directional Sun + Hemisphere Fill Light
    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x334155, 0.65);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfffbeb, 2.2);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 90;
    const d = 22;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    const sunVec = new THREE.Vector3();
    const updateSunPosition = (elevationDeg: number) => {
      const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
      const theta = THREE.MathUtils.degToRad(150);
      sunVec.setFromSphericalCoords(1, phi, theta);
      skyUniforms['sunPosition'].value.copy(sunVec);
    };
    updateSunRef.current = updateSunPosition;
    updateSunPosition(paramsRef.current.sunElevationDeg);

    // 4. Procedural Grid + Asset Textures
    const texLoader = new THREE.TextureLoader();
    const darkTex = createFallbackGridTexture('#1e2229', '#384152');
    const orangeTex = createFallbackGridTexture('#d97a2e', '#fdba74');
    const redTex = createFallbackGridTexture('#b23636', '#fca5a5');
    const greenTex = createFallbackGridTexture('#3f7a3f', '#86efac');

    const configureGridTexture = (tex: THREE.Texture, repeatX = 1, repeatY = 1) => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeatX, repeatY);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      tex.needsUpdate = true;
    };

    const texMap: Record<GridTextureColor, THREE.Texture> = {
      Dark: darkTex,
      Orange: orangeTex,
      Red: redTex,
      Green: greenTex,
    };
    texturesMapRef.current = texMap;

    const floorMat = new THREE.MeshStandardMaterial({
      map: darkTex,
      roughness: 0.94,
      metalness: 0.05,
    });

    texLoader.load('/assets/textures/grids/Dark/texture_05.png', (loaded) => {
      configureGridTexture(loaded, 500, 500);
      floorMat.map = loaded;
      floorMat.needsUpdate = true;

      const boxDark = loaded.clone();
      configureGridTexture(boxDark, 1, 1);
      texMap.Dark = boxDark;
      boxMeshesGroup.children.forEach((c, idx) => {
        if (boxesRef.current[idx]?.color === 'Dark') {
          ((c as THREE.Mesh).material as THREE.MeshStandardMaterial).map = boxDark;
          ((c as THREE.Mesh).material as THREE.MeshStandardMaterial).needsUpdate = true;
        }
      });
    });

    texLoader.load('/assets/textures/grids/Orange/texture_09.png', (loaded) => {
      configureGridTexture(loaded, 1, 1);
      texMap.Orange = loaded;
      boxMeshesGroup.children.forEach((c, idx) => {
        if (boxesRef.current[idx]?.color === 'Orange') {
          ((c as THREE.Mesh).material as THREE.MeshStandardMaterial).map = loaded;
          ((c as THREE.Mesh).material as THREE.MeshStandardMaterial).needsUpdate = true;
        }
      });
    });

    texLoader.load('/assets/textures/grids/Red/texture_09.png', (loaded) => {
      configureGridTexture(loaded, 1, 1);
      texMap.Red = loaded;
      boxMeshesGroup.children.forEach((c, idx) => {
        if (boxesRef.current[idx]?.color === 'Red') {
          ((c as THREE.Mesh).material as THREE.MeshStandardMaterial).map = loaded;
          ((c as THREE.Mesh).material as THREE.MeshStandardMaterial).needsUpdate = true;
        }
      });
    });

    texLoader.load('/assets/textures/grids/Green/texture_09.png', (loaded) => {
      configureGridTexture(loaded, 1, 1);
      texMap.Green = loaded;
      boxMeshesGroup.children.forEach((c, idx) => {
        if (boxesRef.current[idx]?.color === 'Green') {
          ((c as THREE.Mesh).material as THREE.MeshStandardMaterial).map = loaded;
          ((c as THREE.Mesh).material as THREE.MeshStandardMaterial).needsUpdate = true;
        }
      });
    });

    // 5. Create map/floor (r = 500m, crystal clear without fog)
    const floorRadius = 500;
    const floorGeom = new THREE.CylinderGeometry(floorRadius, floorRadius, 1, 96);
    const fPos = floorGeom.getAttribute('position') as THREE.BufferAttribute;
    const fUv = floorGeom.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < fUv.count; i++) {
      const vx = fPos.getX(i);
      const vz = fPos.getZ(i);
      fUv.setXY(i, (vx + floorRadius) / (floorRadius * 2), (vz + floorRadius) / (floorRadius * 2));
    }
    fUv.needsUpdate = true;

    configureGridTexture(darkTex, 500, 500);
    const floorMesh = new THREE.Mesh(floorGeom, floorMat);
    floorMesh.position.set(0, -0.5, 0);
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const boxMeshesGroup = new THREE.Group();
    boxMeshesGroupRef.current = boxMeshesGroup;
    scene.add(boxMeshesGroup);

    for (const box of boxesRef.current) {
      const geom = new THREE.BoxGeometry(box.size[0], box.size[1], box.size[2]);
      const uvAttr = geom.getAttribute('uv') as THREE.BufferAttribute;
      const normAttr = geom.getAttribute('normal') as THREE.BufferAttribute;
      const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < uvAttr.count; i++) {
        const nx = Math.abs(normAttr.getX(i));
        const ny = Math.abs(normAttr.getY(i));
        const px = posAttr.getX(i) + box.size[0] * 0.5;
        const py = posAttr.getY(i) + box.size[1] * 0.5;
        const pz = posAttr.getZ(i) + box.size[2] * 0.5;
        if (ny > 0.5) uvAttr.setXY(i, px, pz);
        else if (nx > 0.5) uvAttr.setXY(i, pz, py);
        else uvAttr.setXY(i, px, py);
      }
      uvAttr.needsUpdate = true;

      const mat = new THREE.MeshStandardMaterial({
        map: texMap[box.color] || texMap.Orange,
        roughness: 0.65,
        metalness: 0.08,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(box.position[0], box.position[1], box.position[2]);
      mesh.rotation.y = box.rotationY;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      boxMeshesGroup.add(mesh);
    }

    // 5B. Global Wind Particle System (Subtle Dust Motes & Tumbling Leaves)
    const windGroup = new THREE.Group();
    windGroup.name = 'global_wind_particles';
    scene.add(windGroup);

    // Leaf geometry: diamond/leaf silhouette with slight curvature
    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, -0.075);
    leafShape.quadraticCurveTo(0.045, 0, 0, 0.075);
    leafShape.quadraticCurveTo(-0.045, 0, 0, -0.075);
    const leafGeom = new THREE.ShapeGeometry(leafShape, 4);

    // Dust mote geometry: small soft sunlit sphere
    const moteGeom = new THREE.SphereGeometry(0.022, 6, 6);

    const leafMaterials = [
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        roughness: 0.6,
        side: THREE.DoubleSide,
      }),
      new THREE.MeshStandardMaterial({
        color: 0xea580c,
        roughness: 0.65,
        side: THREE.DoubleSide,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x4ade80,
        roughness: 0.6,
        side: THREE.DoubleSide,
      }),
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        roughness: 0.55,
        side: THREE.DoubleSide,
      }),
    ];

    const moteMaterial = new THREE.MeshBasicMaterial({
      color: 0xfef3c7,
      transparent: true,
      opacity: 0.68,
    });

    const windParticles: WindParticle[] = [];
    for (let i = 0; i < MAX_WIND_PARTICLES; i++) {
      const isLeaf = i % 2 === 0;
      const mesh = isLeaf
        ? new THREE.Mesh(leafGeom, leafMaterials[i % leafMaterials.length])
        : new THREE.Mesh(moteGeom, moteMaterial);

      const scale = isLeaf ? 0.75 + Math.random() * 0.7 : 0.7 + Math.random() * 0.85;
      mesh.scale.setScalar(scale);

      const offsetX = (Math.random() * 2 - 1) * WIND_BOX_HALF_XZ;
      const offsetY = 0.25 + Math.random() * WIND_BOX_HEIGHT;
      const offsetZ = (Math.random() * 2 - 1) * WIND_BOX_HALF_XZ;

      mesh.position.set(offsetX, offsetY, offsetZ);
      mesh.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );

      windGroup.add(mesh);
      windParticles.push({
        mesh,
        kind: isLeaf ? 'leaf' : 'mote',
        offsetX,
        offsetY,
        offsetZ,
        speedMult: 0.65 + Math.random() * 0.75,
        phase: Math.random() * Math.PI * 2,
        rotSpeedX: (Math.random() - 0.5) * 4.5,
        rotSpeedY: (Math.random() - 0.5) * 4.5,
        rotSpeedZ: (Math.random() - 0.5) * 3.8,
        flutterAmp: isLeaf ? 0.35 + Math.random() * 0.45 : 0.12 + Math.random() * 0.18,
      });
    }

    // 6. Build Player Node Hierarchy (PRD v2.0 Section 3.2 & v2.1 GLB)
    const playerGroup = new THREE.Group();
    playerGroup.name = 'player';
    scene.add(playerGroup);

    const footRingGroup = new THREE.Group();
    footRingGroup.position.set(0, 0.015, 0);
    playerGroup.add(footRingGroup);

    const ringGeom = new THREE.RingGeometry(0.28, 0.33, 32);
    ringGeom.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    });
    const footRingMesh = new THREE.Mesh(ringGeom, ringMat);
    footRingGroup.add(footRingMesh);

    const visualsGroup = new THREE.Group();
    visualsGroup.name = 'visuals';
    playerGroup.add(visualsGroup);

    const dirChevronGeom = new THREE.ConeGeometry(0.08, 0.18, 3);
    dirChevronGeom.rotateX(-Math.PI / 2);
    const dirChevronMesh = new THREE.Mesh(
      dirChevronGeom,
      new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.85 })
    );
    dirChevronMesh.position.set(0, 0.02, -0.44);
    visualsGroup.add(dirChevronMesh);

    // 6A. PRD v2.0 Capsule Placeholder Hierarchy (body #d54d43 + head #f0c9a0 + nose #55201a)
    const capsuleV2Group = new THREE.Group();
    capsuleV2Group.name = 'capsule_v2';
    capsuleV2Group.rotation.y = Math.PI;
    capsuleV2Group.visible = paramsRef.current.characterModelMode === 'capsule_v2';
    visualsGroup.add(capsuleV2Group);
    capsuleV2GroupRef.current = capsuleV2Group;

    const capBodyMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#d54d43'),
      roughness: 0.75,
      metalness: 0.05,
    });
    const capHeadMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#f0c9a0'),
      roughness: 0.65,
      metalness: 0.05,
    });
    const capNoseMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#55201a'),
      roughness: 0.8,
      metalness: 0.4,
    });

    const capBodyMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.85, 8, 16), capBodyMat);
    capBodyMesh.position.set(0, 0.85, 0);
    capBodyMesh.castShadow = true;
    capBodyMesh.receiveShadow = true;

    const capHeadMesh = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 16), capHeadMat);
    capHeadMesh.position.set(0, 1.58, 0);
    capHeadMesh.castShadow = true;

    const capNoseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.18), capNoseMat);
    capNoseMesh.position.set(0, 1.58, 0.16);
    capNoseMesh.castShadow = true;

    capsuleV2Group.add(capBodyMesh, capHeadMesh, capNoseMesh);

    // 6B. PRD v2.1 Mixamo GLB Hierarchy (`assets/models/mixamo_base.glb`)
    const mixamoBaseGroup = new THREE.Group();
    mixamoBaseGroup.name = 'mixamo_base';
    mixamoBaseGroup.rotation.y = Math.PI;
    mixamoBaseGroup.visible = paramsRef.current.characterModelMode === 'mixamo_glb';
    visualsGroup.add(mixamoBaseGroup);
    mixamoGroupRef.current = mixamoBaseGroup;

    const fallbackMannequin = new THREE.Group();
    const fBody = capBodyMesh.clone();
    const fHead = capHeadMesh.clone();
    const fNose = capNoseMesh.clone();
    fallbackMannequin.add(fBody, fHead, fNose);
    mixamoBaseGroup.add(fallbackMannequin);

    let mixer: THREE.AnimationMixer | null = null;
    const actionsMap: Partial<Record<AnimationName, THREE.AnimationAction>> = {};
    let activeAction: THREE.AnimationAction | null = null;

    const playAnimation = (name: AnimationName, oneShot = false) => {
      const nextAction = actionsMap[name];
      playerStateRef.current.currentAnimation = name;
      if (!nextAction) return;

      if (oneShot) {
        const clipDuration = nextAction.getClip().duration;
        playerStateRef.current.oneShotUntil = performance.now() + clipDuration * 1000;
      }

      if (activeAction === nextAction && activeAction.isRunning()) return;

      nextAction.reset();
      if (oneShot) {
        nextAction.setLoop(THREE.LoopOnce, 1);
        nextAction.clampWhenFinished = true;
      } else {
        nextAction.setLoop(THREE.LoopRepeat, Infinity);
        nextAction.clampWhenFinished = false;
      }

      nextAction.play();
      if (activeAction && activeAction !== nextAction) {
        activeAction.crossFadeTo(nextAction, paramsRef.current.animationBlendTime, true);
      }
      activeAction = nextAction;
      playerStateRef.current.prevAnimNormalizedTime = 0;
    };
    playAnimationRef.current = playAnimation;

    const gltfLoader = new GLTFLoader();
    gltfLoader.load(
      '/assets/models/mixamo_base.glb',
      (gltf) => {
        mixamoBaseGroup.remove(fallbackMannequin);
        const model = gltf.scene;
        model.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });
        mixamoBaseGroup.add(model);

        mixer = new THREE.AnimationMixer(model);
        for (const clip of gltf.animations) {
          const clipName = clip.name as AnimationName;
          const action = mixer.clipAction(clip);
          actionsMap[clipName] = action;
        }

        playAnimation(playerStateRef.current.currentAnimation, false);
        setModelLoaded(true);
      },
      undefined,
      () => {
        setModelLoaded(true);
      }
    );

    // Camera Mount & Camera3D
    const cameraMount = new THREE.Group();
    cameraMount.name = 'camera_mount';
    cameraMount.position.set(0, paramsRef.current.cameraMountY, 0);
    playerGroup.add(cameraMount);
    cameraMountRef.current = cameraMount;

    const camera = new THREE.PerspectiveCamera(
      70,
      container.clientWidth / container.clientHeight,
      0.05,
      1500
    );
    camera.position.set(
      paramsRef.current.cameraOffsetX,
      paramsRef.current.cameraOffsetY,
      paramsRef.current.cameraOffsetZ
    );
    cameraMount.add(camera);
    cameraRef.current = camera;

    // Post-Processing Composer
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      paramsRef.current.bloomStrength,
      0.5,
      0.85
    );
    composer.addPass(bloomPass);
    bloomPassRef.current = bloomPass;

    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    // Footstep & Jump Landing Dust Particle System
    const dustGroup = new THREE.Group();
    scene.add(dustGroup);
    const dustParticles: DustParticle[] = [];
    const dustGeom = new THREE.SphereGeometry(0.06, 8, 8);

    const spawnDustBurst = (x: number, y: number, z: number, count: number, power = 1) => {
      for (let i = 0; i < count; i++) {
        const mat = new THREE.MeshBasicMaterial({
          color: 0xe2e8f0,
          transparent: true,
          opacity: 0.55,
        });
        const mesh = new THREE.Mesh(dustGeom, mat);
        const angle = Math.random() * Math.PI * 2;
        const speed = (0.4 + Math.random() * 1.1) * power;
        mesh.position.set(
          x + (Math.random() - 0.5) * 0.25,
          y + 0.05,
          z + (Math.random() - 0.5) * 0.25
        );
        dustGroup.add(mesh);
        dustParticles.push({
          mesh,
          vx: Math.cos(angle) * speed,
          vy: (0.4 + Math.random() * 0.8) * power,
          vz: Math.sin(angle) * speed,
          age: 0,
          maxAge: 0.35 + Math.random() * 0.25,
        });
      }
    };

    // 7. Debug Collision & Camera Rig Visualizer
    const debugGroup = new THREE.Group();
    debugGroup.visible = paramsRef.current.showCollisionDebug;
    playerGroup.add(debugGroup);
    debugGroupRef.current = debugGroup;

    const cylGeom = new THREE.CylinderGeometry(0.3, 0.3, 2.0, 20, 1, true);
    const cylEdges = new THREE.EdgesGeometry(cylGeom);
    const cylWire = new THREE.LineSegments(
      cylEdges,
      new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.75 })
    );
    cylWire.position.set(0, 1.0, 0);
    debugGroup.add(cylWire);

    const visualsArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0, 0.1, 0),
      1.1,
      0xf59e0b,
      0.22,
      0.14
    );
    visualsGroup.add(visualsArrow);
    visualsArrow.visible = paramsRef.current.showCollisionDebug;

    const mountSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee })
    );
    cameraMount.add(mountSphere);
    mountSphere.visible = paramsRef.current.showCollisionDebug;

    const boomGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(
        paramsRef.current.cameraOffsetX,
        paramsRef.current.cameraOffsetY,
        paramsRef.current.cameraOffsetZ
      ),
    ]);
    const boomLine = new THREE.Line(boomGeom, new THREE.LineBasicMaterial({ color: 0x22d3ee }));
    cameraMount.add(boomLine);
    boomLine.visible = paramsRef.current.showCollisionDebug;
    camBoomLineRef.current = boomLine;

    // 8. Input Handling (Keyboard + Mouse + Touch + Gamepad with automatic device switching)
    const keysPressed = new Set<string>();
    let jumpJustPressed = false;
    let isPointerDragging = false;
    let activeCanvasTouchId: number | null = null;
    let lastCanvasTouchPos = { x: 0, y: 0 };

    const prevGamepadButtons: boolean[] = [];
    const warnedGamepadIds = new Set<string>();

    const triggerGamepadHaptic = (intensity: number, durationMs = 180) => {
      if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
      const pads = navigator.getGamepads();
      for (const gp of pads) {
        if (gp && gp.vibrationActuator) {
          gp.vibrationActuator
            .playEffect('dual-rumble', {
              startDelay: 0,
              duration: durationMs,
              weakMagnitude: Math.min(1, intensity * 0.6),
              strongMagnitude: Math.min(1, intensity),
            })
            .catch(() => {});
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }

      audioManager.unlock();
      inputDetectedCallbackRef.current('keyboard');

      if (e.code === 'Space' && !keysPressed.has('Space')) {
        jumpJustPressed = true;
      }
      keysPressed.add(e.code);

      if (e.code === 'KeyF') {
        playAnimation('kick', true);
      } else if (e.code === 'KeyK') {
        playAnimation('knock_down', true);
      } else if (e.code === 'KeyG') {
        playAnimation('get_up', true);
      } else if (e.code === 'KeyR') {
        playerStateRef.current.position = [0, 0, 0];
        playerStateRef.current.velocity = [0, 0, 0];
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.delete(e.code);
    };

    const applyMouseLook = (movementX: number, movementY: number) => {
      const p = paramsRef.current;
      const st = playerStateRef.current;

      const deltaYaw = movementX * p.horizontalMouseSensitivity;
      const deltaPitch = movementY * p.verticalMouseSensitivity;

      st.playerRotY -= deltaYaw;
      st.visualsRotY += deltaYaw;

      const minPitch = THREE.MathUtils.degToRad(p.cameraClampMinDeg);
      const maxPitch = THREE.MathUtils.degToRad(p.cameraClampMaxDeg);
      st.cameraPitchX = THREE.MathUtils.clamp(st.cameraPitchX - deltaPitch, minPitch, maxPitch);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const isLocked = document.pointerLockElement === renderer.domElement;
      if (isLocked || isPointerDragging) {
        inputDetectedCallbackRef.current('keyboard');
        applyMouseLook(e.movementX, e.movementY);
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0 && document.pointerLockElement !== renderer.domElement) {
        audioManager.unlock();
        inputDetectedCallbackRef.current('keyboard');
        isPointerDragging = true;
      }
    };

    const handleMouseUp = () => {
      isPointerDragging = false;
    };

    const handleTouchStart = (e: TouchEvent) => {
      audioManager.unlock();
      inputDetectedCallbackRef.current('touch');
      if (activeCanvasTouchId !== null) return;
      const t = e.changedTouches[0];
      if (!t) return;
      activeCanvasTouchId = t.identifier;
      lastCanvasTouchPos = { x: t.clientX, y: t.clientY };
    };

    const handleTouchMove = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === activeCanvasTouchId) {
          const dx = t.clientX - lastCanvasTouchPos.x;
          const dy = t.clientY - lastCanvasTouchPos.y;
          lastCanvasTouchPos = { x: t.clientX, y: t.clientY };
          applyMouseLook(dx * 2.2, dy * 2.2);
          break;
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === activeCanvasTouchId) {
          activeCanvasTouchId = null;
          break;
        }
      }
    };

    const handleGamepadConnected = (e: GamepadEvent) => {
      playerStateRef.current.gamepadName = e.gamepad.id;
      const mapping = resolveGamepadMapping(e.gamepad.id, warnedGamepadIds);
      playerStateRef.current.gamepadMappingType = mapping.label;
      inputDetectedCallbackRef.current('gamepad', e.gamepad.id);
    };

    const handleGamepadDisconnected = () => {
      playerStateRef.current.gamepadName = null;
    };

    const handlePointerLockChange = () => {
      const isLocked = document.pointerLockElement === renderer.domElement;
      if (isLocked) {
        inputDetectedCallbackRef.current('keyboard');
      }
      pointerLockCallbackRef.current(isLocked);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('gamepadconnected', handleGamepadConnected);
    window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);
    renderer.domElement.addEventListener('mousedown', handleMouseDown);
    renderer.domElement.addEventListener('touchstart', handleTouchStart, { passive: true });
    renderer.domElement.addEventListener('touchmove', handleTouchMove, { passive: true });
    renderer.domElement.addEventListener('touchend', handleTouchEnd);
    renderer.domElement.addEventListener('touchcancel', handleTouchEnd);
    document.addEventListener('pointerlockchange', handlePointerLockChange);

    // 9. Resize handling
    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
      composer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    const springArmRaycaster = new THREE.Raycaster();
    const mountWorldPos = new THREE.Vector3();
    const idealCamWorldPos = new THREE.Vector3();
    const rayDir = new THREE.Vector3();

    // 10. Main Physics & Render Loop
    let animFrameId = 0;
    let lastTime = performance.now();
    let frameCount = 0;
    let lastFpsUpdate = performance.now();
    let currentFps = 60;

    const animate = (now: number) => {
      animFrameId = requestAnimationFrame(animate);

      const rawDelta = (now - lastTime) / 1000;
      lastTime = now;
      const delta = Math.min(rawDelta, 0.1);
      const elapsedSec = now * 0.001;

      frameCount++;
      if (now - lastFpsUpdate >= 500) {
        currentFps = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
        frameCount = 0;
        lastFpsUpdate = now;
      }

      const p = paramsRef.current;
      const st = playerStateRef.current;
      const touchInput = touchInputRef.current;

      visualsArrow.visible = p.showCollisionDebug;
      mountSphere.visible = p.showCollisionDebug;
      boomLine.visible = p.showCollisionDebug;

      // Poll Gamepad Input with Vendor Fallback Mapping
      let gpMoveX = 0;
      let gpMoveY = 0;
      let gpLookX = 0;
      let gpLookY = 0;
      let gpSprint = false;
      let gpJumpJustPressed = false;

      if (typeof navigator !== 'undefined' && navigator.getGamepads) {
        const pads = navigator.getGamepads();
        const gp = pads[0] || pads[1] || pads[2] || pads[3];
        if (gp && gp.connected) {
          st.gamepadName = gp.id;
          const mapping = resolveGamepadMapping(gp.id, warnedGamepadIds);
          st.gamepadMappingType = mapping.label;

          const deadzone = 0.15;
          const lx = gp.axes[0] || 0;
          const ly = gp.axes[1] || 0;
          const rx = gp.axes[2] || 0;
          const ry = gp.axes[3] || 0;

          if (Math.hypot(lx, ly) > deadzone) {
            gpMoveX = lx;
            gpMoveY = ly;
          }
          if (gp.buttons[14]?.pressed) gpMoveX -= 1;
          if (gp.buttons[15]?.pressed) gpMoveX += 1;
          if (gp.buttons[12]?.pressed) gpMoveY -= 1;
          if (gp.buttons[13]?.pressed) gpMoveY += 1;

          if (Math.hypot(rx, ry) > deadzone) {
            gpLookX = rx;
            gpLookY = ry;
          }

          gpSprint =
            Boolean(gp.buttons[4]?.pressed) ||
            Boolean(gp.buttons[5]?.pressed) ||
            Boolean((gp.buttons[7]?.value ?? 0) > 0.4) ||
            Boolean(gp.buttons[10]?.pressed) ||
            Math.hypot(gpMoveX, gpMoveY) > 0.86;

          const btnJump = Boolean(gp.buttons[mapping.jumpIdx]?.pressed);
          const btnDown = Boolean(gp.buttons[mapping.downIdx]?.pressed);
          const btnKick = Boolean(gp.buttons[mapping.kickIdx]?.pressed);

          if (btnJump && !prevGamepadButtons[mapping.jumpIdx]) {
            gpJumpJustPressed = true;
          }
          if (btnKick && !prevGamepadButtons[mapping.kickIdx]) {
            playAnimation('kick', true);
          }
          if (btnDown && !prevGamepadButtons[mapping.downIdx]) {
            const nextAnim = st.currentAnimation === 'knock_down' ? 'get_up' : 'knock_down';
            playAnimation(nextAnim, true);
          }

          prevGamepadButtons[mapping.jumpIdx] = btnJump;
          prevGamepadButtons[mapping.downIdx] = btnDown;
          prevGamepadButtons[mapping.kickIdx] = btnKick;

          const anyButtonPressed = gp.buttons.some((b) => b.pressed);
          if (
            Math.hypot(gpMoveX, gpMoveY) > deadzone ||
            Math.hypot(gpLookX, gpLookY) > deadzone ||
            anyButtonPressed
          ) {
            audioManager.unlock();
            inputDetectedCallbackRef.current('gamepad', gp.id);
          }
        }
      }

      if (Math.hypot(gpLookX, gpLookY) > 0.01) {
        const gpYawSpeed = 2.4 * delta;
        const gpPitchSpeed = 2.0 * delta;
        st.playerRotY -= gpLookX * gpYawSpeed;
        st.visualsRotY += gpLookX * gpYawSpeed;
        const minPitch = THREE.MathUtils.degToRad(p.cameraClampMinDeg);
        const maxPitch = THREE.MathUtils.degToRad(p.cameraClampMaxDeg);
        st.cameraPitchX = THREE.MathUtils.clamp(
          st.cameraPitchX - gpLookY * gpPitchSpeed,
          minPitch,
          maxPitch
        );
      }

      // 1. Add gravity
      if (!st.isOnFloor) {
        st.velocity[1] -= p.gravity * delta;
      }

      // 2. Run state
      const isKeyboardRun = keysPressed.has('ShiftLeft') || keysPressed.has('ShiftRight');
      const isRunPressed = isKeyboardRun || touchInput.isSprintActive || gpSprint;
      st.isRunning = isRunPressed;
      const speed = isRunPressed ? p.runningSpeed : p.walkingSpeed;

      // 3. Handle jump
      if ((jumpJustPressed || touchInput.jumpRequested || gpJumpJustPressed) && st.isOnFloor) {
        st.velocity[1] = p.jumpVelocity;
        st.isOnFloor = false;
        audioManager.playJump();
        spawnDustBurst(st.position[0], st.position[1], st.position[2], 7, 1.15);
      }
      jumpJustPressed = false;
      touchInput.jumpRequested = false;

      // 4. Input.get_vector("left", "right", "forward", "backward")
      let inputX = touchInput.moveX + gpMoveX;
      let inputY = touchInput.moveY + gpMoveY;

      if (keysPressed.has('KeyA') || keysPressed.has('ArrowLeft')) inputX -= 1;
      if (keysPressed.has('KeyD') || keysPressed.has('ArrowRight')) inputX += 1;
      if (keysPressed.has('KeyW') || keysPressed.has('ArrowUp')) inputY -= 1;
      if (keysPressed.has('KeyS') || keysPressed.has('ArrowDown')) inputY += 1;

      const inputLen = Math.hypot(inputX, inputY);
      if (inputLen > 1) {
        inputX /= inputLen;
        inputY /= inputLen;
      }

      // 5. Transform input_dir by player's Y basis
      const cosY = Math.cos(st.playerRotY);
      const sinY = Math.sin(st.playerRotY);
      const dirX = inputX * cosY + inputY * sinY;
      const dirZ = -inputX * sinY + inputY * cosY;

      const isPlayingOneShot = now < st.oneShotUntil;

      if (inputLen > 0.05) {
        if (!isPlayingOneShot) {
          if (st.isRunning) {
            if (st.currentAnimation !== 'running') {
              playAnimation('running', false);
            }
          } else {
            if (st.currentAnimation !== 'walking') {
              playAnimation('walking', false);
            }
          }
        }

        const targetVisualsYaw = Math.atan2(-inputX, -inputY);
        const expWeight = 1 - Math.exp(-p.visualsRotationSmoothness * delta);
        st.visualsRotY = lerpAngle(st.visualsRotY, targetVisualsYaw, expWeight);

        const analogScale = Math.min(1, inputLen);
        st.velocity[0] = dirX * speed * analogScale;
        st.velocity[2] = dirZ * speed * analogScale;
      } else {
        if (!isPlayingOneShot && st.currentAnimation !== 'idle') {
          playAnimation('idle', false);
        }
        st.velocity[0] = moveToward(st.velocity[0], 0, speed);
        st.velocity[2] = moveToward(st.velocity[2], 0, speed);
      }

      // 6. Advance AnimationMixer & Trigger Footstep Audio
      if (mixer) {
        mixer.update(delta);
      }

      const horizSpeedPre = Math.hypot(st.velocity[0], st.velocity[2]);

      if (st.isOnFloor && horizSpeedPre > 0.15) {
        let stepTriggered = false;

        if (activeAction && p.characterModelMode === 'mixamo_glb') {
          const clipDur = activeAction.getClip().duration;
          if (clipDur > 0.05) {
            const normTime = (activeAction.time % clipDur) / clipDur;
            const prevNorm = st.prevAnimNormalizedTime;

            const crossedFootA =
              (prevNorm < 0.18 && normTime >= 0.18) ||
              (normTime < prevNorm && normTime >= 0.18);
            const crossedFootB = prevNorm < 0.68 && normTime >= 0.68;

            if (crossedFootA || crossedFootB) {
              stepTriggered = true;
            }
            st.prevAnimNormalizedTime = normTime;
          }
        } else {
          const rate = st.isRunning ? 2.6 : 1.6;
          st.fallbackStepPhase += delta * rate;
          if (st.fallbackStepPhase >= 1) {
            st.fallbackStepPhase -= 1;
            stepTriggered = true;
          }
        }

        if (stepTriggered) {
          audioManager.playFootstep(st.isRunning, st.activeFloorName);
          spawnDustBurst(
            st.position[0],
            st.position[1],
            st.position[2],
            st.isRunning ? 3 : 2,
            st.isRunning ? 0.75 : 0.45
          );
        }
      }

      // 7. Capture pre-landing downward velocity & execute move_and_slide() (capsuleVsOBB)
      const prevYVel = st.velocity[1];
      const preLandingDownwardSpeed = Math.max(0, -prevYVel);
      st.wasOnFloor = st.isOnFloor;

      const slideRes = moveAndSlide(st.position, st.velocity, delta, boxesRef.current);
      st.position = slideRes.position;
      st.velocity = slideRes.velocity;
      st.isOnFloor = slideRes.isOnFloor;
      st.activeFloorName = slideRes.activeFloorName;

      const horizSpeed = Math.hypot(st.velocity[0], st.velocity[2]);

      // State Machine: 'air' | 'run' | 'walk' | 'idle'
      if (!st.isOnFloor) {
        st.fsmState = 'air';
      } else if (horizSpeed > 3.5) {
        st.fsmState = 'run';
      } else if (horizSpeed > 0.15) {
        st.fsmState = 'walk';
      } else {
        st.fsmState = 'idle';
      }

      // Procedural motion on v2.0 Capsule placeholder when active
      if (capsuleV2Group.visible) {
        if (st.fsmState === 'walk' || st.fsmState === 'run') {
          const bobFreq = st.fsmState === 'run' ? 14 : 9;
          const bobAmp = st.fsmState === 'run' ? 0.06 : 0.035;
          capBodyMesh.position.y = 0.85 + Math.abs(Math.sin(elapsedSec * bobFreq)) * bobAmp;
          capHeadMesh.position.y = 1.58 + Math.abs(Math.sin(elapsedSec * bobFreq)) * bobAmp;
          capNoseMesh.position.y = 1.58 + Math.abs(Math.sin(elapsedSec * bobFreq)) * bobAmp;
          capsuleV2Group.rotation.x = st.fsmState === 'run' ? 0.12 : 0.05;
        } else {
          capBodyMesh.position.y = 0.85 + Math.sin(elapsedSec * 2.2) * 0.012;
          capHeadMesh.position.y = 1.58 + Math.sin(elapsedSec * 2.2) * 0.012;
          capNoseMesh.position.y = 1.58 + Math.sin(elapsedSec * 2.2) * 0.012;
          capsuleV2Group.rotation.x = 0;
        }
      }

      // 8. Trigger Proportional Camera Shake & Audio on Jump Landing
      if (!st.wasOnFloor && st.isOnFloor && prevYVel < -1.2) {
        const landingTrauma =
          Math.min(1.0, (preLandingDownwardSpeed - 1.0) / 8.5) * p.cameraShakeIntensity;
        st.cameraShakeTrauma = Math.min(1.0, st.cameraShakeTrauma + landingTrauma);
        audioManager.playImpact(preLandingDownwardSpeed, 'landing');
        spawnDustBurst(
          st.position[0],
          st.position[1],
          st.position[2],
          Math.round(5 + landingTrauma * 8),
          0.9 + landingTrauma * 0.7
        );
        triggerGamepadHaptic(landingTrauma, 180);
      }

      // 9. Trigger Proportional Camera Shake & Audio on Hitting Objects
      if (slideRes.wallImpactSpeed > 1.35 && now - st.lastWallImpactTime > 240) {
        st.lastWallImpactTime = now;
        const wallTrauma =
          Math.min(0.85, (slideRes.wallImpactSpeed - 1.0) / 6.0) * p.cameraShakeIntensity;
        st.cameraShakeTrauma = Math.min(1.0, st.cameraShakeTrauma + wallTrauma);
        audioManager.playImpact(slideRes.wallImpactSpeed, 'wall');
        triggerGamepadHaptic(wallTrauma, 180);
      }

      // Update Footstep Dust Particles
      for (let i = dustParticles.length - 1; i >= 0; i--) {
        const pt = dustParticles[i];
        pt.age += delta;
        if (pt.age >= pt.maxAge) {
          dustGroup.remove(pt.mesh);
          (pt.mesh.material as THREE.MeshBasicMaterial).dispose();
          dustParticles.splice(i, 1);
          continue;
        }
        pt.mesh.position.x += pt.vx * delta;
        pt.mesh.position.y += pt.vy * delta;
        pt.mesh.position.z += pt.vz * delta;
        const progress = pt.age / pt.maxAge;
        const s = 1 + progress * 1.6;
        pt.mesh.scale.setScalar(s);
        (pt.mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - progress);
      }

      // 9B. Update Global Wind Particle System (Leaves & Dust Motes)
      windGroup.visible = p.windEnabled;
      if (p.windEnabled) {
        const activeCount = Math.min(
          MAX_WIND_PARTICLES,
          Math.max(0, Math.round((p.windParticleDensity / 3.0) * MAX_WIND_PARTICLES))
        );
        const windRad = THREE.MathUtils.degToRad(p.windDirectionDeg);
        const windVx = Math.cos(windRad) * p.windSpeed;
        const windVz = Math.sin(windRad) * p.windSpeed;

        for (let i = 0; i < MAX_WIND_PARTICLES; i++) {
          const wp = windParticles[i];
          const styleMatches =
            p.windParticleStyle === 'mixed' ||
            (p.windParticleStyle === 'leaves' && wp.kind === 'leaf') ||
            (p.windParticleStyle === 'dust_motes' && wp.kind === 'mote');

          if (i >= activeCount || !styleMatches) {
            wp.mesh.visible = false;
            continue;
          }
          wp.mesh.visible = true;

          // Advect offset by wind velocity + sinusoidal turbulence
          const gust = 1.0 + 0.3 * Math.sin(elapsedSec * 1.4 + wp.phase);
          wp.offsetX += windVx * wp.speedMult * gust * delta;
          wp.offsetZ += windVz * wp.speedMult * gust * delta;

          // Gentle vertical drift + flutter
          const verticalDrift = wp.kind === 'leaf' ? -0.42 : -0.14;
          const flutterY =
            Math.sin(elapsedSec * (wp.kind === 'leaf' ? 3.2 : 1.8) + wp.phase) * wp.flutterAmp;
          wp.offsetY += (verticalDrift + flutterY * 0.5) * delta;

          // Wrap toroidal volume around the player's position
          if (wp.offsetX > WIND_BOX_HALF_XZ) wp.offsetX -= WIND_BOX_HALF_XZ * 2;
          if (wp.offsetX < -WIND_BOX_HALF_XZ) wp.offsetX += WIND_BOX_HALF_XZ * 2;
          if (wp.offsetZ > WIND_BOX_HALF_XZ) wp.offsetZ -= WIND_BOX_HALF_XZ * 2;
          if (wp.offsetZ < -WIND_BOX_HALF_XZ) wp.offsetZ += WIND_BOX_HALF_XZ * 2;
          if (wp.offsetY < 0.15) wp.offsetY = WIND_BOX_HEIGHT;
          if (wp.offsetY > WIND_BOX_HEIGHT) wp.offsetY = 0.2;

          const swayX = Math.cos(elapsedSec * 2.1 + wp.phase) * wp.flutterAmp * 0.25;
          const swayZ = Math.sin(elapsedSec * 2.4 + wp.phase) * wp.flutterAmp * 0.25;

          wp.mesh.position.set(
            st.position[0] + wp.offsetX + swayX,
            wp.offsetY,
            st.position[2] + wp.offsetZ + swayZ
          );

          if (wp.kind === 'leaf') {
            wp.mesh.rotation.x += wp.rotSpeedX * delta;
            wp.mesh.rotation.y += wp.rotSpeedY * delta;
            wp.mesh.rotation.z += wp.rotSpeedZ * delta;
          }
        }
      }

      // 10. Compute Damped Camera Shake Offsets via PRD v2.0 `prdNoise(t)`
      let shakeX = 0;
      let shakeY = 0;
      let shakeZ = 0;
      let shakeRoll = 0;

      if (st.cameraShakeTrauma > 0.0005) {
        st.cameraShakeTrauma = Math.max(0, st.cameraShakeTrauma - 1.4 * delta);
        const shake = st.cameraShakeTrauma * st.cameraShakeTrauma;
        shakeX = prdNoise(elapsedSec * 25 + 100) * 0.05 * shake;
        shakeY = prdNoise(elapsedSec * 25 + 150) * 0.06 * shake;
        shakeZ = prdNoise(elapsedSec * 25 + 200) * 0.05 * shake;
        shakeRoll = prdNoise(elapsedSec * 25 + 250) * 0.03 * shake;
      }

      // Apply transforms to Three.js nodes
      playerGroup.position.set(st.position[0], st.position[1], st.position[2]);
      playerGroup.rotation.y = st.playerRotY;
      visualsGroup.rotation.y = st.visualsRotY;

      cameraMount.position.set(shakeX, p.cameraMountY + shakeY, shakeZ);
      cameraMount.rotation.set(st.cameraPitchX, 0, shakeRoll);
      playerGroup.updateMatrixWorld(true);

      // 11. Spring-Arm Camera Collision Avoidance
      const desiredOffset = new THREE.Vector3(p.cameraOffsetX, p.cameraOffsetY, p.cameraOffsetZ);
      if (p.springArmCollision) {
        cameraMount.getWorldPosition(mountWorldPos);
        idealCamWorldPos.copy(desiredOffset).applyMatrix4(cameraMount.matrixWorld);
        rayDir.subVectors(idealCamWorldPos, mountWorldPos);
        const maxDist = rayDir.length();
        if (maxDist > 0.05) {
          rayDir.normalize();
          springArmRaycaster.set(mountWorldPos, rayDir);
          springArmRaycaster.near = 0.05;
          springArmRaycaster.far = maxDist;
          const colliders = [...boxMeshesGroup.children, floorMesh];
          const hits = springArmRaycaster.intersectObjects(colliders, false);
          if (hits.length > 0) {
            const safeDist = Math.max(0.45, hits[0].distance - 0.2);
            const safeFraction = Math.min(1, safeDist / maxDist);
            camera.position.lerp(desiredOffset.clone().multiplyScalar(safeFraction), 0.35);
          } else {
            camera.position.lerp(desiredOffset, 0.25);
          }
        }
      } else {
        camera.position.lerp(desiredOffset, 0.25);
      }

      // 12. Dynamic Sprint FOV Widening
      const targetFov = p.dynamicFov && st.fsmState === 'run' && horizSpeed > 3.5 ? 78 : 70;
      if (Math.abs(camera.fov - targetFov) > 0.05) {
        camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-5 * delta));
        camera.updateProjectionMatrix();
      }
      st.currentFov = camera.fov;

      // Update Directional Light position from sun vector
      dirLight.target.position.set(st.position[0], 0, st.position[2]);
      dirLight.target.updateMatrixWorld();
      dirLight.position.set(
        st.position[0] + sunVec.x * 35,
        Math.max(8, sunVec.y * 35),
        st.position[2] + sunVec.z * 35
      );

      if (p.bloomEnabled) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }

      telemetryCallbackRef.current({
        position: [...st.position],
        velocity: [...st.velocity],
        horizontalSpeed: horizSpeed,
        playerRotationY: st.playerRotY,
        visualsRotationY: st.visualsRotY,
        cameraPitchX: st.cameraPitchX,
        isOnFloor: st.isOnFloor,
        isRunning: st.isRunning,
        currentAnimation: st.currentAnimation,
        fsmState: st.fsmState,
        inputDir: [inputX, inputY],
        activeFloorName: st.activeFloorName,
        fps: currentFps,
        currentFov: st.currentFov,
        activeInputDevice: activeInputDeviceRef.current,
        gamepadName: st.gamepadName,
        gamepadMappingType: st.gamepadMappingType,
        cameraShakeAmount: st.cameraShakeTrauma,
      });
    };

    animFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('gamepadconnected', handleGamepadConnected);
      window.removeEventListener('gamepaddisconnected', handleGamepadDisconnected);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      renderer.domElement.removeEventListener('mousedown', handleMouseDown);
      renderer.domElement.removeEventListener('touchstart', handleTouchStart);
      renderer.domElement.removeEventListener('touchmove', handleTouchMove);
      renderer.domElement.removeEventListener('touchend', handleTouchEnd);
      renderer.domElement.removeEventListener('touchcancel', handleTouchEnd);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      leafGeom.dispose();
      moteGeom.dispose();
      leafMaterials.forEach((m) => m.dispose());
      moteMaterial.dispose();
      pmremGenerator.dispose();
      composer.dispose();
      renderer.dispose();
    };
  }, [canvasContainerRef, touchInputRef]);

  return (
    <div className="relative w-full h-full select-none touch-none">
      <div
        ref={canvasContainerRef}
        className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
        title="Automatically switches between Keyboard/Mouse, Touch, and Gamepad input"
      />

      {!modelLoaded && params.characterModelMode === 'mixamo_glb' && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center bg-slate-950/40 backdrop-blur-xs">
          <div className="px-4 py-2.5 rounded-lg bg-slate-900/90 border border-white/10 text-xs font-mono text-slate-300">
            Loading assets/models/mixamo_base.glb...
          </div>
        </div>
      )}

      {webglLost && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 p-6 z-30">
          <div className="max-w-md p-6 rounded-xl bg-slate-900 border border-white/10 text-center space-y-3">
            <h2 className="text-lg font-display font-semibold text-white">
              WebGL Context Suspended
            </h2>
            <p className="text-sm text-slate-400">
              The 3D graphics context was interrupted. Tap Reset in the top bar to restore the viewport.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
