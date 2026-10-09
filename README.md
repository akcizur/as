# Openworld Simulation v2.1

**A playable third-person open-world sandbox built in Godot 4.6.1.** The primary runtime is a 3D game, not an editor or scene-builder UI.

## v2.1 runtime

- Third-person CharacterBody3D controller with acceleration, jumping, sprinting, and mouse-orbit camera.
- Procedurally assembled outdoor frontier with distant ridges, forest clusters, rocks, trails, an outpost, and supply pads.
- Physically collidable terrain, trees, props, and spawned rigid-body crates.
- Interactable supply caches, weather relay, and checkpoint beacon.
- Daylight drift, atmosphere/fog toggle, checkpoint respawn, and full sandbox reset.
- Minimal in-world HUD with FPS, speed, position, objective, interaction prompt, and keyboard hints.
- Godot Compatibility renderer, targeting WebGL 2.0 for the browser build.

## Controls

| Action | Input |
| --- | --- |
| Move | W A S D or arrow keys |
| Look around | Click the game, then move mouse |
| Release mouse | Esc |
| Sprint | Hold Shift |
| Jump | Space |
| Interact | E near a cache, relay, or beacon |
| Spawn a physics crate | B |
| Reset sandbox/player | R |

The web version uses a single-threaded Godot export for broad hosting compatibility. It does not need SharedArrayBuffer cross-origin isolation headers. Browser support requires WebAssembly and WebGL 2.0.

## Open the Godot project

Install **Godot 4.6.1 Standard** and its matching export templates. Open godot/project.godot in the Godot editor.

From the repository root:

- **bun run dev** — run the game in Godot.
- **bun run editor:game** — open the Godot editor for project development.
- **bun run build** — export a Web build to dist/.
- **bun run lint** — run a headless Godot project scan.
- **bun run dev:prototype** — launch the retained legacy React/Three.js prototype.
- **bun run build:prototype** — build that legacy prototype separately.

The React/Three.js implementation in src/ is retained as a reference prototype; it is not the v2.1 Pages runtime.

## Automatic GitHub Pages deployment

Every push to main and manual workflow dispatch runs the deployment workflow. GitHub Actions installs Godot 4.6.1 plus Web export templates, scans and launches the project headlessly, exports the project in godot/ to dist/, checks that the HTML, WebAssembly, and PCK payload exist, then publishes dist/ using the GitHub Pages deployment artifact workflow.

Live game: https://akcizur.github.io/as/

If Pages has not been configured for this repository yet, select **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Scope

v2.1 is focused on the playable open-world sandbox runtime. There is no in-game scene editor, code export panel, editor mode, or editor-first landing experience. New work should deepen traversal, world interaction, physics, atmosphere, and actual gameplay systems.
