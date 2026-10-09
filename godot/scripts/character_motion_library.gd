extends Node
## Optional advanced motion system for Mixamo/Godot humanoid rigs.
## Every feature is clip-driven: missing clips degrade gracefully to regular locomotion.

signal state_changed(state: StringName)

const PLAYBACK_PATH := "parameters/playback"
const BASE_MACHINE_NAME: StringName = &"BaseMachine"
const BASE_LOCOMOTION: StringName = &"Locomotion"

var animation_player: AnimationPlayer
var animation_tree: AnimationTree
var state_machine: AnimationNodeStateMachine
var playback: AnimationNodeStateMachinePlayback
var locomotion: AnimationNodeBlendSpace2D
var crouch_locomotion: AnimationNodeBlendSpace2D
var aim_locomotion: AnimationNodeBlendSpace2D
var upper_body_blend: AnimationNodeBlend2
var upper_body_animation: AnimationNodeAnimation
var clips: Dictionary = {}
var current_state: StringName = BASE_LOCOMOTION
var locomotion_parameter_path := "parameters/Locomotion/blend_position"
var crouch_parameter_path := ""
var aim_parameter_path := ""
var upper_body_parameter_path := ""
var playback_parameter_path := PLAYBACK_PATH
var ready_for_motion := false
var is_crouched := false
var is_aiming := false
var is_root_motion_active := false
var _action_locked := false
var _action_timer := 0.0
var _action_semantic: StringName = &""
var _was_moving := false
var _was_sprinting := false
var _upper_body_aim_semantic: StringName = &""

const LOOPING_SEMANTICS: Array[StringName] = [
	&"idle", &"walk", &"run", &"walk_back", &"run_back",
	&"walk_left", &"walk_right", &"run_left", &"run_right",
	&"crouch_idle", &"crouch_walk", &"crouch_back", &"crouch_left", &"crouch_right",
	&"aim_idle", &"aim_walk", &"aim_run", &"aim_back", &"aim_left", &"aim_right",
	&"aim_upper"
]

const ACTION_STATES := {
	&"walk_start": &"WalkStart",
	&"walk_stop": &"WalkStop",
	&"sprint_start": &"SprintStart",
	&"sprint_stop": &"SprintStop",
	&"turn_left": &"TurnLeft",
	&"turn_right": &"TurnRight",
	&"turn_180": &"Turn180",
	&"dodge": &"Dodge",
	&"dodge_forward": &"DodgeForward",
	&"dodge_back": &"DodgeBack",
	&"dodge_left": &"DodgeLeft",
	&"dodge_right": &"DodgeRight",
	&"upper_shoot": &"UpperShoot",
	&"upper_reload": &"UpperReload"
}

func setup(source: AnimationPlayer) -> bool:
	animation_player = source
	if animation_player == null:
		return false
	_discover_clips()
	if not clips.has(&"idle"):
		push_warning("CharacterMotionLibrary: no idle clip was detected; controller fallback will be used.")
		return false
	_configure_looping()
	_build_animation_graph()
	ready_for_motion = animation_tree != null and animation_tree.active and playback != null
	return ready_for_motion

func _discover_clips() -> void:
	clips.clear()
	for raw_name in animation_player.get_animation_list():
		var semantic := _semantic_name(_normalize_name(String(raw_name)))
		if semantic != &"" and not clips.has(semantic):
			clips[semantic] = StringName(raw_name)

func _normalize_name(value: String) -> String:
	var result := value.to_lower()
	for token in ["mixamo.com", "mixamo", "armature", "|", "-", "_", " ", ".", ":"]:
		result = result.replace(token, "")
	return result

func _semantic_name(key: String) -> StringName:
	if key in ["idle", "idle01", "idleloop", "standing", "stand", "breathingidle"]:
		return &"idle"
	if key in ["walk", "walking", "walkforward", "walkfwd", "walkloop", "walkcycle"]:
		return &"walk"
	if key in ["run", "running", "runforward", "runfwd", "runloop", "sprint", "sprinting", "sprintforward"]:
		return &"run"
	if key in ["walkback", "walkbackward", "walkbackwards", "backwalk", "walkbackwardloop"]:
		return &"walk_back"
	if key in ["runback", "runbackward", "runbackwards", "backrun", "sprintback"]:
		return &"run_back"
	if key in ["walkleft", "leftwalk", "strafeleft", "walkstrafeleft"]:
		return &"walk_left"
	if key in ["walkright", "rightwalk", "straferight", "walkstraferight"]:
		return &"walk_right"
	if key in ["runleft", "leftrun", "sprintleft", "runsleft"]:
		return &"run_left"
	if key in ["runright", "rightrun", "sprintright", "runsright"]:
		return &"run_right"
	if key in ["walkstart", "startwalk", "startwalking", "walkingstart", "walkforwardstart"]:
		return &"walk_start"
	if key in ["walkstop", "stopwalk", "stopwalking", "walkingstop", "walkforwardstop"]:
		return &"walk_stop"
	if key in ["runstart", "startrun", "sprintstart", "startsprint", "runningstart", "sprintstartforward"]:
		return &"sprint_start"
	if key in ["runstop", "stoprun", "sprintstop", "stopsprint", "runningstop"]:
		return &"sprint_stop"
	if key in ["jump", "jumpup", "jumpstart", "jumpstart01"]:
		return &"jump"
	if key in ["fall", "falling", "airborne", "inair", "jumpfall"]:
		return &"fall"
	if key in ["land", "landing", "land01", "jumpland", "landinghard"]:
		return &"land"
	if key in ["turnleft", "leftturn", "turninplaceleft", "turnleft90", "turninplaceleft90"]:
		return &"turn_left"
	if key in ["turnright", "rightturn", "turninplaceright", "turnright90", "turninplaceright90"]:
		return &"turn_right"
	if key in ["turn180", "turnaround", "turnback", "turninplace180", "turnaround180", "turnaroundleft"]:
		return &"turn_180"
	if key in ["crouch", "crouching", "crouchidle", "idlecrouch", "crouchloop", "crouchidleloop"]:
		return &"crouch_idle"
	if key in ["crouchwalk", "walkingcrouched", "crouchforward", "crouchwalkforward"]:
		return &"crouch_walk"
	if key in ["crouchback", "crouchbackward", "crouchwalkback"]:
		return &"crouch_back"
	if key in ["crouchleft", "crouchwalkleft", "crouchstrafeleft"]:
		return &"crouch_left"
	if key in ["crouchright", "crouchwalkright", "crouchstraferight"]:
		return &"crouch_right"
	if key in ["aimidle", "aimstanding", "aimidleloop", "aimstanceidle"]:
		return &"aim_idle"
	if key in ["aimwalk", "walkingaim", "aimwalking", "aimwalkforward"]:
		return &"aim_walk"
	if key in ["aimrun", "runningaim", "aimrunning", "aimsprint"]:
		return &"aim_run"
	if key in ["aimback", "aimwalkback", "aimbackward"]:
		return &"aim_back"
	if key in ["aimleft", "aimwalkleft", "aimstrafeleft"]:
		return &"aim_left"
	if key in ["aimright", "aimwalkright", "aimstraferight"]:
		return &"aim_right"
	if key in ["aim", "aimpose", "aimupper", "upperbodyaim", "aiming", "aimupperbody", "weaponready"]:
		return &"aim_upper"
	if key in ["dodge", "roll", "quickroll", "evade"]:
		return &"dodge"
	if key in ["dodgeforward", "rollforward", "evadeforward", "dodgefront"]:
		return &"dodge_forward"
	if key in ["dodgeback", "dodgebackward", "rollback", "evadebackward"]:
		return &"dodge_back"
	if key in ["dodgeleft", "rollleft", "evadeleft", "sidestep_left"]:
		return &"dodge_left"
	if key in ["dodgeright", "rollright", "evaderight", "sidestep_right"]:
		return &"dodge_right"
	if key in ["shoot", "fire", "weaponfire", "riflefire", "pistolfire", "aimshoot"]:
		return &"upper_shoot"
	if key in ["reload", "weaponreload", "riflereload", "pistolreload"]:
		return &"upper_reload"
	return &""

func _configure_looping() -> void:
	for semantic in clips.keys():
		var animation := animation_player.get_animation(clips[semantic]) as Animation
		if animation == null:
			continue
		if semantic in LOOPING_SEMANTICS:
			animation.loop_mode = Animation.LOOP_LINEAR
		else:
			animation.loop_mode = Animation.LOOP_NONE

func _animation_node(semantic: StringName) -> AnimationNodeAnimation:
	var node := AnimationNodeAnimation.new()
	node.animation = clips[semantic]
	return node

func _make_blend_space(
	idle_semantic: StringName,
	walk_semantic: StringName,
	run_semantic: StringName,
	back_semantic: StringName,
	left_semantic: StringName,
	right_semantic: StringName
) -> AnimationNodeBlendSpace2D:
	var space := AnimationNodeBlendSpace2D.new()
	space.min_space = Vector2(-1.0, -1.0)
	space.max_space = Vector2(1.0, 1.0)
	space.snap = Vector2(0.01, 0.01)
	space.sync = true
	space.x_label = "Strafe"
	space.y_label = "Forward"
	var idle_clip := idle_semantic if clips.has(idle_semantic) else &"idle"
	space.add_blend_point(_animation_node(idle_clip), Vector2.ZERO)
	if clips.has(walk_semantic):
		space.add_blend_point(_animation_node(walk_semantic), Vector2(0.0, 0.52))
	if clips.has(run_semantic):
		space.add_blend_point(_animation_node(run_semantic), Vector2(0.0, 1.0))
	if clips.has(back_semantic):
		space.add_blend_point(_animation_node(back_semantic), Vector2(0.0, -0.72))
	if clips.has(left_semantic):
		space.add_blend_point(_animation_node(left_semantic), Vector2(-0.65, 0.35))
	if clips.has(right_semantic):
		space.add_blend_point(_animation_node(right_semantic), Vector2(0.65, 0.35))
	return space

func _add_optional_state(semantic: StringName, state_name: StringName, position: Vector2) -> void:
	if not clips.has(semantic):
		return
	state_machine.add_node(state_name, _animation_node(semantic), position)

func _build_animation_graph() -> void:
	locomotion = _make_blend_space(&"idle", &"walk", &"run", &"walk_back", &"walk_left", &"walk_right")
	state_machine = AnimationNodeStateMachine.new()
	state_machine.add_node(BASE_LOCOMOTION, locomotion, Vector2(0, 150))

	# Airborne and landing clips are optional.
	_add_optional_state(&"jump", &"Jump", Vector2(320, 0))
	_add_optional_state(&"fall", &"Fall", Vector2(320, 90))
	_add_optional_state(&"land", &"Land", Vector2(320, 180))

	# Start/stop transitions play once, then the controller returns to locomotion.
	_add_optional_state(&"walk_start", &"WalkStart", Vector2(320, 300))
	_add_optional_state(&"walk_stop", &"WalkStop", Vector2(320, 380))
	_add_optional_state(&"sprint_start", &"SprintStart", Vector2(320, 460))
	_add_optional_state(&"sprint_stop", &"SprintStop", Vector2(320, 540))

	_add_optional_state(&"turn_left", &"TurnLeft", Vector2(570, 0))
	_add_optional_state(&"turn_right", &"TurnRight", Vector2(570, 80))
	_add_optional_state(&"turn_180", &"Turn180", Vector2(570, 160))
	_add_optional_state(&"dodge", &"Dodge", Vector2(570, 260))
	_add_optional_state(&"dodge_forward", &"DodgeForward", Vector2(570, 340))
	_add_optional_state(&"dodge_back", &"DodgeBack", Vector2(570, 420))
	_add_optional_state(&"dodge_left", &"DodgeLeft", Vector2(570, 500))
	_add_optional_state(&"dodge_right", &"DodgeRight", Vector2(570, 580))
	_add_optional_state(&"upper_shoot", &"UpperShoot", Vector2(800, 300))
	_add_optional_state(&"upper_reload", &"UpperReload", Vector2(800, 380))

	var has_crouch_motion := clips.has(&"crouch_idle") or clips.has(&"crouch_walk") or clips.has(&"crouch_back") or clips.has(&"crouch_left") or clips.has(&"crouch_right")
	if has_crouch_motion:
		crouch_locomotion = _make_blend_space(&"crouch_idle", &"crouch_walk", &"crouch_walk", &"crouch_back", &"crouch_left", &"crouch_right")
		state_machine.add_node("CrouchLocomotion", crouch_locomotion, Vector2(0, 270))
		crouch_parameter_path = "parameters/CrouchLocomotion/blend_position"

	var has_aim_motion := clips.has(&"aim_idle") or clips.has(&"aim_walk") or clips.has(&"aim_run") or clips.has(&"aim_back") or clips.has(&"aim_left") or clips.has(&"aim_right")
	if has_aim_motion:
		aim_locomotion = _make_blend_space(&"aim_idle", &"aim_walk", &"aim_run", &"aim_back", &"aim_left", &"aim_right")
		state_machine.add_node("AimLocomotion", aim_locomotion, Vector2(0, 360))
		aim_parameter_path = "parameters/AimLocomotion/blend_position"

	var state_names: Array[StringName] = []
	for state_name in state_machine.get_node_list():
		if state_name != BASE_LOCOMOTION:
			state_names.append(state_name)
	for state_name in state_names:
		_add_transition(BASE_LOCOMOTION, state_name, 0.1)
		_add_transition(state_name, BASE_LOCOMOTION, 0.12)

	if state_machine.has_node(&"Jump") and state_machine.has_node(&"Fall"):
		_add_transition(&"Jump", &"Fall", 0.1)
	if state_machine.has_node(&"Fall") and state_machine.has_node(&"Land"):
		_add_transition(&"Fall", &"Land", 0.08)
	if state_machine.has_node(&"Land") and state_machine.has_node(&"Locomotion"):
		_add_transition(&"Land", &"Locomotion", 0.1)

	var upper_semantic := _first_available([&"aim_upper", &"upper_reload", &"upper_shoot"])
	var upper_filter_paths := _find_upper_body_filter_paths()
	var use_upper_body_layer := upper_semantic != &"" and not upper_filter_paths.is_empty()

	animation_tree = AnimationTree.new()
	animation_tree.name = "CharacterMotionTree"
	animation_tree.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_PHYSICS
	animation_player.get_parent().add_child(animation_tree)
	animation_tree.anim_player = animation_tree.get_path_to(animation_player)

	if use_upper_body_layer:
		var blend_tree := AnimationNodeBlendTree.new()
		blend_tree.add_node(BASE_MACHINE_NAME, state_machine, Vector2(0, 0))
		upper_body_blend = AnimationNodeBlend2.new()
		upper_body_blend.filter_enabled = true
		for track_path in upper_filter_paths:
			upper_body_blend.set_filter_path(track_path, true)
		blend_tree.add_node("UpperBodyLayer", upper_body_blend, Vector2(300, 0))
		upper_body_animation = _animation_node(upper_semantic)
		blend_tree.add_node("UpperBodyAnimation", upper_body_animation, Vector2(150, 180))
		blend_tree.connect_node("UpperBodyLayer", 0, BASE_MACHINE_NAME)
		blend_tree.connect_node("UpperBodyLayer", 1, "UpperBodyAnimation")
		blend_tree.connect_node("output", 0, "UpperBodyLayer")
		animation_tree.tree_root = blend_tree
		playback_parameter_path = "parameters/BaseMachine/playback"
		locomotion_parameter_path = "parameters/BaseMachine/Locomotion/blend_position"
		if not crouch_parameter_path.is_empty():
			crouch_parameter_path = "parameters/BaseMachine/CrouchLocomotion/blend_position"
		if not aim_parameter_path.is_empty():
			aim_parameter_path = "parameters/BaseMachine/AimLocomotion/blend_position"
		upper_body_parameter_path = "parameters/UpperBodyLayer/blend_amount"
		_upper_body_aim_semantic = upper_semantic
	else:
		animation_tree.tree_root = state_machine
		playback_parameter_path = PLAYBACK_PATH
		locomotion_parameter_path = "parameters/Locomotion/blend_position"

	animation_tree.active = true
	playback = animation_tree.get(playback_parameter_path) as AnimationNodeStateMachinePlayback
	if playback:
		playback.start(BASE_LOCOMOTION)
	animation_tree.set(locomotion_parameter_path, Vector2.ZERO)
	if not crouch_parameter_path.is_empty():
		animation_tree.set(crouch_parameter_path, Vector2.ZERO)
	if not aim_parameter_path.is_empty():
		animation_tree.set(aim_parameter_path, Vector2.ZERO)
	if not upper_body_parameter_path.is_empty():
		animation_tree.set(upper_body_parameter_path, 0.0)

func _first_available(candidates: Array[StringName]) -> StringName:
	for semantic in candidates:
		if clips.has(semantic):
			return semantic
	return &""

func _find_upper_body_filter_paths() -> Array[NodePath]:
	var found: Dictionary = {}
	var tokens := ["spine", "neck", "head", "shoulder", "clavicle", "upperarm", "lowerarm", "forearm", "elbow", "wrist", "hand", "finger", "chest", "torso"]
	for raw_name in animation_player.get_animation_list():
		var animation := animation_player.get_animation(raw_name) as Animation
		if animation == null:
			continue
		for track_index in range(animation.get_track_count()):
			var track_path := animation.track_get_path(track_index)
			var path_text := String(track_path).to_lower()
			var bone_name := path_text.get_slice(":", path_text.get_slice_count(":") - 1)
			for token in tokens:
				if bone_name.contains(token):
					found[track_path] = true
					break
	var result: Array[NodePath] = []
	for path in found.keys():
		result.append(path as NodePath)
	return result

func _add_transition(from_state: StringName, to_state: StringName, xfade: float) -> void:
	var transition := AnimationNodeStateMachineTransition.new()
	transition.xfade_time = xfade
	state_machine.add_transition(from_state, to_state, transition)

func set_motion(local_direction: Vector2, normalized_speed: float, sprinting: bool = false, crouched: bool = false, aiming: bool = false) -> void:
	if not ready_for_motion:
		return

	is_crouched = crouched
	is_aiming = aiming
	var target := local_direction
	if target.length_squared() > 1.0:
		target = target.normalized()
	target *= clampf(normalized_speed, 0.0, 1.0)

	animation_tree.set(locomotion_parameter_path, target)
	if not crouch_parameter_path.is_empty():
		animation_tree.set(crouch_parameter_path, target)
	if not aim_parameter_path.is_empty():
		animation_tree.set(aim_parameter_path, target)

	var moving := normalized_speed > 0.08
	var sprinting_now := sprinting and moving
	if not _action_locked:
		if moving and not _was_moving:
			if sprinting_now and clips.has(&"sprint_start"):
				play_action(&"sprint_start")
			elif clips.has(&"walk_start"):
				play_action(&"walk_start")
		elif moving and sprinting_now and not _was_sprinting and clips.has(&"sprint_start"):
			play_action(&"sprint_start")
		elif moving and not sprinting_now and _was_sprinting and clips.has(&"sprint_stop"):
			play_action(&"sprint_stop")
		elif not moving and _was_moving:
			if _was_sprinting and clips.has(&"sprint_stop"):
				play_action(&"sprint_stop")
			elif clips.has(&"walk_stop"):
				play_action(&"walk_stop")

	_was_moving = moving
	_was_sprinting = sprinting_now

	if not _action_locked:
		_travel_to(_preferred_locomotion_state())
	_update_upper_body_weight()

func _preferred_locomotion_state() -> StringName:
	if is_crouched and state_machine.has_node(&"CrouchLocomotion"):
		return &"CrouchLocomotion"
	if is_crouched and state_machine.has_node(&"Crouch"):
		return &"Crouch"
	if is_aiming and state_machine.has_node(&"AimLocomotion"):
		return &"AimLocomotion"
	return BASE_LOCOMOTION

func set_crouched(value: bool) -> void:
	is_crouched = value
	if not _action_locked:
		_travel_to(_preferred_locomotion_state())

func set_aiming(value: bool) -> void:
	is_aiming = value
	if not _action_locked:
		_travel_to(_preferred_locomotion_state())
	_update_upper_body_weight()

func _update_upper_body_weight() -> void:
	if upper_body_parameter_path.is_empty():
		return
	var weight := 1.0 if is_aiming and _upper_body_aim_semantic == &"aim_upper" else 0.0
	animation_tree.set(upper_body_parameter_path, weight)

func set_upper_body_animation(semantic: StringName) -> bool:
	if not ready_for_motion or upper_body_animation == null or not clips.has(semantic):
		return false
	if semantic not in [&"aim_upper", &"upper_shoot", &"upper_reload"]:
		return false
	upper_body_animation.animation = clips[semantic]
	if not upper_body_parameter_path.is_empty():
		animation_tree.set(upper_body_parameter_path, 1.0)
	var clip := animation_player.get_animation(clips[semantic]) as Animation
	_action_semantic = semantic
	_action_timer = clip.length if clip else 0.5
	_action_locked = true
	return true

func play_action(semantic: StringName) -> bool:
	if not ready_for_motion or playback == null:
		return false
	var state_name: StringName = ACTION_STATES.get(semantic, &"")
	if state_name == &"" or not state_machine.has_node(state_name):
		if semantic.begins_with("dodge_") and state_machine.has_node(&"Dodge"):
			state_name = &"Dodge"
		else:
			return false
	if _action_locked:
		return false
	_action_semantic = semantic
	var clip_semantic := semantic if clips.has(semantic) else &"dodge"
	var clip := animation_player.get_animation(clips[clip_semantic]) as Animation if clips.has(clip_semantic) else null
	_action_timer = maxf(clip.length if clip else 0.3, 0.08)
	_action_locked = true
	_travel_to(state_name)
	return true

func request_turn_in_place(yaw_delta: float) -> bool:
	if _was_moving or is_crouched or is_aiming:
		return false
	return play_action(&"turn_left" if yaw_delta < 0.0 else &"turn_right")

func set_air_state(state: StringName) -> void:
	if not ready_for_motion or playback == null:
		return
	if state == &"Land" and clips.has(&"land"):
		play_action(&"land")
		return
	if _action_locked:
		return
	var target := state if state_machine.has_node(state) else _preferred_locomotion_state()
	_travel_to(target)

func _travel_to(target: StringName) -> void:
	if not ready_for_motion or playback == null or not state_machine.has_node(target):
		return
	if current_state == target:
		return
	playback.travel(target)
	current_state = target
	state_changed.emit(current_state)

func _process(delta: float) -> void:
	if not _action_locked:
		return
	_action_timer -= delta
	if _action_timer > 0.0:
		return
	_action_locked = false
	_action_semantic = &""
	if upper_body_animation and not upper_body_parameter_path.is_empty():
		if is_aiming and _upper_body_aim_semantic == &"aim_upper":
			upper_body_animation.animation = clips[&"aim_upper"]
		_update_upper_body_weight()
	_travel_to(_preferred_locomotion_state())

func configure_root_motion(enabled: bool, requested_track: NodePath = NodePath("")) -> void:
	is_root_motion_active = false
	if not ready_for_motion or animation_tree == null or not enabled:
		return
	var selected_track := requested_track
	if selected_track.is_empty():
		selected_track = _detect_root_motion_track()
	if selected_track.is_empty():
		push_warning("CharacterMotionLibrary: root motion was requested, but no moving root-bone track was detected. Set root_motion_track explicitly for this rig.")
		return
	animation_tree.root_motion_track = selected_track
	is_root_motion_active = true

func _detect_root_motion_track() -> NodePath:
	var preferred_semantics: Array[StringName] = [&"run", &"walk", &"run_back", &"walk_back"]
	for semantic in preferred_semantics:
		if not clips.has(semantic):
			continue
		var animation := animation_player.get_animation(clips[semantic]) as Animation
		if animation == null:
			continue
		for track_index in range(animation.get_track_count()):
			if animation.track_get_type(track_index) != Animation.TYPE_POSITION_3D:
				continue
			var path := animation.track_get_path(track_index)
			var path_text := String(path).to_lower()
			if not path_text.contains(":"):
				continue
			var bone_name := path_text.get_slice(":", path_text.get_slice_count(":") - 1)
			if not (bone_name.contains("root") or bone_name.contains("hips")):
				continue
			if _track_has_horizontal_travel(animation, track_index, 0.18):
				return path
	return NodePath("")

func _track_has_horizontal_travel(animation: Animation, track_index: int, threshold: float) -> bool:
	if animation.track_get_key_count(track_index) < 2:
		return false
	var first_value: Vector3 = animation.track_get_key_value(track_index, 0)
	var max_distance := 0.0
	for key_index in range(1, animation.track_get_key_count(track_index)):
		var value: Vector3 = animation.track_get_key_value(track_index, key_index)
		var horizontal_delta := Vector2(value.x - first_value.x, value.z - first_value.z).length()
		max_distance = maxf(max_distance, horizontal_delta)
	return max_distance >= threshold

func get_root_motion_delta() -> Vector3:
	if not is_root_motion_active or animation_tree == null:
		return Vector3.ZERO
	return animation_tree.get_root_motion_position()

func is_active() -> bool:
	return ready_for_motion

func get_available_library() -> Array[StringName]:
	var result: Array[StringName] = []
	for key in clips.keys():
		result.append(key)
	result.sort()
	return result
