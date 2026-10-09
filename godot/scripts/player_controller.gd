extends CharacterBody3D

signal telemetry_changed(data: Dictionary)

const CHARACTER_SCENE: PackedScene = preload("res://assets/models/mixamo_base.glb")
const TOUCH_CONTROLS_SCRIPT: Script = preload("res://scripts/touch_controls.gd")
const MOTION_LIBRARY_SCRIPT: Script = preload("res://scripts/character_motion_library.gd")
const CAMERA_DISTANCE: float = 4.8
const CAMERA_MIN_DISTANCE: float = 0.72
const CAMERA_MIN_WORLD_Y: float = 0.35
const ANIMATION_BLEND: float = 0.18

@export_group("Locomotion")
@export var walking_speed: float = 3.0
@export var running_speed: float = 5.0
@export var jump_velocity: float = 4.5
@export var visuals_rotation_smoothness: float = 10.0

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

var camera_pitch: float = -0.12
var telemetry_clock: float = 0.0
var is_running: bool = false
var current_animation: StringName = &""
var gravity_strength: float = float(ProjectSettings.get_setting("physics/3d/default_gravity"))

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
	# Invisible authoritative physics shape. The Mixamo mesh is visual only.
	var collider := CollisionShape3D.new()
	collider.name = "InvisibleCollisionCapsule"
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.32
	capsule.height = 1.8
	collider.shape = capsule
	collider.position.y = 0.9
	add_child(collider)

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

	# Advanced motion layer: AnimationTree + BlendSpace2D + optional air states.
	motion_library = MOTION_LIBRARY_SCRIPT.new()
	motion_library.name = "CharacterMotionLibrary"
	add_child(motion_library)
	if not motion_library.setup(animation_player):
		if animation_player.has_animation(&"idle"):
			_play_animation(&"idle")

func _create_camera() -> void:
	# Same gameplay hierarchy as the reference: player yaw -> camera mount -> camera pitch.
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
	# Reference gameplay: horizontal look rotates the player root, while the visual
	# counter-rotates so the model does not snap with the camera.
	rotate_y(-yaw_delta)
	if body_visual:
		body_visual.rotate_y(yaw_delta)

	camera_pitch = clampf(camera_pitch + pitch_delta, camera_pitch_min, camera_pitch_max)
	camera_pivot.rotation.x = camera_pitch

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

	var adjusted := look
	var strength := (adjusted.length() - 0.2) / 0.8
	adjusted = adjusted.normalized() * clampf(strength, 0.0, 1.0)
	_apply_look(
		adjusted.x * gamepad_look_sensitivity * delta,
		adjusted.y * gamepad_look_sensitivity * delta
	)

func _physics_process(delta: float) -> void:
	_update_gamepad_look(delta)

	var was_on_floor := is_on_floor()
	if not was_on_floor:
		velocity.y -= gravity_strength * delta
	elif velocity.y < 0.0:
		velocity.y = -0.2

	is_running = Input.is_action_pressed("run")
	var speed := running_speed if is_running else walking_speed

	if was_on_floor and Input.is_action_just_pressed("jump"):
		velocity.y = jump_velocity

	# Reference gameplay is character-relative: WASD moves along the player's
	# current facing direction. Mouse/right-stick look rotates the player itself.
	var input_dir := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	if touch_move_vector.length_squared() > 0.0025:
		input_dir = touch_move_vector

	var direction := (transform.basis * Vector3(input_dir.x, 0.0, input_dir.y)).normalized()
	var visuals_direction := Vector3(input_dir.x, 0.0, input_dir.y).normalized()

	if direction.length_squared() > 0.0001:
		if visuals_direction.length_squared() > 0.0001:
			body_visual.rotation.y = lerp_angle(
				body_visual.rotation.y,
				atan2(-visuals_direction.x, -visuals_direction.z),
				minf(delta * visuals_rotation_smoothness, 1.0)
			)

		velocity.x = direction.x * speed
		velocity.z = direction.z * speed
	else:
		velocity.x = move_toward(velocity.x, 0.0, speed)
		velocity.z = move_toward(velocity.z, 0.0, speed)

	_update_motion_animation(input_dir)
	_update_camera_obstruction(delta)
	move_and_slide()

	# Refine air/landing state after collision resolution.
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
			"grounded": is_on_floor(),
			"fps": Engine.get_frames_per_second(),
			"prompt": prompt,
			"gamepad": Input.get_connected_joypads().size() > 0,
			"touch": DisplayServer.is_touchscreen_available(),
			"motion_library": motion_library != null and motion_library.is_active()
		})

func _update_motion_animation(input_dir: Vector2) -> void:
	if motion_library and motion_library.is_active():
		var normalized_speed := Vector2(velocity.x, velocity.z).length() / maxf(running_speed, 0.01)
		motion_library.set_motion(input_dir, normalized_speed)
		return

	# Safe fallback for models without a compatible animation set.
	if animation_player == null:
		return
	if not is_on_floor():
		if velocity.y > 0.15 and animation_player.has_animation(&"jump"):
			_play_animation(&"jump")
		elif velocity.y < -0.15 and animation_player.has_animation(&"fall"):
			_play_animation(&"fall")
		return
	if input_dir.length_squared() < 0.006:
		_play_animation(&"idle")
	elif is_running:
		_play_animation(&"running")
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

	# Hard floor guard: camera world-space Y can never pass below the ground plane.
	var camera_world_position := camera.global_position
	if camera_world_position.y < CAMERA_MIN_WORLD_Y:
		camera_world_position.y = CAMERA_MIN_WORLD_Y
		camera.global_position = camera_world_position
