import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Copy,
  Check,
  RotateCcw,
  Plus,
  Trash2,
  Download,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
  FileCode2,
} from 'lucide-react';
import {
  AnimationName,
  CAMERA_PRESETS,
  CameraPresetId,
  CharacterModelMode,
  clearPersistedParams,
  ControllerParams,
  CSGBoxConfig,
  DEFAULT_CONTROLLER_PARAMS,
  generateGdScript,
  generateStandaloneAioHtml,
  GridTextureColor,
  InputPreference,
  JoystickMode,
  PlayerTelemetry,
  WindParticleStyle,
} from '../types/controller';
import { audioManager } from '../utils/audioManager';

export type ActiveTab = 'none' | 'inspector' | 'scene_graph' | 'gdscript' | 'prd';

export interface ControllerDrawerProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onClose: () => void;
  params: ControllerParams;
  onChangeParams: (next: ControllerParams) => void;
  telemetry: PlayerTelemetry;
  boxes: CSGBoxConfig[];
  onSpawnBox: (color: GridTextureColor, size: [number, number, number]) => void;
  onSpawnParkourSteps: () => void;
  onResetBoxes: () => void;
  onTriggerAnimation: (anim: AnimationName) => void;
}

const ANIMATION_CLIPS: { id: AnimationName; label: string; hotkey: string; mode: string }[] = [
  { id: 'idle', label: 'idle', hotkey: 'Auto', mode: 'Loop' },
  { id: 'walking', label: 'walking', hotkey: 'Stick / WASD', mode: 'Loop' },
  { id: 'running', label: 'running', hotkey: 'Shift / RT', mode: 'Loop' },
  { id: 'kick', label: 'kick', hotkey: 'Key F / X', mode: 'One-Shot' },
  { id: 'knock_down', label: 'knock_down', hotkey: 'Key K / B', mode: 'One-Shot' },
  { id: 'get_up', label: 'get_up', hotkey: 'Key G / B', mode: 'One-Shot' },
];

export const ControllerDrawer: React.FC<ControllerDrawerProps> = ({
  activeTab,
  onSelectTab,
  onClose,
  params,
  onChangeParams,
  telemetry,
  boxes,
  onSpawnBox,
  onSpawnParkourSteps,
  onResetBoxes,
  onTriggerAnimation,
}) => {
  const [copied, setCopied] = useState(false);

  const updateParam = <K extends keyof ControllerParams>(key: K, value: ControllerParams[K]) => {
    onChangeParams({ ...params, [key]: value });
  };

  const applyCameraPreset = (presetId: CameraPresetId) => {
    const preset = CAMERA_PRESETS[presetId];
    onChangeParams({
      ...params,
      cameraPreset: presetId,
      cameraMountY: preset.mountY,
      cameraOffsetX: preset.offsetX,
      cameraOffsetY: preset.offsetY,
      cameraOffsetZ: preset.offsetZ,
    });
  };

  const handleResetDefaults = () => {
    clearPersistedParams();
    onChangeParams(DEFAULT_CONTROLLER_PARAMS);
  };

  const handleCopyGdScript = () => {
    navigator.clipboard.writeText(generateGdScript(params));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadGdScript = () => {
    const blob = new Blob([generateGdScript(params)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'player.gd';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAioHtml = () => {
    const html = generateStandaloneAioHtml(params, boxes);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'index.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  const radToDeg = (r: number) => ((r * 180) / Math.PI).toFixed(1);
  const activeParticleCount = params.windEnabled
    ? Math.round((params.windParticleDensity / 3.0) * 360)
    : 0;

  return (
    <AnimatePresence>
      {activeTab !== 'none' && (
        <motion.aside
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 28 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-x-0 bottom-0 max-h-[78vh] rounded-t-3xl md:absolute md:inset-x-auto md:top-16 md:right-4 md:bottom-4 md:max-h-none md:w-[410px] md:rounded-xl z-30 flex flex-col bg-slate-950/92 backdrop-blur-md border-t md:border border-white/15 shadow-2xl overflow-hidden"
        >
          {/* Mobile Bottom Sheet Drag Handle Affordance */}
          <div className="md:hidden w-10 h-1.5 bg-slate-700 rounded-full mx-auto mt-2.5 mb-1 shrink-0" />

          {/* Drawer Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
            <div>
              <h2 className="text-base font-display font-semibold text-white">
                {activeTab === 'inspector' && 'CharacterBody3D Inspector (v2.1)'}
                {activeTab === 'scene_graph' && 'Godot 4 → Three.js Scene Graph'}
                {activeTab === 'gdscript' && 'GDScript & AIO HTML Exporter'}
                {activeTab === 'prd' && 'Product Requirements Document v2.0 / v2.1'}
              </h2>
              <p className="text-xs text-slate-400">
                {activeTab === 'inspector' && 'Auto-saved · Global Wind Particles · Bez mlhy'}
                {activeTab === 'scene_graph' && '6 OBB obstacles · Wind Particles · Mixamo GLB'}
                {activeTab === 'gdscript' && 'Export validated player.gd or single-file index.html'}
                {activeTab === 'prd' && 'Kompletní specifikace M0–M17, algoritmy a architektura'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="min-h-[40px] px-3.5 py-1.5 text-xs font-medium text-slate-200 hover:text-white bg-white/10 hover:bg-white/15 rounded-lg transition-colors whitespace-nowrap"
            >
              Close
            </button>
          </div>

          {/* Mobile Segmented Tab Switcher */}
          <div className="md:hidden grid grid-cols-4 gap-1 p-2 bg-slate-900/80 border-b border-white/10 shrink-0">
            <button
              onClick={() => onSelectTab('inspector')}
              className={`min-h-[40px] px-2 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                activeTab === 'inspector'
                  ? 'bg-amber-400 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Inspector
            </button>
            <button
              onClick={() => onSelectTab('scene_graph')}
              className={`min-h-[40px] px-2 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                activeTab === 'scene_graph'
                  ? 'bg-amber-400 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Scene
            </button>
            <button
              onClick={() => onSelectTab('gdscript')}
              className={`min-h-[40px] px-2 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                activeTab === 'gdscript'
                  ? 'bg-amber-400 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Export
            </button>
            <button
              onClick={() => onSelectTab('prd')}
              className={`min-h-[40px] px-2 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                activeTab === 'prd'
                  ? 'bg-amber-400 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              PRD v2.0
            </button>
          </div>

          {/* Drawer Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6 text-sm">
            {activeTab === 'inspector' && (
              <>
                {/* Section 1: Character Model (v2.1 GLB vs v2.0 Capsule), Input & Camera */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-300">
                      01. Visuals Mode, Input & Camera
                    </h3>
                    <button
                      onClick={handleResetDefaults}
                      className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors whitespace-nowrap"
                      title="Reset all parameters and clear localStorage"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset CFG</span>
                    </button>
                  </div>

                  {/* Character Mesh Switcher: v2.1 Mixamo GLB vs v2.0 Capsule Blockout */}
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                      <span>Player Visuals Mesh</span>
                      <span className="font-mono text-emerald-400">
                        FSM: {telemetry.fsmState.toUpperCase()}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-900 rounded-lg border border-white/10">
                      {(
                        [
                          { id: 'mixamo_glb', label: 'v2.1 Mixamo GLB (65 bones)' },
                          { id: 'capsule_v2', label: 'v2.0 Capsule Blockout' },
                        ] as { id: CharacterModelMode; label: string }[]
                      ).map((m) => (
                        <button
                          key={m.id}
                          onClick={() => updateParam('characterModelMode', m.id)}
                          className={`min-h-[34px] px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap truncate ${
                            params.characterModelMode === m.id
                              ? 'bg-amber-400 text-slate-950 font-semibold'
                              : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                      <span>Input Routing (Key / Touch / Gamepad)</span>
                      <span className="font-mono text-amber-300">
                        {telemetry.activeInputDevice.toUpperCase()}
                        {telemetry.activeInputDevice === 'gamepad'
                          ? ` (${telemetry.gamepadMappingType})`
                          : ''}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1 p-1 bg-slate-900 rounded-lg border border-white/10">
                      {(
                        [
                          { id: 'auto', label: 'Auto' },
                          { id: 'keyboard', label: 'Key/Mouse' },
                          { id: 'touch', label: 'Touch' },
                          { id: 'gamepad', label: 'Gamepad' },
                        ] as { id: InputPreference; label: string }[]
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => updateParam('inputPreference', opt.id)}
                          className={`min-h-[34px] px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                            params.inputPreference === opt.id
                              ? 'bg-amber-400 text-slate-950 font-semibold'
                              : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Joystick Mode Selector */}
                  <div>
                    <div className="text-xs text-slate-400 mb-1.5">Touch Thumbstick Mode</div>
                    <div className="grid grid-cols-3 gap-1 p-1 bg-slate-900 rounded-lg border border-white/10">
                      {(
                        [
                          { id: 'semi', label: 'Semi-Float' },
                          { id: 'dynamic', label: 'Dynamic (v2.0)' },
                          { id: 'static', label: 'Fixed' },
                        ] as { id: JoystickMode; label: string }[]
                      ).map((m) => (
                        <button
                          key={m.id}
                          onClick={() => updateParam('joystickMode', m.id)}
                          className={`min-h-[34px] px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                            params.joystickMode === m.id
                              ? 'bg-amber-400 text-slate-950 font-semibold'
                              : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {(Object.keys(CAMERA_PRESETS) as CameraPresetId[]).map((presetKey) => {
                      const preset = CAMERA_PRESETS[presetKey];
                      const active = params.cameraPreset === presetKey;
                      return (
                        <button
                          key={presetKey}
                          onClick={() => applyCameraPreset(presetKey)}
                          className={`min-h-[38px] px-3 py-2 rounded-lg border text-xs font-medium text-left transition-colors whitespace-nowrap truncate ${
                            active
                              ? 'bg-amber-400/20 border-amber-400 text-amber-200'
                              : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* Section 2: PRD v2.0 Section 6 Core Sliders (s_walk, s_run, s_jump, s_grav, s_shake, s_vol) */}
                <section className="space-y-3 pt-4 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-300">
                      02. Physics & Audio Sliders (CFG)
                    </h3>
                    <button
                      onClick={() => {
                        const nextMuted = !params.audioMuted;
                        updateParam('audioMuted', nextMuted);
                        if (!nextMuted) {
                          audioManager.unlock();
                          audioManager.playFootstep(false, 'map/floor');
                        }
                      }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-300 hover:text-white transition-colors"
                    >
                      {params.audioMuted ? (
                        <>
                          <VolumeX className="w-3.5 h-3.5 text-red-400" />
                          <span>Muted</span>
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Web Audio On</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-300 font-mono">walking (s_walk)</span>
                        <span className="font-mono tabular-nums text-amber-400">
                          {params.walkingSpeed.toFixed(1)} m/s
                        </span>
                      </div>
                      <input
                        id="s_walk"
                        type="range"
                        min="1.0"
                        max="8.0"
                        step="0.1"
                        value={params.walkingSpeed}
                        onChange={(e) => updateParam('walkingSpeed', parseFloat(e.target.value))}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-300 font-mono">running (s_run)</span>
                        <span className="font-mono tabular-nums text-amber-400">
                          {params.runningSpeed.toFixed(1)} m/s
                        </span>
                      </div>
                      <input
                        id="s_run"
                        type="range"
                        min="2.0"
                        max="14.0"
                        step="0.5"
                        value={params.runningSpeed}
                        onChange={(e) => updateParam('runningSpeed', parseFloat(e.target.value))}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-300 font-mono">jump (s_jump)</span>
                        <span className="font-mono tabular-nums text-amber-400">
                          {params.jumpVelocity.toFixed(1)} m/s
                        </span>
                      </div>
                      <input
                        id="s_jump"
                        type="range"
                        min="2.0"
                        max="12.0"
                        step="0.5"
                        value={params.jumpVelocity}
                        onChange={(e) => updateParam('jumpVelocity', parseFloat(e.target.value))}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-300 font-mono">gravity (s_grav)</span>
                        <span className="font-mono tabular-nums text-amber-400">
                          {params.gravity.toFixed(1)} m/s²
                        </span>
                      </div>
                      <input
                        id="s_grav"
                        type="range"
                        min="2.0"
                        max="25.0"
                        step="0.5"
                        value={params.gravity}
                        onChange={(e) => updateParam('gravity', parseFloat(e.target.value))}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-300 font-mono">visualsRot</span>
                        <span className="font-mono tabular-nums text-amber-400">
                          {params.visualsRotationSmoothness.toFixed(1)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1.0"
                        max="25.0"
                        step="0.5"
                        value={params.visualsRotationSmoothness}
                        onChange={(e) =>
                          updateParam('visualsRotationSmoothness', parseFloat(e.target.value))
                        }
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-300 font-mono">shake (s_shake)</span>
                        <span className="font-mono tabular-nums text-amber-400">
                          {params.cameraShakeIntensity.toFixed(2)}
                        </span>
                      </div>
                      <input
                        id="s_shake"
                        type="range"
                        min="0"
                        max="2.5"
                        step="0.05"
                        value={params.cameraShakeIntensity}
                        onChange={(e) =>
                          updateParam('cameraShakeIntensity', parseFloat(e.target.value))
                        }
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-300 font-mono">volume (s_vol)</span>
                        <span className="font-mono tabular-nums text-amber-400">
                          {params.audioVolume.toFixed(2)}
                        </span>
                      </div>
                      <input
                        id="s_vol"
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={params.audioVolume}
                        onChange={(e) => {
                          audioManager.unlock();
                          updateParam('audioVolume', parseFloat(e.target.value));
                        }}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                    </div>
                  </div>
                </section>

                {/* Section 3: Global Wind Particle System (Leaves & Dust Motes — No Fog) */}
                <section className="space-y-3 pt-4 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-300">
                      03. Global Wind Particles (Leaves & Motes)
                    </h3>
                    <span className="text-[11px] font-mono tabular-nums text-emerald-400">
                      {params.windEnabled ? `${activeParticleCount} active` : 'Wind Off'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => updateParam('windEnabled', !params.windEnabled)}
                      className={`min-h-[36px] px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                        params.windEnabled
                          ? 'bg-amber-400/15 border-amber-400/50 text-amber-200'
                          : 'bg-white/5 border-white/10 text-slate-400'
                      }`}
                    >
                      Wind: {params.windEnabled ? 'On' : 'Off'}
                    </button>
                    <button
                      onClick={() => updateParam('bloomEnabled', !params.bloomEnabled)}
                      className={`min-h-[36px] px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                        params.bloomEnabled
                          ? 'bg-amber-400/15 border-amber-400/50 text-amber-200'
                          : 'bg-white/5 border-white/10 text-slate-400'
                      }`}
                    >
                      Bloom: {params.bloomEnabled ? 'On' : 'Off'}
                    </button>
                    <button
                      onClick={() => updateParam('springArmCollision', !params.springArmCollision)}
                      className={`min-h-[36px] px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                        params.springArmCollision
                          ? 'bg-amber-400/15 border-amber-400/50 text-amber-200'
                          : 'bg-white/5 border-white/10 text-slate-400'
                      }`}
                    >
                      SpringArm: {params.springArmCollision ? 'On' : 'Off'}
                    </button>
                  </div>

                  {params.windEnabled && (
                    <div className="space-y-2.5">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-300 font-mono">wind_particle_density</span>
                          <span className="font-mono tabular-nums text-amber-400">
                            {params.windParticleDensity.toFixed(2)}× ({activeParticleCount} pts)
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.10"
                          max="3.00"
                          step="0.05"
                          value={params.windParticleDensity}
                          onChange={(e) =>
                            updateParam('windParticleDensity', parseFloat(e.target.value))
                          }
                          className="w-full accent-amber-500 cursor-pointer"
                        />
                      </div>

                      {/* Quick Wind Density Presets */}
                      <div className="grid grid-cols-4 gap-1">
                        {[
                          { label: 'Subtle (0.4×)', val: 0.4 },
                          { label: 'Balanced (1.0×)', val: 1.0 },
                          { label: 'Breezy (1.8×)', val: 1.8 },
                          { label: 'Gale (2.8×)', val: 2.8 },
                        ].map((preset) => (
                          <button
                            key={preset.label}
                            onClick={() => updateParam('windParticleDensity', preset.val)}
                            className={`min-h-[32px] px-1.5 py-1 rounded-md border text-[11px] font-medium transition-colors whitespace-nowrap truncate ${
                              Math.abs(params.windParticleDensity - preset.val) < 0.08
                                ? 'bg-amber-400 text-slate-950 border-amber-400 font-semibold'
                                : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>

                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-300 font-mono">wind_speed</span>
                          <span className="font-mono tabular-nums text-amber-400">
                            {params.windSpeed.toFixed(1)} m/s
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.5"
                          max="10.0"
                          step="0.2"
                          value={params.windSpeed}
                          onChange={(e) => updateParam('windSpeed', parseFloat(e.target.value))}
                          className="w-full accent-amber-500 cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="text-xs text-slate-400 mb-1">Wind Particle Style</div>
                        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-900 rounded-lg border border-white/10">
                          {(
                            [
                              { id: 'mixed', label: 'Leaves + Motes' },
                              { id: 'leaves', label: 'Leaves Only' },
                              { id: 'dust_motes', label: 'Dust Motes' },
                            ] as { id: WindParticleStyle; label: string }[]
                          ).map((style) => (
                            <button
                              key={style.id}
                              onClick={() => updateParam('windParticleStyle', style.id)}
                              className={`min-h-[32px] px-1.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap truncate ${
                                params.windParticleStyle === style.id
                                  ? 'bg-amber-400 text-slate-950 font-semibold'
                                  : 'text-slate-300 hover:text-white'
                              }`}
                            >
                              {style.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-300 font-mono">sunElev (6°–85°)</span>
                      <span className="font-mono tabular-nums text-amber-400">
                        {params.sunElevationDeg}°
                      </span>
                    </div>
                    <input
                      type="range"
                      min="6"
                      max="85"
                      step="1"
                      value={params.sunElevationDeg}
                      onChange={(e) => updateParam('sunElevationDeg', parseFloat(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>

                  <div className="pt-1">
                    <button
                      onClick={() => updateParam('showCollisionDebug', !params.showCollisionDebug)}
                      className="min-h-[40px] w-full flex items-center justify-between px-3.5 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200 transition-colors"
                    >
                      <span>Show Capsule Collider (r=0.3, h=2.0) & Camera Boom</span>
                      {params.showCollisionDebug ? (
                        <Eye className="w-4 h-4 text-amber-400" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                  </div>
                </section>

                {/* Section 4: AnimationPlayer Clips */}
                <section className="space-y-3 pt-4 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-300">
                      04. Animation Clips & FSM ({telemetry.fsmState})
                    </h3>
                    <span className="text-xs font-mono text-slate-400">
                      blend: {params.animationBlendTime.toFixed(1)}s
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {ANIMATION_CLIPS.map((clip) => {
                      const isActive = telemetry.currentAnimation === clip.id;
                      return (
                        <button
                          key={clip.id}
                          onClick={() => onTriggerAnimation(clip.id)}
                          className={`min-h-[44px] flex flex-col items-start px-3 py-2 rounded-lg border text-left transition-colors ${
                            isActive
                              ? 'bg-amber-500/15 border-amber-500/50 text-amber-200'
                              : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                          }`}
                        >
                          <span className="font-mono text-xs font-medium">{clip.label}</span>
                          <span className="text-[11px] text-slate-400">
                            {clip.hotkey} · {clip.mode}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* Section 5: OBB Obstacles Sandbox */}
                <section className="space-y-3 pt-4 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-300">
                      05. map (OBB Obstacles · Layer WORLD 0x01)
                    </h3>
                    <span className="text-xs font-mono tabular-nums text-slate-400">
                      {boxes.length} OBBs
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => onSpawnBox('Orange', [1, 1, 1])}
                      className="min-h-[40px] flex items-center justify-center gap-1 px-2.5 py-2 rounded-lg bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/30 text-xs font-medium text-orange-200 transition-colors whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>1m OBB</span>
                    </button>
                    <button
                      onClick={() => onSpawnBox('Red', [2, 2, 2])}
                      className="min-h-[40px] flex items-center justify-center gap-1 px-2.5 py-2 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-xs font-medium text-red-200 transition-colors whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>2m OBB</span>
                    </button>
                    <button
                      onClick={() => onSpawnBox('Green', [3, 3, 3])}
                      className="min-h-[40px] flex items-center justify-center gap-1 px-2.5 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-medium text-emerald-200 transition-colors whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>3m OBB</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={onSpawnParkourSteps}
                      className="min-h-[40px] flex-1 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
                    >
                      + Spawn Jump Stairs
                    </button>
                    <button
                      onClick={onResetBoxes}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-300 transition-colors whitespace-nowrap"
                      title="Restore PRD v2.0 6 OBB obstacles"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Reset 6 OBBs</span>
                    </button>
                  </div>
                </section>
              </>
            )}

            {activeTab === 'scene_graph' && (
              <div className="space-y-4">
                <div className="p-3.5 rounded-lg bg-white/5 border border-white/10 font-mono text-xs space-y-2">
                  <div className="text-slate-200 font-semibold">
                    scene (THREE.Scene · Bez mlhy / No Fog)
                  </div>
                  <div className="pl-3 space-y-1.5 text-slate-300 border-l border-white/10">
                    <div>
                      sky <span className="text-slate-500">(Preetham, scale 45000)</span>
                    </div>
                    <div>
                      sun <span className="text-slate-500">(DirectionalLight, 2048², PCFSoft)</span>
                    </div>
                    <div>
                      hemi + env <span className="text-slate-500">(PMREM RoomEnvironment)</span>
                    </div>
                    <div>
                      global_wind_particles{' '}
                      <span className="text-amber-300">
                        ({activeParticleCount} active · {params.windParticleStyle})
                      </span>
                    </div>
                    <div>
                      <span className="text-amber-300">map (THREE.Group)</span>
                      <div className="pl-3 mt-1 space-y-1 text-slate-400 border-l border-white/10">
                        <div>floor (r=500m, 1m grid tex, Layer WORLD 0x01)</div>
                        {boxes.map((b) => (
                          <div key={b.id} className="truncate">
                            {b.id} ({b.size.join('×')}m, {b.color}, yaw {b.rotationY.toFixed(3)})
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="text-amber-300">player (THREE.Group, world pos = feet)</span>
                      <div className="pl-3 mt-1 space-y-1.5 text-slate-300 border-l border-white/10">
                        <div>
                          capsuleVsOBB{' '}
                          <span className="text-slate-500">· R=0.3m, H=2.0m · Layer 0x02</span>
                        </div>
                        <div>
                          visuals (THREE.Group){' '}
                          <span className="text-amber-400 tabular-nums">
                            rot.y = {radToDeg(telemetry.visualsRotationY)}°
                          </span>
                          <div className="pl-3 mt-1 space-y-1 text-slate-400 border-l border-white/10">
                            {params.characterModelMode === 'mixamo_glb' ? (
                              <>
                                <div className="text-emerald-300">
                                  mixamo_base.glb (65 bones, 6 clips)
                                </div>
                                <div>
                                  AnimationMixer ·{' '}
                                  <span className="text-amber-300">
                                    {telemetry.currentAnimation}
                                  </span>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="text-emerald-300">
                                  capsule_v2 (PRD v2.0 Blockout)
                                </div>
                                <div>body (#d54d43) + head (#f0c9a0) + nose (#55201a)</div>
                              </>
                            )}
                          </div>
                        </div>
                        <div>
                          camMount (THREE.Group, y={params.cameraMountY.toFixed(3)}m){' '}
                          <span className="text-cyan-400 tabular-nums">
                            pitch = {radToDeg(telemetry.cameraPitchX)}°
                          </span>
                          <div className="pl-3 mt-1 text-slate-400 border-l border-white/10">
                            camera (PerspectiveCamera, FOV {telemetry.currentFov.toFixed(0)}°)
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'gdscript' && (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-400/30 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-display font-semibold text-amber-200">
                        Single-File AIO HTML Distribution (PRD v2.0)
                      </h3>
                      <p className="text-[11px] text-slate-300">
                        Zero-build standalone <code className="text-white">index.html</code> with CDN
                        importmap, ready for GitHub Pages.
                      </p>
                    </div>
                    <button
                      onClick={handleDownloadAioHtml}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-xs font-semibold text-slate-950 transition-colors whitespace-nowrap shrink-0"
                    >
                      <FileCode2 className="w-3.5 h-3.5" />
                      <span>Export index.html</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-mono">
                    res://scripts/player.gd (M14 Validated)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyGdScript}
                      className="min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleDownloadGdScript}
                      className="min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white transition-colors whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export .gd</span>
                    </button>
                  </div>
                </div>

                <pre className="p-3.5 rounded-lg bg-slate-900/90 border border-white/10 text-[11px] leading-relaxed font-mono text-slate-200 overflow-x-auto">
                  <code>{generateGdScript(params)}</code>
                </pre>
              </div>
            )}

            {activeTab === 'prd' && (
              <div className="space-y-4 text-xs leading-relaxed text-slate-300">
                <div className="p-3.5 rounded-lg bg-white/5 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-display font-semibold text-white">
                      PRD v2.0 / v2.1 — Executive Summary
                    </h3>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-[10px] font-mono text-emerald-300">
                      M0–M17 DONE
                    </span>
                  </div>
                  <p>
                    Port <code className="text-amber-300">MaximeCrp/third-person-controller-boilerplate</code>{' '}
                    (Godot 4.2) do WebGL 2 (Three.js). Scéna je vykreslena čistě <strong>bez mlhy</strong>{' '}
                    a obohacena o globální větrný částicový systém (poletující lístky a prachové
                    částice s nastavitelnou hustotou v Inspectoru).
                  </p>
                </div>

                <div className="p-3.5 rounded-lg bg-white/5 border border-white/10 space-y-2">
                  <h3 className="text-sm font-display font-semibold text-white">
                    Global Wind Particle System (Bez mlhy)
                  </h3>
                  <p>
                    Toroidní částicové pole (<code className="text-slate-100">36×9.5×36 m</code>)
                    kolem hráče generuje až <code className="text-amber-300">360</code> aktivních
                    částic (podzimní lístky s 3-osou rotací a sluncem nasvícené prachové částečky)
                    unášených globálním větrem s nastavitelnou hustotou{' '}
                    <code className="text-amber-300">wind_particle_density</code> a rychlostí{' '}
                    <code className="text-amber-300">wind_speed</code>.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg bg-white/5 border border-white/10 space-y-2">
                  <h3 className="text-sm font-display font-semibold text-white">
                    Kolize & Fyzika (capsuleVsOBB + MTD)
                  </h3>
                  <p>
                    Kapsle (<code className="text-slate-100">R=0.3m, H=2.0m</code>) je testována v
                    lokálním souřadném systému každého ze 6 OBB kvádrů (rotace{' '}
                    <code className="text-slate-100">-box.yaw</code>). Pomocí{' '}
                    <strong>Minimum Translation Distance (MTD)</strong> vrací typ{' '}
                    <code className="text-slate-100">top | bottom | side</code>.
                  </p>
                </div>
              </div>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};
