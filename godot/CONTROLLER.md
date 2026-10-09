# Third-person runtime controller

This file documents the live Godot controller used by the GitHub Pages build.

## Runtime ownership

- `godot/scripts/player_controller.gd` owns movement, crouch collision sizing, dodge impulses, the 180-degree turn, camera input, animation state updates, respawn triggers, and telemetry.
- The player is a `CharacterBody3D`; collision is handled by an invisible 1.8 m capsule. The rendered character is loaded from `res://assets/models/mixamo_base.glb`.
- The model asset is already tracked under `public/assets/models/`; the Godot project references the same Git blob at `godot/assets/models/mixamo_base.glb`, so there is no second copy of the binary data in Git history.
- `godot/scripts/main.gd` remains responsible for world generation, interactables, checkpointing, weather, crates, and reset.
- `godot/scripts/hud.gd` consumes the telemetry signal; it does not run player physics.

## Locomotion behavior

- WASD/arrows and gamepad left-stick movement are character-relative. Mouse look and the right stick on the most active connected controller rotate the player root; the model counter-rotates for camera look, then smoothly faces movement.
- Keyboard/mouse, gamepad, and touch can be used without a mode selector. The controller records the last active source for HUD telemetry. Touch movement is combined with hardware movement and clamped to unit length; action inputs remain shared through Godot's InputMap.
- Touch overlays are visible when the runtime reports a touchscreen and reveal automatically on the first detected touch otherwise. The left virtual stick handles movement, right side handles look, and action buttons can be pressed with multiple fingers.
- Ground acceleration, braking, and air control are separate. Direction changes and movement starts no longer snap instantly.
- Crouch toggles the invisible capsule from 1.8 m to 1.18 m and checks overhead clearance before restoring standing height.
- The motion library builds AnimationTree + BlendSpace2D at runtime and discovers Mixamo animation aliases automatically. Missing specialized clips are optional and do not prevent regular locomotion.
- Optional one-shot states include walk/run start-stop, turn-in-place, 180-degree turn, jump, fall, landing, and directional dodge. Aim/crouch BlendSpace2D states and an upper-body filtered overlay are created only if compatible clips and upper-body tracks are available.
- Root-motion extraction is available for animations with actual horizontal translation on a root/hips bone. It is disabled by default because in-place Mixamo clips should be driven by the controller; enable `use_root_motion` and set `root_motion_track` when the source rig supports it.
- The orbit camera clamps vertical pitch, lerps toward target distance, shortens on a ray hit, and clamps world-space Y to at least 0.35 m.

## Controls

| Action | Input |
| --- | --- |
| Move | W A S D / arrow keys |
| Look | Left mouse click to capture; mouse to orbit |
| Release cursor | Escape |
| Sprint | Hold Shift |
| Jump | Space |
| Toggle crouch | C or Ctrl |
| Aim | Hold right mouse button / gamepad left trigger |
| Directional dodge | Q / gamepad left shoulder |
| Turn around 180° | X / gamepad right-stick click |
| Interact | E near an interactable |
| Spawn a physics crate | B |
| Reset sandbox | R |

| Action | Standard gamepad mapping |
| --- | --- |
| Move / look | Left stick / right stick |
| Jump / interact / spawn crate | A / X / B |
| Sprint / dodge | Right shoulder (RB) / left shoulder (LB) |
| Aim / crouch | Left trigger (LT) / left-stick click (L3) |
| Turn around 180° / reset | Right-stick click (R3) / Y |

## Tuning

The exported settings at the top of `player_controller.gd` tune speeds, acceleration, braking, dodge distance, 180-degree turn duration, and camera behavior. See `godot/MOTION_LIBRARY.md` for supported clip aliases, state transitions, upper-body layering, and root motion.

The Godot Web export workflow is the production runtime. The retained React/Three.js implementation under `src/` is a separate legacy prototype, not the deployed Pages build.
