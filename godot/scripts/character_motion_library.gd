extends Node
## Advanced third-person character motion animation library.
## Builds a runtime AnimationTree from whatever Mixamo animations are present.
## Missing optional clips never break the player; AnimationPlayer remains the source data.

signal state_changed(state: StringName)

const PLAYBACK_PATH := "parameters/playback"

var animation_player: AnimationPlayer
var animation_tree: AnimationTree
var state_machine: AnimationNodeStateMachine
var locomotion: AnimationNodeBlendSpace2D
var playback: AnimationNodeStateMachinePlayback
var clips: Dictionary = {}
var current_state: StringName = &"Locomotion"
var locomotion_parameter_path := "parameters/blend_position"
var ready_for_motion := false

func setup(source: AnimationPlayer) -> bool:
	animation_player = source
	if animation_player == null:
		return false
	_discover_clips()
	if not clips.has(&"idle"):
		push_warning("CharacterMotionLibrary: no idle animation found; using AnimationPlayer fallback.")
		return false
	_configure_looping()
	_build_tree()
	ready_for_motion = animation_tree != null and animation_tree.active
	return ready_for_motion

func _discover_clips() -> void:
	clips.clear()
	for raw_name in animation_player.get_animation_list():
		var key := _normalize_name(String(raw_name))
		var semantic := _semantic_name(key)
		if semantic != &"" and not clips.has(semantic):
			clips[semantic] = StringName(raw_name)

func _semantic_name(key: String) -> StringName:
	if key in ["idle", "idle01", "idleloop", "standing", "stand"]:
		return &"idle"
	if key in ["walk", "walking", "walkforward", "walkfwd", "walkloop"]:
		return &"walk"
	if key in ["run", "running", "runforward", "runfwd", "runloop", "sprint", "sprinting"]:
		return &"run"
	if key in ["walkback", "walkbackward", "walkbackwards", "backwalk"]:
		return &"walk_back"
	if key in ["runback", "runbackward", "runbackwards", "backrun"]:
		return &"run_back"
	if key in ["walkleft", "leftwalk", "strafeleft"]:
		return &"walk_left"
	if key in ["walkright", "rightwalk", "straferight"]:
		return &"walk_right"
	if key in ["runleft", "leftrun", "sprintleft"]:
		return &"run_left"
	if key in ["runright", "rightrun", "sprintright"]:
		return &"run_right"
	if key in ["jump", "jumpup", "jumpstart", "jumpstart01"]:
		return &"jump"
	if key in ["fall", "falling", "airborne", "inair", "jumpfall"]:
		return &"fall"
	if key in ["land", "landing", "land01", "jumpland"]:
		return &"land"
	if key in ["turnleft", "leftturn"]:
		return &"turn_left"
	if key in ["turnright", "rightturn"]:
		return &"turn_right"
	return &""

func _normalize_name(value: String) -> String:
	var lower := value.to_lower()
	for token in ["mixamo.com", "mixamo", "armature", "|", "-", " ", ".", ":", "_"]:
		lower = lower.replace(token, "")
	return lower

func _configure_looping() -> void:
	for semantic in [&"idle", &"walk", &"run", &"walk_back", &"run_back", &"walk_left", &"walk_right", &"run_left", &"run_right"]:
		if not clips.has(semantic):
			continue
		var animation := animation_player.get_animation(clips[semantic])
		if animation:
			animation.loop_mode = Animation.LOOP_LINEAR

func _animation_node(semantic: StringName) -> AnimationNodeAnimation:
	var node := AnimationNodeAnimation.new()
	node.animation = clips[semantic]
	return node

func _build_tree() -> void:
	animation_tree = AnimationTree.new()
	animation_tree.name = "CharacterMotionTree"
	animation_player.get_parent().add_child(animation_tree)
	animation_tree.anim_player = animation_tree.get_path_to(animation_player)

	locomotion = AnimationNodeBlendSpace2D.new()
	locomotion.min_space = Vector2(-1.0, -1.0)
	locomotion.max_space = Vector2(1.0, 1.0)
	locomotion.snap = Vector2(0.01, 0.01)
	locomotion.sync = true
	locomotion.x_label = "Strafe"
	locomotion.y_label = "Forward"

	locomotion.add_blend_point(_animation_node(&"idle"), Vector2.ZERO)
	if clips.has(&"walk"):
		locomotion.add_blend_point(_animation_node(&"walk"), Vector2(0.0, 0.52))
	if clips.has(&"run"):
		locomotion.add_blend_point(_animation_node(&"run"), Vector2(0.0, 1.0))
	if clips.has(&"walk_back"):
		locomotion.add_blend_point(_animation_node(&"walk_back"), Vector2(0.0, -0.52))
	if clips.has(&"run_back"):
		locomotion.add_blend_point(_animation_node(&"run_back"), Vector2(0.0, -1.0))
	if clips.has(&"walk_left"):
		locomotion.add_blend_point(_animation_node(&"walk_left"), Vector2(-0.52, 0.52))
	if clips.has(&"walk_right"):
		locomotion.add_blend_point(_animation_node(&"walk_right"), Vector2(0.52, 0.52))
	if clips.has(&"run_left"):
		locomotion.add_blend_point(_animation_node(&"run_left"), Vector2(-1.0, 1.0))
	if clips.has(&"run_right"):
		locomotion.add_blend_point(_animation_node(&"run_right"), Vector2(1.0, 1.0))

	var needs_air_states := clips.has(&"jump") or clips.has(&"fall") or clips.has(&"land")
	if not needs_air_states:
		locomotion_parameter_path = "parameters/blend_position"
		animation_tree.tree_root = locomotion
		animation_tree.active = true
		animation_tree.set(locomotion_parameter_path, Vector2.ZERO)
		return

	state_machine = AnimationNodeStateMachine.new()
	state_machine.add_node("Locomotion", locomotion, Vector2(20, 160))
	if clips.has(&"jump"):
		state_machine.add_node("Jump", _animation_node(&"jump"), Vector2(360, 60))
		_add_transition("Locomotion", "Jump", 0.10)
		_add_transition("Jump", "Locomotion", 0.14)
	if clips.has(&"fall"):
		state_machine.add_node("Fall", _animation_node(&"fall"), Vector2(360, 170))
		_add_transition("Locomotion", "Fall", 0.10)
		_add_transition("Fall", "Locomotion", 0.14)
	if clips.has(&"land"):
		state_machine.add_node("Land", _animation_node(&"land"), Vector2(360, 280))
		_add_transition("Locomotion", "Land", 0.08)
		_add_transition("Land", "Locomotion", 0.12)

	locomotion_parameter_path = "parameters/Locomotion/blend_position"
	animation_tree.tree_root = state_machine
	animation_tree.active = true
	playback = animation_tree.get(PLAYBACK_PATH) as AnimationNodeStateMachinePlayback
	if playback:
		playback.start("Locomotion")
	animation_tree.set(locomotion_parameter_path, Vector2.ZERO)

func _add_transition(from: StringName, to: StringName, xfade: float) -> void:
	var transition := AnimationNodeStateMachineTransition.new()
	transition.xfade_time = xfade
	state_machine.add_transition(from, to, transition)

func set_motion(local_direction: Vector2, normalized_speed: float) -> void:
	if not ready_for_motion:
		return
	var target := local_direction
	if target.length_squared() > 1.0:
		target = target.normalized()
	target *= clampf(normalized_speed, 0.0, 1.0)
	animation_tree.set(locomotion_parameter_path, target)

func set_air_state(state: StringName) -> void:
	if not ready_for_motion or playback == null:
		return
	var target := state
	if not state_machine.has_node(target):
		target = &"Locomotion"
	if current_state == target:
		return
	playback.travel(target)
	current_state = target
	state_changed.emit(current_state)

func is_active() -> bool:
	return ready_for_motion

func get_available_library() -> Array[StringName]:
	var result: Array[StringName] = []
	for key in clips.keys():
		result.append(key)
	result.sort()
	return result
