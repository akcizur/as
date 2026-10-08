# Openworld Simulation v2.1

A browser-based third-person **open-world sandbox simulation** built with React, Three.js, and Vite. The project is a playable real-time runtime, not a scene editor.

## Runtime focus

- Third-person movement, sprinting, jumping, camera orbit, and character animation states.
- Real-time world traversal with collidable sandbox props and a minimap.
- Dynamic atmosphere controls for wind particles, lighting, and bloom.
- Adaptive keyboard/mouse, gamepad, and touch controls.
- Compact runtime telemetry for FPS, movement state, surface, and input mode.
- Simulation settings persist locally in the browser.

## Controls

| Action | Keyboard / mouse |
| --- | --- |
| Move | `WASD` or arrow keys |
| Sprint | Hold `Shift` |
| Jump | `Space` |
| Character actions | `F` / `K` / `G` |
| Orbit camera | Drag the mouse |
| Immersive camera control | Select **Enter World** to capture the pointer; press `Esc` to release |

Gamepad controls are detected automatically. Touch devices receive an on-screen dual-stick controller.

## Development

Requires Bun.

```sh
bun install
bun run dev
bun run lint
bun run build
```

## GitHub Pages

Pushes to `main` build the static app and deploy `dist/` through GitHub Actions. The Vite base path is `/as/` in the Actions environment and remains `/` for local development.

## Scope of v2.1

v2.1 prioritizes the **playable sandbox runtime**: movement, camera feel, world traversal, environmental motion, player feedback, and quick simulation tuning. Editor-oriented screens such as scene graph browsing, code export, and requirements documentation are intentionally not part of the user-facing experience.
