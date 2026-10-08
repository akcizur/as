/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Crosshair,
  Gamepad2,
  Keyboard,
  RotateCcw,
  SlidersHorizontal,
  Smartphone,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ThirdPersonViewport } from './components/ThirdPersonViewport';
import { ActiveTab, ControllerDrawer } from './components/ControllerDrawer';
import { MobileTouchControls, TouchInputState } from './components/MobileTouchControls';
import { SpatialMiniMap } from './components/SpatialMiniMap';
import {
  AnimationName,
  CAMERA_PRESETS,
  CameraPresetId,
  CollisionLayer,
  ControllerParams,
  CSGBoxConfig,
  GridTextureColor,
  INITIAL_WORLD_BOXES,
  InputDeviceMode,
  InputPreference,
  loadPersistedParams,
  PlayerTelemetry,
  savePersistedParams,
} from './types/controller';
import { audioManager } from './utils/audioManager';

function getInitialInputDevice(): InputDeviceMode {
  if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches) {
    return 'touch';
  }
  return 'keyboard';
}

const INITIAL_TELEMETRY: PlayerTelemetry = {
  position: [0, 0, 0],
  velocity: [0, 0, 0],
  horizontalSpeed: 0,
  playerRotationY: 0,
  visualsRotationY: 0,
  cameraPitchX: 0,
  isOnFloor: true,
  isRunning: false,
  currentAnimation: 'idle',
  fsmState: 'idle',
  inputDir: [0, 0],
  activeFloorName: 'map/floor',
  fps: 60,
  currentFov: 70,
  activeInputDevice: getInitialInputDevice(),
  gamepadName: null,
  gamepadMappingType: 'Standard',
  cameraShakeAmount: 0,
};

const PRESET_ORDER: CameraPresetId[] = [
  'godot_default',
  'close_combat',
  'wide_adventure',
  'isometric',
];

const INPUT_PREF_ORDER: InputPreference[] = ['auto', 'touch', 'keyboard', 'gamepad'];

export default function App() {
  const [params, setParams] = useState<ControllerParams>(() => loadPersistedParams());
  const [boxes, setBoxes] = useState<CSGBoxConfig[]>(INITIAL_WORLD_BOXES);
  const [detectedDevice, setDetectedDevice] = useState<InputDeviceMode>(getInitialInputDevice);
  const [telemetry, setTelemetry] = useState<PlayerTelemetry>(INITIAL_TELEMETRY);
  const [activeTab, setActiveTab] = useState<ActiveTab>('none');
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const [requestedActionAnimation, setRequestedActionAnimation] = useState<{
    name: AnimationName;
    timestamp: number;
  } | null>(null);
  const [cameraDeltaSignal, setCameraDeltaSignal] = useState<{
    dx: number;
    dy: number;
    timestamp: number;
  } | null>(null);

  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const lastTelemetryTickRef = useRef<number>(0);

  const touchInputRef = useRef<TouchInputState>({
    moveX: 0,
    moveY: 0,
    isSprintActive: false,
    jumpRequested: false,
    angleDeg: 0,
    force: 0,
  });

  // M16: Persist ControllerParams (`CFG`) to localStorage on every change
  useEffect(() => {
    savePersistedParams(params);
  }, [params]);

  // Effective input device: follows automatic hardware detection unless manually overridden
  const effectiveInputDevice: InputDeviceMode =
    params.inputPreference === 'auto' ? detectedDevice : params.inputPreference;

  const handleInputDeviceDetected = useCallback((device: InputDeviceMode) => {
    setDetectedDevice((prev) => (prev === device ? prev : device));
  }, []);

  const handleTelemetryUpdate = useCallback((next: PlayerTelemetry) => {
    const now = performance.now();
    if (now - lastTelemetryTickRef.current >= 48) {
      lastTelemetryTickRef.current = now;
      setTelemetry(next);
    }
  }, []);

  const handleCameraTouchDelta = useCallback((dx: number, dy: number) => {
    setCameraDeltaSignal({ dx, dy, timestamp: performance.now() });
  }, []);

  const handleCycleCameraPreset = () => {
    const currentIdx = PRESET_ORDER.indexOf(params.cameraPreset);
    const nextKey = PRESET_ORDER[(currentIdx + 1) % PRESET_ORDER.length];
    const preset = CAMERA_PRESETS[nextKey];
    setParams((prev) => ({
      ...prev,
      cameraPreset: nextKey,
      cameraMountY: preset.mountY,
      cameraOffsetX: preset.offsetX,
      cameraOffsetY: preset.offsetY,
      cameraOffsetZ: preset.offsetZ,
    }));
  };

  const handleCycleInputPreference = () => {
    const idx = INPUT_PREF_ORDER.indexOf(params.inputPreference);
    const nextPref = INPUT_PREF_ORDER[(idx + 1) % INPUT_PREF_ORDER.length];
    setParams((prev) => ({ ...prev, inputPreference: nextPref }));
  };

  const handleToggleMute = () => {
    const nextMuted = !params.audioMuted;
    setParams((prev) => ({ ...prev, audioMuted: nextMuted }));
    if (!nextMuted) {
      audioManager.unlock();
      audioManager.playFootstep(false, 'map/floor');
    }
  };

  const handleRequestPointerLock = () => {
    audioManager.unlock();
    const canvas = canvasContainerRef.current?.querySelector('canvas');
    if (canvas && document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    } else if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
  };

  const handleResetPlayer = () => {
    setResetSignal((prev) => prev + 1);
  };

  const handleTriggerAnimation = (name: AnimationName) => {
    setRequestedActionAnimation({ name, timestamp: performance.now() });
  };

  const handleSpawnBox = (color: GridTextureColor, size: [number, number, number]) => {
    const yaw = telemetry.playerRotationY;
    const dist = 3.2 + size[2] * 0.5;
    const spawnX = Number((telemetry.position[0] - Math.sin(yaw) * dist).toFixed(2));
    const spawnZ = Number((telemetry.position[2] - Math.cos(yaw) * dist).toFixed(2));
    const spawnY = Number((size[1] * 0.5).toFixed(2));

    const newBox: CSGBoxConfig = {
      id: `box_${boxes.length + 1}`,
      name: `box_${boxes.length + 1} (OBB)`,
      position: [spawnX, spawnY, spawnZ],
      size,
      rotationY: Number((yaw + 0.25).toFixed(3)),
      color,
      isOriginal: false,
      layer: CollisionLayer.WORLD,
    };
    setBoxes((prev) => [...prev, newBox]);
  };

  const handleSpawnParkourSteps = () => {
    const baseSteps: CSGBoxConfig[] = [
      {
        id: `step_${boxes.length + 1}`,
        name: 'step_1 (OBB)',
        position: [2.2, 0.4, 2.5],
        size: [1.8, 0.8, 1.8],
        rotationY: 0.15,
        color: 'Orange',
        isOriginal: false,
        layer: CollisionLayer.WORLD,
      },
      {
        id: `step_${boxes.length + 2}`,
        name: 'step_2 (OBB)',
        position: [4.4, 0.85, 4.2],
        size: [2.0, 1.7, 2.0],
        rotationY: -0.2,
        color: 'Red',
        isOriginal: false,
        layer: CollisionLayer.WORLD,
      },
      {
        id: `step_${boxes.length + 3}`,
        name: 'step_3 (OBB)',
        position: [6.8, 1.35, 2.6],
        size: [2.4, 2.7, 2.4],
        rotationY: 0.3,
        color: 'Green',
        isOriginal: false,
        layer: CollisionLayer.WORLD,
      },
    ];
    setBoxes((prev) => [...prev, ...baseSteps]);
  };

  const handleResetBoxes = () => {
    setBoxes(INITIAL_WORLD_BOXES);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 select-none touch-none">
      {/* 3-Zone Top Navigation Bar Contract */}
      <header className="absolute top-0 left-0 right-0 h-13 md:h-14 z-20 flex items-center justify-between px-4 md:px-6 bg-slate-950/75 backdrop-blur-md border-b border-white/10">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#viewport"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('none');
          }}
          className="text-sm md:text-base font-display font-bold tracking-tight text-white whitespace-nowrap truncate"
        >
          Third Person Controller
        </a>

        {/* Zone 2: Clean text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-300">
          <a
            href="#viewport"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('none');
            }}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeTab === 'none'
                ? 'text-white underline underline-offset-8 decoration-amber-400 decoration-2'
                : 'hover:text-white hover:underline hover:underline-offset-8'
            }`}
          >
            Viewport
          </a>
          <a
            href="#inspector"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab(activeTab === 'inspector' ? 'none' : 'inspector');
            }}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeTab === 'inspector'
                ? 'text-white underline underline-offset-8 decoration-amber-400 decoration-2'
                : 'hover:text-white hover:underline hover:underline-offset-8'
            }`}
          >
            Inspector
          </a>
          <a
            href="#scene-graph"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab(activeTab === 'scene_graph' ? 'none' : 'scene_graph');
            }}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeTab === 'scene_graph'
                ? 'text-white underline underline-offset-8 decoration-amber-400 decoration-2'
                : 'hover:text-white hover:underline hover:underline-offset-8'
            }`}
          >
            Scene Graph
          </a>
          <a
            href="#gdscript"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab(activeTab === 'gdscript' ? 'none' : 'gdscript');
            }}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeTab === 'gdscript'
                ? 'text-white underline underline-offset-8 decoration-amber-400 decoration-2'
                : 'hover:text-white hover:underline hover:underline-offset-8'
            }`}
          >
            Export (.gd / HTML)
          </a>
          <a
            href="#prd"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab(activeTab === 'prd' ? 'none' : 'prd');
            }}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeTab === 'prd'
                ? 'text-white underline underline-offset-8 decoration-amber-400 decoration-2'
                : 'hover:text-white hover:underline hover:underline-offset-8'
            }`}
          >
            PRD v2.0
          </a>
        </nav>

        {/* Zone 3: Primary actions */}
        <div className="flex items-center gap-2">
          {/* Audio Mute/Unmute Toggle */}
          <button
            onClick={handleToggleMute}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors whitespace-nowrap"
            title={params.audioMuted ? 'Unmute footstep & impact audio' : 'Mute audio'}
          >
            {params.audioMuted ? (
              <VolumeX className="w-3.5 h-3.5 text-red-400" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span className="hidden xl:inline">{params.audioMuted ? 'Muted' : 'SFX'}</span>
          </button>

          {/* Active Input Mode Switcher (Auto / Key / Touch / Gamepad) */}
          <button
            onClick={handleCycleInputPreference}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/40 text-amber-200 rounded-lg transition-colors whitespace-nowrap"
            title="Automatically switches between Key/Mouse, Touch, and Gamepad on input, or click to lock mode"
          >
            {effectiveInputDevice === 'touch' && <Smartphone className="w-3.5 h-3.5" />}
            {effectiveInputDevice === 'keyboard' && <Keyboard className="w-3.5 h-3.5" />}
            {effectiveInputDevice === 'gamepad' && <Gamepad2 className="w-3.5 h-3.5" />}
            <span>
              {params.inputPreference === 'auto'
                ? `Auto (${effectiveInputDevice === 'keyboard' ? 'Key' : effectiveInputDevice === 'touch' ? 'Touch' : 'Pad'})`
                : effectiveInputDevice.toUpperCase()}
            </span>
          </button>

          <button
            onClick={handleCycleCameraPreset}
            className="hidden sm:inline-flex min-h-[38px] items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors whitespace-nowrap"
            title="Cycle camera view preset"
          >
            <Camera className="w-3.5 h-3.5 text-amber-400" />
            <span>{CAMERA_PRESETS[params.cameraPreset].label.split(' ')[0]}</span>
          </button>

          <button
            onClick={handleResetPlayer}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors whitespace-nowrap"
            title="Reset player to origin"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Mobile Inspector Sheet Trigger */}
          <button
            onClick={() => setActiveTab(activeTab === 'none' ? 'inspector' : 'none')}
            className="md:hidden min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{activeTab === 'none' ? 'Settings' : 'Close'}</span>
          </button>

          {effectiveInputDevice === 'keyboard' && (
            <button
              onClick={handleRequestPointerLock}
              className="hidden lg:inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>{isPointerLocked ? 'Captured (ESC)' : 'Capture Mouse'}</span>
            </button>
          )}
        </div>
      </header>

      {/* Full Viewport 3D Scene */}
      <main className="w-full h-full">
        <ThirdPersonViewport
          params={params}
          boxes={boxes}
          activeInputDevice={effectiveInputDevice}
          onInputDeviceDetected={handleInputDeviceDetected}
          onTelemetryUpdate={handleTelemetryUpdate}
          onPointerLockChange={setIsPointerLocked}
          resetSignal={resetSignal}
          requestedActionAnimation={requestedActionAnimation}
          canvasContainerRef={canvasContainerRef}
          touchInputRef={touchInputRef}
          cameraDeltaSignal={cameraDeltaSignal}
        />
      </main>

      {/* Dual-Thumb Phone Touch Controller Overlay (Automatically shown when Touch input is active) */}
      <MobileTouchControls
        touchInputRef={touchInputRef}
        onCameraTouchDelta={handleCameraTouchDelta}
        onTriggerAnimation={handleTriggerAnimation}
        onTouchActivity={() => handleInputDeviceDetected('touch')}
        joystickMode={params.joystickMode}
        visible={effectiveInputDevice === 'touch'}
      />

      {/* Top-Left 180x180 Spatial Radar + Compact Telemetry Card */}
      <div className="absolute top-16 left-4 z-10 pointer-events-none flex items-start gap-2.5">
        <SpatialMiniMap telemetry={telemetry} boxes={boxes} />

        <div className="px-3.5 py-2.5 rounded-2xl bg-slate-950/80 backdrop-blur-md border border-white/15 shadow-xl space-y-1.5 min-w-[215px]">
          <div className="flex items-center justify-between gap-3 text-xs text-slate-300">
            <span className="font-display font-semibold text-white">CharacterBody3D</span>
            <span className="font-mono tabular-nums text-amber-300 uppercase">
              {telemetry.fsmState} · {telemetry.fps} FPS
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2.5 pt-1 border-t border-white/10 font-mono text-xs tabular-nums">
            <div>
              <div className="text-[10px] text-slate-400 font-sans">Speed</div>
              <div className="text-white font-medium">
                {telemetry.horizontalSpeed.toFixed(1)} m/s
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-sans">Surface</div>
              <div className="text-white font-medium truncate">
                {telemetry.activeFloorName.replace('map/', '')}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-sans">Input</div>
              <div className="text-emerald-300 font-medium uppercase">
                {effectiveInputDevice === 'keyboard'
                  ? 'Key'
                  : effectiveInputDevice === 'touch'
                    ? 'Touch'
                    : 'Pad'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Adaptive Bottom Controls Bar for Keyboard/Mouse and Gamepad modes */}
      {effectiveInputDevice !== 'touch' && (
        <div className="absolute bottom-4 left-4 z-10 pointer-events-none flex flex-wrap items-center gap-2.5 px-4 py-2.5 rounded-xl bg-slate-950/75 backdrop-blur-md border border-white/15 text-xs text-slate-300">
          {effectiveInputDevice === 'keyboard' ? (
            <>
              <span>
                <strong className="font-mono text-white">WASD / Arrows</strong> Move
              </span>
              <span aria-hidden="true" className="text-slate-500">
                ·
              </span>
              <span>
                <strong className="font-mono text-white">Shift</strong> Run (
                {params.runningSpeed.toFixed(1)} m/s)
              </span>
              <span aria-hidden="true" className="text-slate-500">
                ·
              </span>
              <span>
                <strong className="font-mono text-white">Space</strong> Jump
              </span>
              <span aria-hidden="true" className="text-slate-500">
                ·
              </span>
              <span>
                <strong className="font-mono text-white">F / K / G</strong> Kick / Fall / Get Up
              </span>
              <span aria-hidden="true" className="text-slate-500">
                ·
              </span>
              <span>
                <strong className="font-mono text-white">Mouse Drag or Capture</strong> Orbit
              </span>
            </>
          ) : (
            <>
              <span>
                <strong className="font-mono text-amber-300">L-Stick / D-Pad</strong> Move
              </span>
              <span aria-hidden="true" className="text-slate-500">
                ·
              </span>
              <span>
                <strong className="font-mono text-amber-300">R-Stick</strong> Orbit Camera
              </span>
              <span aria-hidden="true" className="text-slate-500">
                ·
              </span>
              <span>
                <strong className="font-mono text-amber-300">A / Cross</strong> Jump
              </span>
              <span aria-hidden="true" className="text-slate-500">
                ·
              </span>
              <span>
                <strong className="font-mono text-amber-300">RT / LB / L3</strong> Sprint
              </span>
              <span aria-hidden="true" className="text-slate-500">
                ·
              </span>
              <span>
                <strong className="font-mono text-amber-300">X / B</strong> Kick / Fall (
                {telemetry.gamepadMappingType})
              </span>
            </>
          )}
        </div>
      )}

      {/* Responsive Inspector / Scene Graph / GDScript & AIO Exporter / PRD v2.0 Drawer */}
      <ControllerDrawer
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onClose={() => setActiveTab('none')}
        params={params}
        onChangeParams={setParams}
        telemetry={telemetry}
        boxes={boxes}
        onSpawnBox={handleSpawnBox}
        onSpawnParkourSteps={handleSpawnParkourSteps}
        onResetBoxes={handleResetBoxes}
        onTriggerAnimation={handleTriggerAnimation}
      />
    </div>
  );
}
