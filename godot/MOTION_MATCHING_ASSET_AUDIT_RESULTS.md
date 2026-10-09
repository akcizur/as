# Motion Matching asset and compatibility audit

Audit run: GitHub Actions, Godot 4.6.1 stable, commit `61fce4d5e41bbe8db3e40919b1936c9f6d1bc67c` (PR merge test ref).

## Automated project checks

- Godot 4.6.1 headless project import: passed.
- Mixamo asset audit script: passed.
- Existing runtime headless smoke test: passed.
- Web export via `node scripts/build-web.mjs`: passed.
- Export artifacts `index.html`, `.wasm`, and `.pck`: present.
- This validates the existing project and the isolated audit harness; it does not prove that a third-party Motion Matching extension works in this project.

## Imported animation data

The imported `res://assets/models/mixamo_base.glb` exposes one AnimationPlayer with six clips:

| Clip | Duration | Imported loop mode | Hips position endpoint delta |
|---|---:|---|---:|
| `get_up` | 2.717 s | None | ~83.72 |
| `idle` | 8.350 s | None | ~0.00002 |
| `kick` | 1.600 s | None | ~0.00125 |
| `knock_down` | 2.517 s | None | ~79.47 |
| `running` | 0.717 s | None | ~0.000008 |
| `walking` | 0.967 s | None | ~0.000016 |

The skeleton has 65 bones and its root bone is `mixamorig_Hips`.

### Interpretation and cautions

- `idle`, `kick`, `running`, and `walking` have nearly unchanged Hips position at the clip endpoints. The imported position-track endpoints alone do not establish that the clips contain suitable root motion.
- `get_up` and `knock_down` have large Hips endpoint deltas. These values need visual/editor verification for coordinate convention, scale, and whether displacement is intentional before they can be used for locomotion.
- All six clips imported with loop mode `None`; running/walking loop behavior must be configured and verified before any matching database is baked.
- The extension expects animations with root motion and a root bone at foot level. The current skeleton root is Hips, so the asset is not yet confirmed ready for Motion Matching. Do not enable root motion on the production controller based on this automated report alone.

## Candidate extension

Candidate: [GuilhermeGSousa/godot-motion-matching](https://github.com/GuilhermeGSousa/godot-motion-matching), MIT licensed. Its current README describes it as a Godot 4.4 implementation, while its extension manifest declares minimum compatibility 4.4. Its repository contains Web/WASM entries in the GDExtension manifest and a CI matrix that builds Web debug artifacts, but prebuilt binaries are not committed to the repository tree and the inspected workflow has Web release builds commented out.

Godot's default Web export templates do not include GDExtension support. A Web build therefore requires compatible extension binaries and custom Web export templates with extension support. A successful ordinary Web export does **not** prove that this plugin will run on GitHub Pages.

## Decision / next gate

1. Keep the existing player controller as the production default.
2. In the isolated lab, inspect the imported clips visually and determine whether usable root motion can be extracted or whether a root-motion preprocessing step is required.
3. Build/test the extension for Godot 4.6.1 natively, then separately validate its Web/WASM binary and custom export template.
4. Only after both native and Web tests pass, add a runtime switch between the existing controller and the Motion Matching prototype.

No third-party extension has been installed, and no production controller or root-motion setting was changed by this audit.
