# Third-person runtime controller

This file documents the live Godot controller used by the GitHub Pages build.

## Runtime ownership

- `godot/scripts/player_controller.gd` owns player movement, camera input, locomotion animation selection, respawn triggers, and controller telemetry.
- The player is a `CharacterBody3D`; collision is handled by an invisible 1.8 m capsule. The rendered character is loaded from `res://assets/models/mixamo_base.glb`.
- The model asset is already tracked under `public/assets/models/`; the Godot project references the same Git blob at `godot/assets/models/mixamo_base.glb`, so there is no second copy of the binary data in Git history.
- `godot/scripts/main.gd` remains responsible for world generation, interactables, checkpointing, weather, crates, and reset.
- `godot/scripts/hud.gd` consumes the telemetry signal; it does not run player physics.

## Locomotion behavior

- Input is camera-relative; forward follows the camera's horizontal yaw.
- Ground acceleration and braking are separate from air control. The horizontal velocity is moved toward a target vector to give movement starts and direction changes some inertia.
- Visual yaw eases toward the requested direction instead of snapping.
- Animation names expected from the GLB are `idle`, `walking`, and `running`; `jump` and `fall` are optional.
- Animation transitions blend over 0.18 seconds.
- The orbit camera clamps vertical pitch, lerps toward its target distance, shortens on a ray hit, and clamps its world-space Y to at least 0.35 m.

## Controls

| Action | Input |
| --- | --- |
| Move | W A S D / arrow keys |
| Look | Left mouse click to capture; mouse to orbit |
| Release cursor | Escape |
| Sprint | Hold Shift |
| Jump | Space |
| Interact | E near an interactable |
| Spawn a physics crate | B |
| Reset sandbox | R |

## Tuning

The exported settings at the top of `player_controller.gd` are the tuning surface. Prefer adjusting speed, acceleration, braking, air control, jump velocity, turn smoothing, sensitivity, and camera pitch limits before adding more controller states.

The Godot Web export workflow is the production runtime. The retained React/Three.js implementation under `src/` is a separate legacy prototype, not the deployed Pages build.
