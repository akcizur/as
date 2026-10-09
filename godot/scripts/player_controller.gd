extends CharacterBody3D

signal telemetry_changed(data: Dictionary)

const CHARACTER_SCENE: PackedScene = preload("res://assets/models/mixamo_base.glb")
const TOUCH_CONTROLS_SCRIPT: Script = preload("res://scripts/touch_controls.gd")
const MOTION_LIBRARY_SCRIPT: Script = preload("res://scripts/character_motion_library.gd")
const CAMERA_DISTANCE: float = 4.8
const CAMERA_MIN_DISTANCE: float = 0.72
const CAMERA_MIN_WORLD_Y: float = 0.35
const ANIMATION_BLEND: float = 0.18
const STANDING_CAPSULE_HEIGHT: float = 1.8
const CROUCHED_CAPSULE_HEIGHT: float = 1.18

@export_group("Locomotion")
@export var walking_speed: float = 3.0
@export var running_speed: float = 5.0
@export var aiming_speed: float = 2.2
@export var crouching_speed: float = 1.55
@export var ground_acceleration: float = 18.0
@export var ground_braking: float = 22.0
@export var air_control: float = 5.0
@export var jump_velocity: float = 4.5
@export var visuals_rotation_smoothness: float = 10.0
@export var dodge_speed: float = 8.8
@export var dodge_duration: float = 0.24
@export var turn_180_duration: float = 0.42
@export var use_root_motion: bool = false
@export var root_motion_track: NodePath = NodePath("")

@export_group("Camera / Look")
@export var horizontal_mouse_sensitivity: float = 0.001
@export var vertical_mouse_sensitivity: float = 0.001
@export var touch_look_sensitivity: float = 0.0038
@export var gamepad_look_sensitivity: float = 2.6
@export var camera_smoothness: float = 18.0
@export var camera_pitch_min: float = -1.5708
@export var camera_pitch_max: float = 0.7854

var camera_pivot: Node3D
var camera: Camera3D
var body_visual: Node3D
var animation_player: AnimationPlayer
var motion_library: Node
var touch_controls: CanvasLayer
var touch_move_vector := Vector2.ZERO
var collision_capsule: CollisionShape3D
var capsule_shape: CapsuleShape3D

var camera_pitch: float = -0.12
var telemetry_clock: float = 0.0
var is_running: bool = false
var is_crouching: bool = false
var is_aiming: bool = false
var current_animation: StringName = &""
var gravity_strength: float = float(ProjectSettings.get_setting("physics/3d/default_gravity"))
var dodge_timer: float = 0.0
var dodge_direction := Vector3.ZERO
var turn_180_active: bool = false
var turn_180_elapsed: float = 0.0
var turn_180_start_yaw: float = 0.0
var turn_animation_cooldown: float = 0.0

func _ready() -> void:
	name = "Player"
	add_to_group("player")
	floor_snap_length = 0.3
	floor_max_angle = deg_to_rad(48.0)
	floor_constant_speed = true
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

	_create_collision_capsule()
	_create_character_visual()
	_create_camera()
	_create_touch_controls()

func _create_collision_capsule() -> void:
	# Invisible authoritative collision shape; visuals never participate in physics.
	collision_capsule = CollisionShape3D.new()
	collision_capsule.name = "InvisibleCollisionCapsule"
	capsule_shape = CapsuleShape3D.new()
	capsule_shape.radius = 0.32
	capsule_shape.height = STANDING_CAPSULE_HEIGHT
	collision_capsule.shape = capsule_shape
	collision_capsule.position.y = STANDING_CAPSULE_HEIGHT * 0.5
	add_child(collision_capsule)

func _create_character_visual() -> void:
	body_visual = Node3D.new()
	body_visual.name = "Visuals"
	add_child(body_visual)

	var character := CHARACTER_SCENE.instantiate()
	character.name = "mixamo_base"
	body_visual.add_child(character)

	if character is Node3D:
		(character as Node3D).position = Vector3.ZERO

	animation_player = character.find_child("AnimationPlayer", true, false) as AnimationPlayer
	if animation_player == null:
		push_warning("Mixamo model loaded, but no AnimationPlayer was found.")
		return

	motion_library = MOTION_LIBRARY_SCRIPT.new()
	motion_library.name = "CharacterMotionLibrary"
	add_child(motion_library)
	if motion_library.setup(animation_player):
		motion_library.configure_root_motion(use_root_motion, root_motion_track)
	else:
		if animation_player.has_animation(&"idle"):
			_play_animation(&"idle")

func _create_camera() -> void:
	# Player yaw -> camera mount -> camera pitch, following the reference-controller pattern.
	camera_pivot = Node3D.new()
	camera_pivot.name = "CameraMount"
	camera_pivot.position.y = 1.45
	camera_pivot.rotation.x = camera_pitch
	add_child(camera_pivot)

	camera = Camera3D.new()
	camera.name = "ThirdPersonCamera"
	camera.position = Vector3(0.0, 0.22, CAMERA_DISTANCE)
	camera.fov = 72.0
	camera.near = 0.08
	camera.far = 320.0
	camera.current = true
	camera_pivot.add_child(camera)

func _create_touch_controls() -> void:
	if not DisplayServer.is_touchscreen_available():
		return
	touch_controls = CanvasLayer.new()
	touch_controls.name = "TouchControls"
	touch_controls.set_script(TOUCH_CONTROLS_SCRIPT)
	add_child(touch_controls)
	touch_controls.move_changed.connect(_on_touch_move_changed)
	touch_controls.look_delta.connect(_on_touch_look_delta)

func _on_touch_move_changed(value: Vector2) -> void:
	touch_move_vector = value

func _on_touch_look_delta(delta: Vector2) -> void:
	_apply_look(delta.x * touch_look_sensitivity, delta.y * touch_look_sensitivity)

func _apply_look(yaw_delta: float, pitch_delta: float) -> void:
	# Normal camera look rotates player yaw and counter-rotates visuals.
	# A deliberate 180 turn owns the yaw while it is active.
	if not turn_180_active:
		rotate_y(-yaw_delta)
		if body_visual:
			body_visual.rotate_y(yaw_delta)
		if absf(yaw_delta) >= 0.075 and turn_animation_cooldown <= 0.0 and _input_is_idle_for_turn():
			if motion_library and motion_library.is_active():
				if motion_library.request_turn_in_place(yaw_delta):
					turn_animation_cooldown = 0.62

	camera_pitch = clampf(camera_pitch + pitch_delta, camera_pitch_min, camera_pitch_max)
	camera_pivot.rotation.x = camera_pitch

func _input_is_idle_for_turn() -> bool:
	if not is_on_floor():
		return false
	var keyboard_input := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	return keyboard_input.length_squared() < 0.01 and touch_move_vector.length_squared() < 0.01 and dodge_timer <= 0.0

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	elif event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	elif event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		_apply_look(
			event.relative.x * horizontal_mouse_sensitivity,
			event.relative.y * vertical_mouse_sensitivity
		)

func _update_gamepad_look(delta: float) -> void:
	var pads := Input.get_connected_joypads()
	if pads.is_empty():
		return

	var device := pads[0]
	var look := Vector2(
		Input.get_joy_axis(device, JOY_AXIS_RIGHT_X),
		Input.get_joy_axis(device, JOY_AXIS_RIGHT_Y)
	)
	if look.length_squared() < 0.04:
		return

	var strength := (look.length() - 0.2) / 0.8
	var adjusted := look.normalized() * clampf(strength, 0.0, 1.0)
	_apply_look(
		adjusted.x * gamepad_look_sensitivity * delta,
		adjusted.y * gamepad_look_sensitivity * delta
	)

func _physics_process(delta: float) -> void:
	_update_gamepad_look(delta)
	turn_animation_cooldown = maxf(0.0, turn_animation_cooldown - delta)

	if Input.is_action_just_pressed("turn_180"):
		_begin_turn_180()
	_update_turn_180(delta)

	if Input.is_action_just_pressed("crouch"):
		_toggle_crouch()
	is_aiming = Input.is_action_pressed("aim")

	var was_on_floor := is_on_floor()
	if not was_on_floor:
		velocity.y -= gravity_strength * delta
	elif velocity.y < 0.0:
		velocity.y = -0.2

	is_running = Input.is_action_pressed("run") and not is_crouching and not is_aiming
	var speed := running_speed if is_running else walking_speed
	if is_crouching:
		speed = crouching_speed
	elif is_aiming:
		speed = aiming_speed

	if was_on_floor and Input.is_action_just_pressed("jump") and not is_crouching:
		velocity.y = jump_velocity

	var input_dir := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	if touch_move_vector.length_squared() > 0.0025:
		input_dir = touch_move_vector

	# BlendSpace2D uses positive Y for forward; Input.get_vector uses negative Y.
	var animation_direction := Vector2(input_dir.x, -input_dir.y)
	var local_direction := Vector3(input_dir.x, 0.0, input_dir.y)
	var direction := (transform.basis * local_direction).normalized()

	if input_dir.length_squared() > 0.0001 and not turn_180_active:
		body_visual.rotation.y = lerp_angle(
			body_visual.rotation.y,
			atan2(-input_dir.x, -input_dir.y),
			minf(delta * visuals_rotation_smoothness, 1.0)
		)

	if Input.is_action_just_pressed("dodge") and was_on_floor and dodge_timer <= 0.0 and not turn_180_active:
		_begin_dodge(input_dir, direction)

	if dodge_timer > 0.0:
		velocity.x = dodge_direction.x * dodge_speed
		velocity.z = dodge_direction.z * dodge_speed
		dodge_timer = maxf(0.0, dodge_timer - delta)
	elif motion_library and motion_library.is_active() and motion_library.is_root_motion_active:
		var root_delta: Vector3 = motion_library.get_root_motion_delta()
		var world_delta := transform.basis * Vector3(root_delta.x, 0.0, root_delta.z)
		velocity.x = world_delta.x / maxf(delta, 0.001)
		velocity.z = world_delta.z / maxf(delta, 0.001)
	elif direction.length_squared() > 0.0001:
		var target_velocity := direction * speed
		var acceleration := ground_acceleration if was_on_floor else air_control
		velocity.x = move_toward(velocity.x, target_velocity.x, acceleration * delta)
		velocity.z = move_toward(velocity.z, target_velocity.z, acceleration * delta)
	else:
		var braking := ground_braking if was_on_floor else air_control
		velocity.x = move_toward(velocity.x, 0.0, braking * delta)
		velocity.z = move_toward(velocity.z, 0.0, braking * delta)

	if motion_library:
		motion_library.set_crouched(is_crouching)
		motion_library.set_aiming(is_aiming)
		_update_motion_animation(animation_direction, speed)

	_update_camera_obstruction(delta)
	move_and_slide()

	if motion_library and motion_library.is_active():
		if not is_on_floor():
			if velocity.y > 0.15:
				motion_library.set_air_state(&"Jump")
			else:
				motion_library.set_air_state(&"Fall")
		elif not was_on_floor:
			motion_library.set_air_state(&"Land")
		else:
			motion_library.set_air_state(&"Locomotion")

	if global_position.y < -18.0:
		var world := get_parent()
		if world and world.has_method("player_respawn"):
			world.call("player_respawn", self)

	if Input.is_action_just_pressed("interact"):
		var world := get_parent()
		if world and world.has_method("interact_nearby"):
			world.call("interact_nearby", self)

	if Input.is_action_just_pressed("spawn_crate"):
		var world := get_parent()
		if world and world.has_method("spawn_crate"):
			world.call("spawn_crate", self)

	if Input.is_action_just_pressed("reset_player"):
		var world := get_parent()
		if world and world.has_method("reset_sandbox"):
			world.call("reset_sandbox", self)

	telemetry_clock += delta
	if telemetry_clock >= 0.12:
		telemetry_clock = 0.0
		var horizontal_speed := Vector2(velocity.x, velocity.z).length()
		var prompt := ""
		var world := get_parent()
		if world and world.has_method("get_interaction_prompt"):
			prompt = str(world.call("get_interaction_prompt", self))
		telemetry_changed.emit({
			"position": global_position,
			"speed": horizontal_speed,
			"running": is_running,
			"crouched": is_crouching,
			"aiming": is_aiming,
			"dodging": dodge_timer > 0.0,
			"root_motion": motion_library != null and motion_library.is_root_motion_active,
			"grounded": is_on_floor(),
			"fps": Engine.get_frames_per_second(),
			"prompt": prompt,
			"gamepad": Input.get_connected_joypads().size() > 0,
			"touch": DisplayServer.is_touchscreen_available(),
			"motion_library": motion_library != null and motion_library.is_active()
		})

func _toggle_crouch() -> void:
	if is_crouching:
		if not _has_standing_clearance():
			return
		is_crouching = false
	else:
		is_crouching = true

	if capsule_shape and collision_capsule:
		capsule_shape.height = CROUCHED_CAPSULE_HEIGHT if is_crouching else STANDING_CAPSULE_HEIGHT
		collision_capsule.position.y = capsule_shape.height * 0.5

func _has_standing_clearance() -> bool:
	if get_world_3d() == null:
		return true
	var standing_shape := CapsuleShape3D.new()
	standing_shape.radius = capsule_shape.radius if capsule_shape else 0.32
	standing_shape.height = STANDING_CAPSULE_HEIGHT
	var query := PhysicsShapeQueryParameters3D.new()
	query.shape = standing_shape
	query.transform = global_transform * Transform3D(Basis.IDENTITY, Vector3(0.0, STANDING_CAPSULE_HEIGHT * 0.5, 0.0))
	query.collision_mask = collision_mask
	query.exclude = [get_rid()]
	return get_world_3d().direct_space_state.intersect_shape(query, 8).is_empty()

func _begin_dodge(input_dir: Vector2, movement_direction: Vector3) -> void:
	var local := Vector3(input_dir.x, 0.0, input_dir.y)
	if local.length_squared() < 0.01:
		local = Vector3(0.0, 0.0, -1.0)
	dodge_direction = (transform.basis * local).normalized()
	dodge_timer = dodge_duration

	if motion_library and motion_library.is_active():
		var semantic: StringName
		if absf(input_dir.x) > absf(input_dir.y):
			semantic = &"dodge_right" if input_dir.x > 0.0 else &"dodge_left"
		else:
			semantic = &"dodge_forward" if input_dir.y < 0.0 else &"dodge_back"
		motion_library.play_action(semantic)

func _begin_turn_180() -> void:
	if turn_180_active or not is_on_floor() or dodge_timer > 0.0:
		return
	turn_180_active = true
	turn_180_elapsed = 0.0
	turn_180_start_yaw = rotation.y
	if motion_library and motion_library.is_active():
		motion_library.play_action(&"turn_180")

func _update_turn_180(delta: float) -> void:
	if not turn_180_active:
		return
	turn_180_elapsed += delta
	var t := clampf(turn_180_elapsed / maxf(turn_180_duration, 0.01), 0.0, 1.0)
	var eased := t * t * (3.0 - 2.0 * t)
	rotation.y = lerp_angle(turn_180_start_yaw, turn_180_start_yaw + PI, eased)
	if t >= 1.0:
		turn_180_active = false

func _update_motion_animation(animation_direction: Vector2, target_speed: float) -> void:
	if motion_library and motion_library.is_active():
		var horizontal_speed := Vector2(velocity.x, velocity.z).length()
		var normalized_speed := horizontal_speed / maxf(running_speed, 0.01)
		motion_library.set_motion(
			animation_direction,
			normalized_speed,
			is_running,
			is_crouching,
			is_aiming
		)
		return

	# Safe fallback for models without a compatible AnimationTree graph.
	if animation_player == null:
		return
	if not is_on_floor():
		if velocity.y > 0.15 and animation_player.has_animation(&"jump"):
			_play_animation(&"jump")
		elif velocity.y < -0.15 and animation_player.has_animation(&"fall"):
			_play_animation(&"fall")
		return
	if animation_direction.length_squared() < 0.006:
		_play_animation(&"idle")
	elif is_running:
		_play_animation(&"running")
	elif is_crouching and animation_player.has_animation(&"crouch"):
		_play_animation(&"crouch")
	else:
		_play_animation(&"walking")

func _play_animation(animation_name: StringName) -> void:
	if animation_player == null or not animation_player.has_animation(animation_name):
		return
	if current_animation == animation_name and animation_player.is_playing():
		return
	animation_player.play(animation_name, ANIMATION_BLEND)
	current_animation = animation_name

func _update_camera_obstruction(delta: float) -> void:
	if camera == null or camera_pivot == null:
		return

	var origin := camera_pivot.global_position
	var destination := camera_pivot.to_global(Vector3(0.0, 0.22, CAMERA_DISTANCE))
	var query := PhysicsRayQueryParameters3D.create(origin, destination)
	query.exclude = [get_rid()]
	query.collision_mask = 1

	var target_distance := CAMERA_DISTANCE
	var space_state := get_world_3d().direct_space_state
	var hit := space_state.intersect_ray(query)
	if not hit.is_empty():
		target_distance = clampf(origin.distance_to(hit.position) - 0.2, CAMERA_MIN_DISTANCE, CAMERA_DISTANCE)

	camera.position.z = lerpf(camera.position.z, target_distance, minf(delta * camera_smoothness, 1.0))
	camera.fov = lerpf(camera.fov, 78.0 if is_running else 72.0, minf(delta * 4.0, 1.0))

	# Camera world-space Y is clamped every frame, even when aimed or crouched.
	var camera_world_position := camera.global_position
	if camera_world_position.y < CAMERA_MIN_WORLD_Y:
		camera_world_position.y = CAMERA_MIN_WORLD_Y
		camera.global_position = camera_world_position
