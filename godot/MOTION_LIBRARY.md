# Character Motion Library

The runtime library lives in godot/scripts/character_motion_library.gd and is attached by player_controller.gd. It uses an AnimationTree driven by the AnimationPlayer embedded in the imported Mixamo model. No editor-authored AnimationTree resource is required.

## Supported behavior

- Locomotion blend: idle, walk, run, plus optional back and side clips.
- Start/stop one-shots: walk start, walk stop, sprint start, sprint stop.
- Turns: turn-in-place left/right and a 180-degree turn. The 180-degree controller action rotates the player root over a short eased interval, with an animation when available.
- Air states: jump, fall, landing.
- Crouch: optional crouched idle/walk/back/side blend space; the controller also changes capsule height even when the model has no crouch animation.
- Aim: optional aim idle/walk/run/back/side blend space.
- Upper-body layer: a filtered AnimationNodeBlend2 overlay when the model contains an aim pose and the skeleton exposes recognizable spine/neck/head/arm/hand tracks.
- Directional dodge: a collision-respecting lateral/forward/backward impulse with matching dodge clip when available.
- Root motion: position deltas are extracted from an explicitly configured or auto-detected root/hips position track and fed back into the CharacterBody3D.

Specialized states are conditional on animation clips. When a clip is absent, the corresponding animation transition is skipped; controller actions such as dodge movement and crouch collision still work. A model with only in-place idle/walk/run should keep root motion disabled.

## Animation name aliases

Names are lowercased, and Mixamo prefixes, armature separators, spaces, punctuation, and underscores are ignored before lookup.

| Semantic action | Recognized name examples |
| --- | --- |
| Idle | Idle, Standing, Stand, Breathing Idle |
| Walk | Walk, Walking, Walk Forward, Walk Loop |
| Run/sprint | Run, Running, Sprint, Sprinting |
| Backward movement | Walk Back, Walk Backward, Run Back |
| Side movement | Walk Left/Right, Strafe Left/Right, Run Left/Right |
| Walk start/stop | Walk Start, Start Walk, Walk Stop, Stop Walk |
| Sprint start/stop | Run Start, Sprint Start, Run Stop, Sprint Stop |
| Turns | Turn Left/Right, Turn In Place Left/Right, Turn 180, Turn Around |
| Air states | Jump, Jump Start, Fall, Falling, Land, Landing |
| Crouch | Crouch, Crouch Idle, Crouch Walk, Crouch Back, Crouch Left/Right |
| Aim | Aim, Aim Idle, Aim Walk, Aim Run, Aim Back, Aim Left/Right |
| Dodge | Dodge, Dodge Forward/Back/Left/Right, Roll, Roll Forward/Back/Left/Right |
| Upper-body actions | Shoot, Fire, Reload, Aim Pose, Aim Upper Body |

The matching rules are deliberately tolerant, but animation naming is not fully standardized across asset packs. After importing a new rig, use Godot's AnimationPlayer panel to verify the actual clip names. If a clip has an unfamiliar name, add its normalized alias in _semantic_name().

## Input mapping

- Shift: sprint; the library can play sprint-start/stop transitions when matching clips exist.
- C or Ctrl: toggle crouch.
- Hold right mouse button / gamepad left trigger: aim.
- Q / gamepad left shoulder: directional dodge based on current movement input; if no direction is held, dodge forward.
- X / gamepad right-stick click: rotate the character 180 degrees.
- Mouse movement while idle can request a turn-in-place clip when a matching left/right animation exists.
- Touch screens receive a left virtual joystick, right-side look area, and action buttons.

## Upper-body filter

The library gathers animation track paths whose bone names match spine, neck, head, shoulder, clavicle, arm, forearm, elbow, wrist, hand, finger, chest, or torso. The upper-body blend is only built if both an aim/action pose and filterable tracks are present. This avoids accidentally overlaying a full-body animation over the base locomotion.

The runtime API supports setting the aim weight and switching the overlay clip through set_aiming() and set_upper_body_animation(). Future weapon actions should call this API instead of adding weapon animation logic to the physics loop.

## Root motion setup

Root motion is opt-in. The default Mixamo animation packs are frequently authored in-place, and applying their hip bob as world movement makes character control unstable.

1. Confirm that walk/run animation position tracks contain horizontal travel on the actual root or hips bone.
2. In player_controller.gd set use_root_motion to true.
3. If automatic detection does not pick the correct bone, set root_motion_track to the exact Animation track path on the imported rig, for example the Skeleton3D bone path exposed by the AnimationPlayer.
4. Run a local Godot test and verify that the character moves with the animation, collides with walls, and does not drift when idle. If it drifts, disable root motion or choose the correct track.

Root-motion Y is intentionally ignored by the controller so gravity and floor snapping remain authoritative. The extracted horizontal delta is still resolved by CharacterBody3D.move_and_slide() against the level's collision geometry.

## Validation checklist

- Game boots without script parse errors in the headless workflow.
- Idle and forward locomotion remain available if special clips are missing.
- Starting/stopping does not leave the state machine stuck on a one-shot node.
- Jump transitions to fall, then landing, without forcing locomotion while still airborne.
- Crouch capsule follows the character feet and cannot stand up into an overhead collider.
- Dodge cannot teleport through walls because velocity goes through move_and_slide().
- Camera world Y remains clamped above the ground.
- Root motion is off unless a useful horizontal root track has been confirmed.
