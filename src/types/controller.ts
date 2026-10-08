export type AnimationName = 'idle' | 'walking' | 'running' | 'kick' | 'knock_down' | 'get_up';

export type FSMState = 'idle' | 'walk' | 'run' | 'air';

export type GridTextureColor = 'Orange' | 'Red' | 'Green' | 'Dark';

export type CameraPresetId = 'godot_default' | 'close_combat' | 'wide_adventure' | 'isometric';

export type JoystickMode = 'static' | 'semi' | 'dynamic';

export type InputDeviceMode = 'keyboard' | 'touch' | 'gamepad';

export type InputPreference = 'auto' | InputDeviceMode;

export type WindParticleStyle = 'mixed' | 'leaves' | 'dust_motes';

export type CharacterModelMode = 'mixamo_glb' | 'capsule_v2';

export enum CollisionLayer {
  WORLD = 0x01,
  PLAYER = 0x02,
  PROPS = 0x04,
  TRIGGER = 0x08,
}

export interface CSGBoxConfig {
  id: string;
  name: string;
  position: [number, number, number];
  size: [number, number, number];
  rotationY: number;
  color: GridTextureColor;
  isOriginal: boolean;
  layer?: CollisionLayer;
}

export interface ControllerParams {
  walkingSpeed: number;
  runningSpeed: number;
  jumpVelocity: number;
  visualsRotationSmoothness: number;
  cameraClampMinDeg: number;
  cameraClampMaxDeg: number;
  horizontalMouseSensitivity: number;
  verticalMouseSensitivity: number;
  gravity: number;
  cameraMountY: number;
  cameraOffsetX: number;
  cameraOffsetY: number;
  cameraOffsetZ: number;
  animationBlendTime: number;
  // Global Wind Particle System (Leaves & Dust Motes — No Fog)
  windEnabled: boolean;
  windParticleDensity: number;
  windSpeed: number;
  windDirectionDeg: number;
  windParticleStyle: WindParticleStyle;
  showCollisionDebug: boolean;
  cameraPreset: CameraPresetId;
  bloomEnabled: boolean;
  bloomStrength: number;
  sunElevationDeg: number;
  dynamicFov: boolean;
  springArmCollision: boolean;
  joystickMode: JoystickMode;
  inputPreference: InputPreference;
  cameraShakeIntensity: number;
  audioVolume: number;
  audioMuted: boolean;
  characterModelMode: CharacterModelMode;
}

export interface PlayerTelemetry {
  position: [number, number, number];
  velocity: [number, number, number];
  horizontalSpeed: number;
  playerRotationY: number;
  visualsRotationY: number;
  cameraPitchX: number;
  isOnFloor: boolean;
  isRunning: boolean;
  currentAnimation: AnimationName;
  fsmState: FSMState;
  inputDir: [number, number];
  activeFloorName: string;
  fps: number;
  currentFov: number;
  activeInputDevice: InputDeviceMode;
  gamepadName: string | null;
  gamepadMappingType: string;
  cameraShakeAmount: number;
}

export const CAMERA_PRESETS: Record<
  CameraPresetId,
  {
    label: string;
    mountY: number;
    offsetX: number;
    offsetY: number;
    offsetZ: number;
    defaultPitchDeg?: number;
  }
> = {
  godot_default: {
    label: 'Shoulder (player.tscn)',
    mountY: 1.377,
    offsetX: 0.358389,
    offsetY: 0.481816,
    offsetZ: 1.23577,
  },
  close_combat: {
    label: 'Close Action',
    mountY: 1.44,
    offsetX: 0.46,
    offsetY: 0.24,
    offsetZ: 0.95,
  },
  wide_adventure: {
    label: 'Wide Chase',
    mountY: 1.5,
    offsetX: 0.0,
    offsetY: 0.65,
    offsetZ: 2.35,
  },
  isometric: {
    label: 'High Tactical',
    mountY: 1.75,
    offsetX: 0.0,
    offsetY: 2.1,
    offsetZ: 3.3,
    defaultPitchDeg: -25,
  },
};

export const DEFAULT_CONTROLLER_PARAMS: ControllerParams = {
  walkingSpeed: 3.0,
  runningSpeed: 5.0,
  jumpVelocity: 4.5,
  visualsRotationSmoothness: 10.0,
  cameraClampMinDeg: -90,
  cameraClampMaxDeg: 45,
  horizontalMouseSensitivity: 0.0022,
  verticalMouseSensitivity: 0.0022,
  gravity: 9.8,
  cameraMountY: 1.377,
  cameraOffsetX: 0.358389,
  cameraOffsetY: 0.481816,
  cameraOffsetZ: 1.23577,
  animationBlendTime: 0.2,
  windEnabled: true,
  windParticleDensity: 1.0,
  windSpeed: 3.2,
  windDirectionDeg: 35,
  windParticleStyle: 'mixed',
  showCollisionDebug: false,
  cameraPreset: 'godot_default',
  bloomEnabled: true,
  bloomStrength: 0.32,
  sunElevationDeg: 52,
  dynamicFov: true,
  springArmCollision: true,
  joystickMode: 'semi',
  inputPreference: 'auto',
  cameraShakeIntensity: 1.0,
  audioVolume: 0.7,
  audioMuted: false,
  characterModelMode: 'mixamo_glb',
};

const STORAGE_KEY = 'tpc_v2_wind_controller_params';

export function loadPersistedParams(): ControllerParams {
  if (typeof window === 'undefined') return DEFAULT_CONTROLLER_PARAMS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONTROLLER_PARAMS;
    const parsed = JSON.parse(raw) as Partial<ControllerParams>;
    return { ...DEFAULT_CONTROLLER_PARAMS, ...parsed };
  } catch {
    return DEFAULT_CONTROLLER_PARAMS;
  }
}

export function savePersistedParams(params: ControllerParams): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
  } catch {
    // Ignore storage quota errors
  }
}

export function clearPersistedParams(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Complete 6 OBB obstacle setup from PRD v2.0 Section 3.2:
 * - box   (1×1×1m, orange #d97a2e, yaw 0.374)
 * - box2  (2×2×2m, red    #b23636, yaw 1.002)
 * - box3  (3×3×3m, green  #3f7a3f, yaw 0.326)
 * - box4  (6×1×6m, platforma, yaw 0)
 * - box5  (4×1×4m, stacked, yaw 0)
 * - box6  (8×0.5×2m, rampa/bridge, yaw 0.7)
 */
export const INITIAL_WORLD_BOXES: CSGBoxConfig[] = [
  {
    id: 'box',
    name: 'box (1×1×1m OBB)',
    position: [3.91596, 0.5, -3.75506],
    size: [1, 1, 1],
    rotationY: 0.374,
    color: 'Orange',
    isOriginal: true,
    layer: CollisionLayer.WORLD,
  },
  {
    id: 'box2',
    name: 'box2 (2×2×2m OBB)',
    position: [-1.7253, 1.0, 3.9277],
    size: [2, 2, 2],
    rotationY: 1.002,
    color: 'Red',
    isOriginal: true,
    layer: CollisionLayer.WORLD,
  },
  {
    id: 'box3',
    name: 'box3 (3×3×3m OBB)',
    position: [-3.99419, 1.5, -6.46399],
    size: [3, 3, 3],
    rotationY: 0.326,
    color: 'Green',
    isOriginal: true,
    layer: CollisionLayer.WORLD,
  },
  {
    id: 'box4',
    name: 'box4 (6×1×6m Platform)',
    position: [7.5, 0.5, 5.5],
    size: [6, 1, 6],
    rotationY: 0,
    color: 'Dark',
    isOriginal: true,
    layer: CollisionLayer.WORLD,
  },
  {
    id: 'box5',
    name: 'box5 (4×1×4m Stacked)',
    position: [7.5, 1.5, 5.5],
    size: [4, 1, 4],
    rotationY: 0,
    color: 'Orange',
    isOriginal: true,
    layer: CollisionLayer.WORLD,
  },
  {
    id: 'box6',
    name: 'box6 (8×0.5×2m Ramp/Step)',
    position: [2.2, 0.25, 7.8],
    size: [8, 0.5, 2],
    rotationY: 0.7,
    color: 'Green',
    isOriginal: true,
    layer: CollisionLayer.WORLD,
  },
];

function clampVal(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

/**
 * Generates validated Godot 4 GDScript according to PRD v2.0 Section 7 template + full CharacterBody3D implementation
 */
export function generateGdScript(params: ControllerParams): string {
  const walking = clampVal(params.walkingSpeed, 1.0, 8.0).toFixed(1);
  const running = clampVal(params.runningSpeed, 2.0, 14.0).toFixed(1);
  const jump = clampVal(params.jumpVelocity, 2.0, 12.0).toFixed(1);
  const visualsRot = clampVal(params.visualsRotationSmoothness, 1.0, 25.0).toFixed(1);
  const gravity = clampVal(params.gravity, 2.0, 25.0).toFixed(1);
  const shake = clampVal(params.cameraShakeIntensity, 0.0, 2.5).toFixed(2);
  const volume = clampVal(params.audioVolume, 0.0, 1.0).toFixed(2);
  const windDensity = clampVal(params.windParticleDensity, 0.1, 3.0).toFixed(2);
  const windSpeed = clampVal(params.windSpeed, 0.5, 12.0).toFixed(1);
  const sunElev = Math.round(clampVal(params.sunElevationDeg, 6, 85));
  const timestamp = new Date().toISOString();

  return `# Auto-generated from Web Inspector
# Timestamp: ${timestamp}
extends CharacterBody3D

@export var walking_speed := ${walking}
@export var running_speed := ${running}
@export var JUMP_VELOCITY := ${jump}
@export var VISUALS_ROTATION_SMOOTHNESS := ${visualsRot}
@export var gravity := ${gravity}
@export var CAMERA_CLAMP_MIN := deg_to_rad(${params.cameraClampMinDeg})
@export var CAMERA_CLAMP_MAX := deg_to_rad(${params.cameraClampMaxDeg})
@export var cameraShakeIntensity := ${shake}
@export var audioVolume := ${volume}
@export var wind_particle_density := ${windDensity}
@export var wind_speed := ${windSpeed}
@export var sunElevationDeg := ${sunElev}

@onready var camera_mount = $camera_mount
@onready var animation_player = $visuals/mixamo_base/AnimationPlayer
@onready var visuals = $visuals

var horizontal_mouse_sensitivity = ${params.horizontalMouseSensitivity.toFixed(4)}
var vertical_mouse_sensitivity = ${params.verticalMouseSensitivity.toFixed(4)}
var speed = walking_speed
var is_running = false

func _ready():
\tInput.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _input(event):
\tif event is InputEventMouseMotion:
\t\trotate_y(-event.relative.x * horizontal_mouse_sensitivity)
\t\tvisuals.rotate_y(event.relative.x * horizontal_mouse_sensitivity)
\t\tcamera_mount.rotate_x(-event.relative.y * vertical_mouse_sensitivity)
\t\tcamera_mount.rotation.x = clamp(camera_mount.rotation.x, CAMERA_CLAMP_MIN, CAMERA_CLAMP_MAX)

func _physics_process(delta):
\tif not is_on_floor():
\t\tvelocity.y -= gravity * delta

\tif Input.is_action_pressed("run"):
\t\tspeed = running_speed
\t\tis_running = true
\telse:
\t\tspeed = walking_speed
\t\tis_running = false

\tif Input.is_action_just_pressed("ui_accept") and is_on_floor():
\t\tvelocity.y = JUMP_VELOCITY

\tvar input_dir = Input.get_vector("left", "right", "forward", "backward")
\tvar direction = (transform.basis * Vector3(input_dir.x, 0, input_dir.y)).normalized()
\tvar visuals_direction = Vector3(input_dir.x, 0, input_dir.y).normalized()
\tif direction:
\t\tif is_running:
\t\t\tif animation_player.current_animation != "running":
\t\t\t\tanimation_player.play("running")
\t\telse:
\t\t\tif animation_player.current_animation != "walking":
\t\t\t\tanimation_player.play("walking")

\t\tvisuals.rotation.y = lerp_angle(visuals.rotation.y, atan2(-visuals_direction.x, -visuals_direction.z), delta * VISUALS_ROTATION_SMOOTHNESS)

\t\tvelocity.x = direction.x * speed
\t\tvelocity.z = direction.z * speed
\telse:
\t\tif animation_player.current_animation != "idle":
\t\t\tanimation_player.play("idle")
\t\tvelocity.x = move_toward(velocity.x, 0, speed)
\t\tvelocity.z = move_toward(velocity.z, 0, speed)

\tmove_and_slide()`;
}

/**
 * Generates the standalone single-file AIO HTML build (PRD v2.0 Section 12 GitHub Pages Ready)
 * with Global Wind Particle System (no fog) and OBB obstacles baked in.
 */
export function generateStandaloneAioHtml(params: ControllerParams, boxes: CSGBoxConfig[]): string {
  const serializedBoxes = JSON.stringify(
    boxes.map((b) => ({
      id: b.id,
      x: b.position[0],
      y: b.position[1],
      z: b.position[2],
      sx: b.size[0],
      sy: b.size[1],
      sz: b.size[2],
      yaw: b.rotationY,
      color:
        b.color === 'Orange'
          ? '#d97a2e'
          : b.color === 'Red'
            ? '#b23636'
            : b.color === 'Green'
              ? '#3f7a3f'
              : '#334155',
    }))
  );

  return `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
  <title>Third-Person Controller v2.0 — Standalone AIO Build</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; -webkit-user-select: none; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #090d16; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; color: #f8fafc; }
    #canvas-wrap { position: absolute; inset: 0; }
    #hud-left { position: fixed; top: 14px; left: 14px; z-index: 10; display: flex; gap: 12px; align-items: flex-start; pointer-events: none; }
    #radar { width: 140px; height: 140px; border-radius: 16px; background: rgba(9,13,22,0.78); border: 1px solid rgba(255,255,255,0.15); backdrop-filter: blur(8px); }
    #stats { padding: 10px 14px; border-radius: 14px; background: rgba(9,13,22,0.78); border: 1px solid rgba(255,255,255,0.15); font-size: 12px; line-height: 1.6; }
    #inspector { position: fixed; top: 14px; right: 14px; width: 270px; z-index: 20; padding: 14px; border-radius: 16px; background: rgba(9,13,22,0.85); border: 1px solid rgba(255,255,255,0.15); backdrop-filter: blur(10px); font-size: 11px; }
    #inspector h3 { font-size: 13px; margin-bottom: 10px; color: #fbbf24; }
    .row { margin-bottom: 8px; }
    .row label { display: flex; justify-content: space-between; margin-bottom: 2px; color: #cbd5e1; }
    .row input[type=range] { width: 100%; accent-color: #f59e0b; }
  </style>
  <script type="importmap">
  {
    "imports": {
      "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
      "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
    }
  }
  </script>
</head>
<body>
  <div id="canvas-wrap"></div>
  <div id="hud-left">
    <svg id="radar" viewBox="0 0 180 180">
      <circle cx="90" cy="90" r="30" fill="none" stroke="rgba(255,255,255,0.08)" />
      <circle cx="90" cy="90" r="60" fill="none" stroke="rgba(255,255,255,0.08)" />
      <circle cx="90" cy="90" r="85" fill="none" stroke="rgba(255,255,255,0.08)" />
      <line x1="90" y1="0" x2="90" y2="180" stroke="rgba(255,255,255,0.06)" />
      <line x1="0" y1="90" x2="180" y2="90" stroke="rgba(255,255,255,0.06)" />
      <g id="radar-dyn"></g>
    </svg>
    <div id="stats">
      <div>State: <strong id="st-fsm" style="color:#fbbf24">idle</strong></div>
      <div>Speed: <span id="st-spd">0.0</span> m/s</div>
      <div>Input: <span id="st-inp" style="color:#34d399">keyboard</span></div>
      <div>FPS: <span id="st-fps">60</span></div>
    </div>
  </div>

  <div id="inspector">
    <h3>CharacterBody3D Inspector (v2.0)</h3>
    <div class="row"><label><span>walking</span><span id="v_walk">${params.walkingSpeed.toFixed(1)}</span></label><input id="s_walk" type="range" min="1" max="8" step="0.1" value="${params.walkingSpeed}" /></div>
    <div class="row"><label><span>running</span><span id="v_run">${params.runningSpeed.toFixed(1)}</span></label><input id="s_run" type="range" min="2" max="14" step="0.5" value="${params.runningSpeed}" /></div>
    <div class="row"><label><span>jump</span><span id="v_jump">${params.jumpVelocity.toFixed(1)}</span></label><input id="s_jump" type="range" min="2" max="12" step="0.5" value="${params.jumpVelocity}" /></div>
    <div class="row"><label><span>gravity</span><span id="v_grav">${params.gravity.toFixed(1)}</span></label><input id="s_grav" type="range" min="2" max="25" step="0.5" value="${params.gravity}" /></div>
    <div class="row"><label><span>shake</span><span id="v_shake">${params.cameraShakeIntensity.toFixed(1)}</span></label><input id="s_shake" type="range" min="0" max="2.5" step="0.1" value="${params.cameraShakeIntensity}" /></div>
    <div class="row"><label><span>wind_density</span><span id="v_wind">${params.windParticleDensity.toFixed(2)}</span></label><input id="s_wind" type="range" min="0.1" max="3.0" step="0.1" value="${params.windParticleDensity}" /></div>
    <div class="row"><label><span>volume</span><span id="v_vol">${params.audioVolume.toFixed(2)}</span></label><input id="s_vol" type="range" min="0" max="1" step="0.05" value="${params.audioVolume}" /></div>
  </div>

  <script type="module">
    import * as THREE from 'three';
    import { Sky } from 'three/addons/objects/Sky.js';
    import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

    const CFG = {
      walking: ${params.walkingSpeed},
      running: ${params.runningSpeed},
      jump: ${params.jumpVelocity},
      gravity: ${params.gravity},
      visualsRot: ${params.visualsRotationSmoothness},
      shake: ${params.cameraShakeIntensity},
      windDensity: ${params.windParticleDensity},
      windSpeed: ${params.windSpeed},
      sunElev: ${params.sunElevationDeg},
      volume: ${params.audioVolume}
    };

    ['walk','run','jump','grav','shake','wind','vol'].forEach(k => {
      const mapKey = { walk:'walking', run:'running', jump:'jump', grav:'gravity', shake:'shake', wind:'windDensity', vol:'volume' }[k];
      const el = document.getElementById('s_' + k);
      const valEl = document.getElementById('v_' + k);
      el.addEventListener('input', e => {
        CFG[mapKey] = parseFloat(e.target.value);
        valEl.textContent = CFG[mapKey].toFixed(k === 'wind' || k === 'vol' ? 2 : 1);
      });
    });

    const scene = new THREE.Scene();

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.85;
    document.getElementById('canvas-wrap').appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const sky = new Sky();
    sky.scale.setScalar(45000);
    scene.add(sky);
    const phi = THREE.MathUtils.degToRad(90 - CFG.sunElev);
    const sunPos = new THREE.Vector3().setFromSphericalCoords(1, phi, 0);
    sky.material.uniforms.turbidity.value = 8;
    sky.material.uniforms.rayleigh.value = 2.4;
    sky.material.uniforms.mieCoefficient.value = 0.006;
    sky.material.uniforms.mieDirectionalG.value = 0.78;
    sky.material.uniforms.sunPosition.value.copy(sunPos);

    const sun = new THREE.DirectionalLight(0xfffbeb, 2.2);
    sun.position.copy(sunPos).multiplyScalar(35);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xe0f2fe, 0x334155, 0.65));

    const gridCanvas = document.createElement('canvas');
    gridCanvas.width = 512; gridCanvas.height = 512;
    const gctx = gridCanvas.getContext('2d');
    gctx.fillStyle = '#1e2229'; gctx.fillRect(0,0,512,512);
    gctx.strokeStyle = '#384152'; gctx.lineWidth = 4; gctx.strokeRect(2,2,508,508);
    const floorTex = new THREE.CanvasTexture(gridCanvas);
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(125, 125);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(500, 96).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.94, metalness: 0.05 })
    );
    floor.receiveShadow = true;
    scene.add(floor);

    const boxes = ${serializedBoxes};
    for (const b of boxes) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(b.sx, b.sy, b.sz),
        new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.65, metalness: 0.08 })
      );
      m.position.set(b.x, b.y, b.z);
      m.rotation.y = b.yaw;
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
    }

    const playerRoot = new THREE.Group();
    scene.add(playerRoot);
    const visuals = new THREE.Group();
    playerRoot.add(visuals);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.9, 8, 16), new THREE.MeshStandardMaterial({ color: '#d54d43', roughness: 0.7 }));
    body.position.y = 0.85; body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), new THREE.MeshStandardMaterial({ color: '#f0c9a0', roughness: 0.6 }));
    head.position.y = 1.62; head.castShadow = true;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.18), new THREE.MeshStandardMaterial({ color: '#55201a' }));
    nose.position.set(0, 1.62, 0.18);
    visuals.add(body, head, nose);

    const camMount = new THREE.Group();
    camMount.position.y = 1.377;
    playerRoot.add(camMount);
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 1500);
    camera.position.set(0.358, 0.482, 1.236);
    camMount.add(camera);

    let pos = { x: 0, y: 0, z: 0 }, vel = { x: 0, y: 0, z: 0 };
    let camYaw = 0, camPitch = 0, visualYaw = 0, onFloor = true;
    const keys = new Set();
    window.addEventListener('keydown', e => { keys.add(e.code); document.getElementById('st-inp').textContent = 'keyboard'; });
    window.addEventListener('keyup', e => keys.delete(e.code));
    renderer.domElement.addEventListener('click', () => renderer.domElement.requestPointerLock?.());
    window.addEventListener('mousemove', e => {
      if (document.pointerLockElement === renderer.domElement) {
        camYaw -= e.movementX * 0.0022;
        camPitch = Math.max(-Math.PI/2, Math.min(Math.PI/4, camPitch - e.movementY * 0.0022));
      }
    });

    function capsuleVsOBB(p, R, H, box) {
      const dx = p.x - box.x, dz = p.z - box.z;
      const c = Math.cos(-box.yaw), s = Math.sin(-box.yaw);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const hx = box.sx * 0.5, hy = box.sy * 0.5, hz = box.sz * 0.5;
      const cx = Math.max(-hx, Math.min(hx, lx)), cz = Math.max(-hz, Math.min(hz, lz));
      const dfx = lx - cx, dfz = lz - cz;
      const hDist = Math.hypot(dfx, dfz);
      const hPen = R - hDist;
      if (hPen <= 0) return null;
      const boxTop = box.y + hy, boxBot = box.y - hy;
      if (p.y >= boxTop || p.y + H <= boxBot) return null;
      const vPenTop = boxTop - p.y, vPenBot = (p.y + H) - boxBot;
      const vPen = Math.min(vPenTop, vPenBot);
      if (hPen < vPen) {
        const nxL = hDist > 1e-5 ? dfx / hDist : 1, nzL = hDist > 1e-5 ? dfz / hDist : 0;
        const ic = Math.cos(box.yaw), is = Math.sin(box.yaw);
        return { normal: { x: nxL * ic - nzL * is, y: 0, z: nxL * is + nzL * ic }, depth: hPen, type: 'side' };
      }
      return vPenTop < vPenBot
        ? { normal: { x: 0, y: 1, z: 0 }, depth: vPenTop, type: 'top' }
        : { normal: { x: 0, y: -1, z: 0 }, depth: vPenBot, type: 'bottom' };
    }

    let last = performance.now();
    function loop(now) {
      requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      let ix = 0, iz = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) iz -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) iz += 1;
      const mag = Math.min(1, Math.hypot(ix, iz));
      if (mag > 0) { ix /= Math.hypot(ix, iz); iz /= Math.hypot(ix, iz); }
      const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
      const spd = run ? CFG.running : CFG.walking;

      const fx = Math.sin(camYaw + Math.PI), fz = Math.cos(camYaw + Math.PI);
      const rx = -fz, rz = fx;
      vel.x = (ix * rx - iz * fx) * spd * mag;
      vel.z = (ix * rz - iz * fz) * spd * mag;
      if (!onFloor) vel.y -= CFG.gravity * dt;
      if (keys.has('Space') && onFloor) { vel.y = CFG.jump; onFloor = false; }

      onFloor = false;
      pos.x += vel.x * dt; pos.y += vel.y * dt; pos.z += vel.z * dt;
      if (pos.y <= 0) { pos.y = 0; vel.y = 0; onFloor = true; }
      for (const b of boxes) {
        const hit = capsuleVsOBB(pos, 0.3, 2.0, b);
        if (!hit) continue;
        pos.x += hit.normal.x * hit.depth; pos.y += hit.normal.y * hit.depth; pos.z += hit.normal.z * hit.depth;
        if (hit.type === 'top') { vel.y = 0; onFloor = true; }
        else if (hit.type === 'bottom') { vel.y = 0; }
        else { const vn = vel.x * hit.normal.x + vel.z * hit.normal.z; if (vn < 0) { vel.x -= hit.normal.x * vn; vel.z -= hit.normal.z * vn; } }
      }

      playerRoot.position.set(pos.x, pos.y, pos.z);
      playerRoot.rotation.y = camYaw;
      if (mag > 0.05) {
        const targetWorld = Math.atan2(vel.x, vel.z);
        const diff = ((targetWorld - camYaw - visualYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        visualYaw += diff * (1 - Math.exp(-CFG.visualsRot * dt));
      }
      visuals.rotation.y = visualYaw;
      camMount.rotation.x = camPitch;

      const hSpd = Math.hypot(vel.x, vel.z);
      document.getElementById('st-spd').textContent = hSpd.toFixed(1);
      document.getElementById('st-fsm').textContent = !onFloor ? 'air' : hSpd > 3.5 ? 'run' : hSpd > 0.15 ? 'walk' : 'idle';
      renderer.render(scene, camera);
    }
    requestAnimationFrame(loop);
  </script>
</body>
</html>`;
}
