# Openworld Simulation v2.3

**A playable third-person open-world sandbox built with Godot 4.6.1 and deployed to GitHub Pages.** The browser build is exported to WebAssembly using the Godot Compatibility renderer (WebGL 2.0).

## Runtime

- Third-person player rendered with the repository's animated Mixamo GLB model.
- Invisible `CharacterBody3D` capsule for reliable character collision; visuals and physics remain separate.
- Character-relative locomotion with acceleration, braking, air control, sprinting, and jumping.
- Runtime AnimationTree and BlendSpace2D library with optional start/stop transitions, turn-in-place, 180-degree turn, directional dodge, crouch locomotion, aim locomotion, and upper-body aiming layers. Special transitions require matching clips in the model.
- Crouch adjusts the physical collision capsule and checks overhead clearance before standing.
- Root-motion extraction support for rigs with root/hips translation tracks. It is opt-in: configure `use_root_motion` and, when needed, `root_motion_track` in `godot/scripts/player_controller.gd`.
- Keyboard/mouse, multitouch joystick/look/action buttons, and gamepad movement plus right-stick camera control.
- Orbit camera pitch limits, collision raycast, smooth camera recovery, and a hard world-space floor guard.
- Procedurally assembled frontier with hills, forest clusters, rocks, trails, an outpost, and supply pads.
- Collidable terrain, trees, props, and spawned rigid-body crates.
- Interactable supply caches, weather relay, and checkpoint beacon.
- Daylight drift, atmosphere/fog toggle, checkpoint respawn, and full sandbox reset.
- Minimal objective/resource HUD that fades after inactivity; interaction prompts and notifications are contextual.
- Touch controls fade to near-transparent when idle and reappear on touch.

## Controls

| Action | Input |
| --- | --- |
| Move | W A S D or arrow keys |
| Look around | Click the game, then move mouse |
| Release mouse | Esc |
| Sprint | Hold Shift |
| Jump | Space |
| Toggle crouch | C or Ctrl |
| Aim | Hold right mouse button / gamepad left trigger |
| Directional dodge | Q / gamepad left shoulder |
| Turn around 180° | X / gamepad right-stick click |
| Interact | E near a cache, relay, or beacon |
| Spawn a physics crate | B |
| Reset sandbox/player | R |

### Automatic device input

The game accepts devices without a settings menu. Keyboard and mouse actions are active by default; connected gamepads are read through Godot's InputMap and the most responsive connected controller drives right-stick camera look. Touch controls start automatically on touchscreen devices. The ambient HUD reappears on input and fades after inactivity.

| Action | Standard gamepad mapping |
| --- | --- |
| Move / look | Left stick / right stick |
| Jump / interact / spawn | A / X / B |
| Sprint / dodge | Right shoulder (RB) / left shoulder (LB) |
| Aim / crouch | Left trigger (LT) / left-stick click (L3) |
| Turn around 180° / reset | Right-stick click (R3) / Y |

On touch devices, use the left virtual joystick to move, drag on the right side to look, and use the action buttons. Multiple fingers are supported.

The web version uses a single-threaded Godot export for broad hosting compatibility and does not require `SharedArrayBuffer` cross-origin isolation headers. Browser support requires WebAssembly and WebGL 2.0.

## Open the Godot project

Install **Godot 4.6.1 Standard** and its matching export templates. Open `godot/project.godot` in the Godot editor.

From the repository root:

- **`bun run dev`** — run the game in Godot.
- **`bun run editor:game`** — open the Godot editor for project development.
- **`bun run build`** — export the project in `godot/` to `dist/`.
- **`bun run lint`** — scan the Godot project headlessly.
- **`bun run dev:prototype`** — launch the retained React/Three.js prototype.
- **`bun run build:prototype`** — build the legacy prototype separately.
- **`godot/CONTROLLER.md`** — controller architecture, collision rules, and tuning controls.
- **`godot/MOTION_LIBRARY.md`** — animation aliases, transition states, upper-body layers, and root-motion setup.
- **`godot/GAMEPLAY_UI.md`** — minimal gameplay UI behavior.

## Automatic GitHub Pages deployment

Every push to `main` and manual workflow dispatch runs the deployment workflow. GitHub Actions installs Godot 4.6.1 plus matching Web export templates, scans and smoke-tests the game, exports it to `dist/`, checks for the HTML, WebAssembly, and PCK payload, and publishes the artifact through GitHub Pages.

Live game: https://akcizur.github.io/as/

If Pages has not been configured for this repository yet, select **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Pre-release builds

Push a tag such as `v2.4.0-beta.1`, `v2.4.0-alpha.1`, or `v2.4.0-rc.1` to create a GitHub pre-release. The workflow imports and smoke-tests the Godot project, performs a clean Web export, validates the generated files, and attaches a ZIP of the playable browser build plus a SHA-256 checksum file to the pre-release. The Pages deployment remains independent of release packaging.

## Controller reference

The third-person controller's design is inspired by [MaximeCrp/third-person-controller-boilerplate](https://github.com/MaximeCrp/third-person-controller-boilerplate), particularly its Mixamo animation workflow, smooth visual rotation, and bounded orbit camera. The referenced project is not copied wholesale.

## Runtime boundaries

The Godot project is the production GitHub Pages runtime. The React/Three.js implementation in `src/` is retained as a separate prototype and is not the deployed game. New gameplay systems should integrate with `godot/scripts/main.gd` for world actions or the player's telemetry signal for UI updates instead of coupling UI code to the physics loop.
