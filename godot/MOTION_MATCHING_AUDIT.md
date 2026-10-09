# Motion Matching — implementation audit

**Repository:** `akcizur/as`  
**Audit target:** Godot 4.6.1, Compatibility renderer, GitHub Pages/WebAssembly production build  
**Scope:** read-only source audit and upstream implementation review. No gameplay code or assets changed.

## Decision

Do not replace the live controller or add a native extension to the production project yet. First build an isolated, feature-flagged proof of concept and prove the complete pipeline on the exact Godot 4.6.1 toolchain.

The best upstream candidate to evaluate first is [GuilhermeGSousa/godot-motion-matching](https://github.com/GuilhermeGSousa/godot-motion-matching). It is MIT-licensed, explicitly implements Motion Matching for Godot 4.4, integrates with `AnimationTree`, and documents a pose-feature database. However, compatibility with Godot 4.6.1, its build process in this repository, and the project's WebAssembly export have **not** been verified. Treat it as a candidate, not a drop-in dependency.

[Remi123/MotionMatching](https://github.com/Remi123/MotionMatching) is not the preferred first integration: its README targets Godot 4.2, describes the Motion Matching library/features as work in progress, and notes missing documentation and limitations in the animation player.

## Current project findings

- The production runtime is the Godot project at `godot/`; `src/` is a separate legacy React/Three.js prototype.
- `godot/scripts/player_controller.gd` owns `CharacterBody3D` locomotion, camera input, collision capsule, dodge, turn, and telemetry.
- `godot/scripts/character_motion_library.gd` constructs an `AnimationTree` with `AnimationNodeStateMachine` and `AnimationNodeBlendSpace2D` at runtime. It discovers clips by aliases and falls back when specialized clips are missing.
- Root motion is opt-in. The current controller/library combination is state/BlendSpace driven; it does not perform pose-database search or trajectory-cost matching.
- `godot/MOTION_LIBRARY.md` explicitly warns that root motion should remain disabled for in-place clips.
- The existing controller, world, HUD and web export should remain untouched until the isolated prototype passes the validation gates below.

## Compatibility and data risks

1. **Native extension / export:** the preferred upstream candidate includes C++ source and a Godot C++ binding dependency. A compatible extension binary must be built for each target. A desktop build alone does not prove that the GitHub Pages WebAssembly build can load it.
2. **Engine version:** upstream documents Godot 4.4, while this project targets 4.6.1. Compile and runtime compatibility must be established rather than assumed.
3. **Animation data:** the upstream approach requires animation data with root motion and a suitable root bone at foot level. The current Mixamo asset's actual clip list, root-bone structure, and horizontal root displacement still need direct inspection in Godot.
4. **Character movement ownership:** only one system may author world displacement at a time. Motion Matching root displacement must be resolved through `CharacterBody3D.move_and_slide()`; avoid combining it with a second independent velocity controller for the same axis.
5. **Dataset quality:** a useful database needs sufficiently varied, correctly retargeted clips (start, stop, acceleration, deceleration, strafe, turns and direction changes), consistent skeleton/root conventions, and feature preprocessing. An idle/walk/run-only set is not enough to demonstrate robust GTA-like direction changes.
6. **Web performance:** profile feature search and animation evaluation on the WebAssembly build as well as native desktop. Keep the existing fallback available if the extension is unsupported or too costly.

## Recommended implementation sequence

### Gate 1 — inspect the actual animation asset
- Open `godot/assets/models/mixamo_base.glb` in Godot 4.6.1.
- Record exact animation names, skeleton hierarchy, root/hips tracks, clip lengths, loop flags, and whether walk/run clips contain meaningful horizontal root travel.
- Confirm license and provenance for every additional animation used in the dataset.
- Do not enable root motion globally.

### Gate 2 — isolated native prototype
- Create a separate test scene and a separate controller adapter; do not replace `player_controller.gd`.
- Build or import the candidate extension against Godot 4.6.1.
- Use a small, known-good root-motion dataset and verify pose matching, transitions, foot contact, turning, braking and collision.
- Keep the current BlendSpace controller as the fallback.

### Gate 3 — production-target compatibility
- Build the exact extension for the WebAssembly export target, or establish that the chosen implementation can be ported to a script-only/runtime-supported solution.
- Run the real exported game in a browser; verify no extension load errors, correct input, collision, stable frame time and acceptable memory.
- Native success does not pass this gate.

### Gate 4 — integrate behind a feature flag
- Add an explicit controller mode switch (legacy BlendSpace / Motion Matching) with the current mode as default.
- Keep movement, collision, camera and telemetry contracts stable.
- Compare native and web results; only switch the default after all tests pass.

## Acceptance criteria

- Project imports and runs on Godot 4.6.1 without parse, extension-load or animation-track errors.
- No character drift at idle; starts, stops, strafes and direction reversals look coherent.
- Root motion is consumed exactly once and collision remains authoritative.
- Feet remain grounded; jumps and falls retain gravity and floor snapping.
- Camera and touch/gamepad/keyboard controls remain functional.
- GitHub Pages export loads and runs in a browser with no missing extension binaries.
- The fallback controller still works if Motion Matching is disabled.

## Sources

- [Godot 4.6 — Using AnimationTree](https://docs.godotengine.org/en/4.6/tutorials/animation/animation_tree.html): AnimationTree uses AnimationPlayer data and supports root-motion extraction.
- [GuilhermeGSousa/godot-motion-matching](https://github.com/GuilhermeGSousa/godot-motion-matching): MIT-licensed Motion Matching extension documented for Godot 4.4; requires root-motion animation data and a root bone at foot level.
- [Remi123/MotionMatching](https://github.com/Remi123/MotionMatching): older Godot 4.2 implementation; README marks its feature/database resources as work in progress.
