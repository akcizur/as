# Minimal gameplay UI

The production HUD prioritizes the game world and fades away when the player is inactive.

## Runtime behavior

- The ambient HUD contains only the current objective, collected parts, and a faint center reticle.
- Keyboard, mouse, touch, and gamepad activity reveal the ambient HUD.
- After 4 seconds without activity, the ambient HUD fades out over approximately 0.65 seconds.
- Movement keeps the HUD awake even when a key remains held without generating new input events.
- The interaction prompt is shown only when an interactable is in range; it remains contextual rather than being part of the fading ambient HUD.
- Notifications remain visible briefly after an interaction or world event.
- Touch controls fade to near-transparent after 4 seconds of inactivity and reappear on the next touch. Their input zones remain active while transparent.

## Separation

The behavior lives in `hud.gd` and `touch_controls.gd`. It does not change the player controller's movement, collision, animation, camera, or physics behavior.

## Visual rules

- No permanent FPS/position telemetry.
- No large panels, persistent control legends, or decorative frames.
- Only short, low-contrast labels and context-sensitive prompts.
- Fade behavior is presentation-only; it must not pause or alter gameplay.
