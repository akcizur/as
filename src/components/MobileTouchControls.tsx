import React, { useEffect, useRef, useState } from 'react';
import nipplejs from 'nipplejs';
import { motion } from 'motion/react';
import { ArrowUp, Footprints, Zap, ShieldAlert, Compass } from 'lucide-react';
import { AnimationName, JoystickMode } from '../types/controller';
import { audioManager } from '../utils/audioManager';

export interface TouchInputState {
  /** Normalized input vector [-1..1, -1..1] matching Input.get_vector("left", "right", "forward", "backward") */
  moveX: number;
  moveY: number;
  /** True when nipplejs thumbstick is pushed to outer sprint ring or Run Lock is active */
  isSprintActive: boolean;
  /** True on frame Jump button is pressed */
  jumpRequested: boolean;
  /** Live nipplejs vector angle in degrees */
  angleDeg: number;
  /** Live nipplejs force [0..1] */
  force: number;
}

interface MobileTouchControlsProps {
  touchInputRef: React.MutableRefObject<TouchInputState>;
  onCameraTouchDelta: (deltaX: number, deltaY: number) => void;
  onTriggerAnimation: (anim: AnimationName) => void;
  onTouchActivity: () => void;
  joystickMode: JoystickMode;
  visible: boolean;
}

export const MobileTouchControls: React.FC<MobileTouchControlsProps> = ({
  touchInputRef,
  onCameraTouchDelta,
  onTriggerAnimation,
  onTouchActivity,
  joystickMode,
  visible,
}) => {
  const leftZoneRef = useRef<HTMLDivElement | null>(null);
  const [sprintLocked, setSprintLocked] = useState(false);
  const [knockedDownToggle, setKnockedDownToggle] = useState(false);
  const [stickTelemetry, setStickTelemetry] = useState<{
    active: boolean;
    force: number;
    angle: number;
  }>({ active: false, force: 0, angle: 0 });

  const sprintLockedRef = useRef(sprintLocked);
  sprintLockedRef.current = sprintLocked;

  const touchActivityRef = useRef(onTouchActivity);
  touchActivityRef.current = onTouchActivity;

  const activeLookTouchIdRef = useRef<number | null>(null);
  const lastLookPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lookVelocityRef = useRef<{ vx: number; vy: number }>({ vx: 0, vy: 0 });

  // Sync sprintLocked state to touchInputRef
  useEffect(() => {
    touchInputRef.current.isSprintActive =
      sprintLocked || touchInputRef.current.force >= 0.78;
  }, [sprintLocked, touchInputRef]);

  // Initialize nipplejs virtual analog joystick on the left thumb zone
  useEffect(() => {
    if (!visible || !leftZoneRef.current) return;

    const zone = leftZoneRef.current;
    const manager = nipplejs.create({
      zone,
      mode: joystickMode,
      position: { left: '104px', bottom: '104px' },
      color: '#f59e0b',
      size: 124,
      threshold: 0.08,
      fadeTime: 180,
      multitouch: true,
      maxNumberOfNipples: 1,
      restOpacity: 0.78,
      catchDistance: 140,
    });

    manager.on('start', () => {
      audioManager.unlock();
      touchActivityRef.current();
      setStickTelemetry((prev) => ({ ...prev, active: true }));
    });

    manager.on('move', (_evt, data) => {
      if (!data || !data.vector) return;
      const clampedForce = Math.min(data.force || 0, 1.0);
      const vx = data.vector.x * clampedForce;
      const vy = -data.vector.y * clampedForce;

      touchInputRef.current.moveX = vx;
      touchInputRef.current.moveY = vy;
      touchInputRef.current.force = clampedForce;
      touchInputRef.current.angleDeg = data.angle?.degree ?? 0;
      touchInputRef.current.isSprintActive =
        sprintLockedRef.current || clampedForce >= 0.78;

      setStickTelemetry({
        active: true,
        force: clampedForce,
        angle: Math.round(data.angle?.degree ?? 0),
      });
    });

    manager.on('end', () => {
      touchInputRef.current.moveX = 0;
      touchInputRef.current.moveY = 0;
      touchInputRef.current.force = 0;
      touchInputRef.current.isSprintActive = sprintLockedRef.current;
      setStickTelemetry({ active: false, force: 0, angle: 0 });
    });

    return () => {
      manager.destroy();
      touchInputRef.current.moveX = 0;
      touchInputRef.current.moveY = 0;
      touchInputRef.current.force = 0;
    };
  }, [visible, joystickMode, touchInputRef]);

  // Smooth inertia decay for right-side touch camera look
  useEffect(() => {
    if (!visible) return;
    let rafId = 0;
    const tickInertia = () => {
      rafId = requestAnimationFrame(tickInertia);
      if (activeLookTouchIdRef.current === null) {
        const { vx, vy } = lookVelocityRef.current;
        if (Math.hypot(vx, vy) > 0.08) {
          onCameraTouchDelta(vx, vy);
          lookVelocityRef.current.vx *= 0.86;
          lookVelocityRef.current.vy *= 0.86;
        } else {
          lookVelocityRef.current.vx = 0;
          lookVelocityRef.current.vy = 0;
        }
      }
    };
    rafId = requestAnimationFrame(tickInertia);
    return () => cancelAnimationFrame(rafId);
  }, [visible, onCameraTouchDelta]);

  if (!visible) return null;

  const handleLookZoneTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    audioManager.unlock();
    touchActivityRef.current();
    if (activeLookTouchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    activeLookTouchIdRef.current = touch.identifier;
    lastLookPosRef.current = { x: touch.clientX, y: touch.clientY };
    lookVelocityRef.current = { vx: 0, vy: 0 };
  };

  const handleLookZoneTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === activeLookTouchIdRef.current) {
        const dx = t.clientX - lastLookPosRef.current.x;
        const dy = t.clientY - lastLookPosRef.current.y;
        lastLookPosRef.current = { x: t.clientX, y: t.clientY };
        const scaledDx = dx * 2.25;
        const scaledDy = dy * 2.25;
        lookVelocityRef.current = { vx: scaledDx * 0.45, vy: scaledDy * 0.45 };
        onCameraTouchDelta(scaledDx, scaledDy);
        break;
      }
    }
  };

  const handleLookZoneTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === activeLookTouchIdRef.current) {
        activeLookTouchIdRef.current = null;
        break;
      }
    }
  };

  const isSprintingNow = sprintLocked || stickTelemetry.force >= 0.78;

  return (
    <div className="absolute inset-0 z-10 pointer-events-none select-none overflow-hidden">
      {/* Left Half Touch Zone powered by nipplejs */}
      <div
        ref={leftZoneRef}
        className="absolute top-14 left-0 bottom-0 w-1/2 pointer-events-auto touch-none"
        aria-label="Left thumbstick zone"
      >
        <div
          style={{ left: '104px', bottom: '104px' }}
          className={`pointer-events-none absolute -translate-x-1/2 translate-y-1/2 w-34 h-34 rounded-full border transition-all duration-200 flex items-center justify-center ${
            stickTelemetry.active
              ? isSprintingNow
                ? 'border-amber-400/70 bg-amber-500/10 scale-105'
                : 'border-white/30 bg-slate-950/35'
              : 'border-white/15 bg-slate-950/25'
          }`}
        >
          <div className="w-24 h-24 rounded-full border border-dashed border-white/15 flex items-center justify-center">
            {!stickTelemetry.active && (
              <div className="flex flex-col items-center text-white/45">
                <Compass className="w-4 h-4 mb-0.5 text-amber-400/70" />
                <span className="text-[10px] font-mono tracking-tight">STICK</span>
              </div>
            )}
          </div>
          <span className="absolute -top-5 text-[10px] font-mono tabular-nums text-slate-300/80">
            {stickTelemetry.active
              ? `${Math.round(stickTelemetry.force * 100)}% · ${isSprintingNow ? 'RUN' : 'WALK'}`
              : 'Left Thumb: Move'}
          </span>
        </div>
      </div>

      {/* Right Half Touch LookPad for Camera Orbit with Inertia */}
      <div
        className="absolute top-14 right-0 bottom-0 w-1/2 pointer-events-auto touch-none"
        onTouchStart={handleLookZoneTouchStart}
        onTouchMove={handleLookZoneTouchMove}
        onTouchEnd={handleLookZoneTouchEnd}
        onTouchCancel={handleLookZoneTouchEnd}
      >
        <div className="pointer-events-none absolute bottom-48 right-8 text-[10px] font-mono text-slate-300/60 hidden sm:block">
          Right Thumb: Swipe to Orbit
        </div>
      </div>

      {/* Right-Thumb Ergonomic Arcade Action Cluster */}
      <div className="pointer-events-auto touch-none absolute bottom-6 right-5 sm:bottom-8 sm:right-8 flex items-end gap-3.5">
        <div className="flex flex-col gap-3 pb-1">
          <motion.button
            type="button"
            whileTap={{ scale: 0.88 }}
            onTouchStart={(e) => {
              e.stopPropagation();
              e.preventDefault();
              audioManager.unlock();
              touchActivityRef.current();
              const nextState = !knockedDownToggle;
              setKnockedDownToggle(nextState);
              onTriggerAnimation(nextState ? 'knock_down' : 'get_up');
            }}
            onClick={() => {
              audioManager.unlock();
              const nextState = !knockedDownToggle;
              setKnockedDownToggle(nextState);
              onTriggerAnimation(nextState ? 'knock_down' : 'get_up');
            }}
            className="w-13 h-13 min-w-[52px] min-h-[52px] rounded-2xl bg-slate-950/75 hover:bg-slate-900/90 backdrop-blur-md border border-white/20 shadow-lg flex flex-col items-center justify-center text-slate-100"
            aria-label={knockedDownToggle ? 'Get Up' : 'Knock Down'}
          >
            <ShieldAlert className="w-4 h-4 text-cyan-400" />
            <span className="text-[10px] font-mono font-medium mt-0.5 whitespace-nowrap">
              {knockedDownToggle ? 'Get Up' : 'Fall'}
            </span>
          </motion.button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.88 }}
            onTouchStart={(e) => {
              e.stopPropagation();
              e.preventDefault();
              audioManager.unlock();
              touchActivityRef.current();
              onTriggerAnimation('kick');
            }}
            onClick={() => {
              audioManager.unlock();
              onTriggerAnimation('kick');
            }}
            className="w-14 h-14 min-w-[56px] min-h-[56px] rounded-2xl bg-slate-950/75 hover:bg-slate-900/90 backdrop-blur-md border border-white/20 shadow-lg flex flex-col items-center justify-center text-slate-100"
            aria-label="Kick attack"
          >
            <Zap className="w-4 h-4 text-amber-400" />
            <span className="text-[10px] font-mono font-semibold mt-0.5 whitespace-nowrap">
              Kick
            </span>
          </motion.button>
        </div>

        <div className="flex flex-col items-center gap-3">
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onTouchStart={(e) => {
              e.stopPropagation();
              e.preventDefault();
              audioManager.unlock();
              touchActivityRef.current();
              setSprintLocked((prev) => !prev);
            }}
            onClick={() => {
              audioManager.unlock();
              setSprintLocked((prev) => !prev);
            }}
            className={`w-14 h-14 min-w-[56px] min-h-[56px] rounded-2xl backdrop-blur-md border shadow-lg flex flex-col items-center justify-center transition-colors ${
              sprintLocked
                ? 'bg-amber-400 text-slate-950 border-white font-semibold shadow-amber-500/25'
                : 'bg-slate-950/75 text-slate-100 border-white/20 hover:bg-slate-900/90'
            }`}
            aria-label="Toggle Sprint"
          >
            <Footprints className="w-4 h-4" />
            <span className="text-[10px] font-mono font-semibold mt-0.5 whitespace-nowrap">
              {sprintLocked ? 'Sprint' : 'Walk'}
            </span>
          </motion.button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.88 }}
            onTouchStart={(e) => {
              e.stopPropagation();
              e.preventDefault();
              audioManager.unlock();
              touchActivityRef.current();
              touchInputRef.current.jumpRequested = true;
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              audioManager.unlock();
              touchInputRef.current.jumpRequested = true;
            }}
            className="w-18 h-18 min-w-[72px] min-h-[72px] rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 border-2 border-white shadow-2xl shadow-amber-500/30 flex flex-col items-center justify-center"
            aria-label="Jump"
          >
            <ArrowUp className="w-6 h-6 stroke-[2.75]" />
            <span className="text-xs font-display font-bold tracking-tight">JUMP</span>
          </motion.button>
        </div>
      </div>
    </div>
  );
};
