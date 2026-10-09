extends CharacterBody3D

signal telemetry_changed(data: Dictionary)

const CHARACTER_SCENE: PackedScene = preload("res://assets/models/mixamo_base.glb")
const TOUCH_CONTROLS_SCRIPT: Script = preload("res://scripts/touch_controls.gd")
const CAMERA_DISTANCE: float = 4.8
const CAMERA_MIN_DISTANCE: float = 0.72
const CAMERA_MIN_WORLD_Y: float = 0.35
const ANIMATION_BLEND: float = 0.18

@export_group("Locomotion")
@export var walk_speed: float = 3.6
@export var sprint_speed: float = 6.8
@export var ground_acceleration: float = 20.0
@export var air_acceleration: float = 7.0
@export var ground_deceleration: float = 24.0
@export var jump_velocity: float = 5.6
@export var turn_smoothness: float = 12.0

@export_group("Camera")
@export var mouse_sensitivity: float = 0.0022
@export var touch_look_sensitivity: float = 0.0038
@export var camera_smoothness: float = 18.0
@export var camera_pitch_min: float = -1.0
@export var camera_pitch_max: float = 0.24

var camera_pivot: Node3D
var camera: Camera3D
var body_visual: Node3D
var animation_player: AnimationPlayer
var touch_controls: CanvasLayer
var touch_move_vector := Vector2.ZERO

var camera_pitch: float = -0.12
var telemetry_clock: float = 0.0
var is_sprinting: bool = false
var current_animation: StringName = &""
var gravity_strength: float = float(ProjectSettings.get_setting("physics/3d/default_gravity"))

func _ready() -> void:
	name = "Player"
	add_to_group("player")
	floor_snap_length = 0.3
	floor_max_angle = deg_to_rad(48.0)
	floor_constant_speed = true

	_create_collision_capsule()
	_create_character_visual()
	_create_camera()
	_create_touch_controls()

func _create_collision_capsule() -> void:
	# This collider is intentionally invisible. It is the authoritative player physics shape.
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

	# GLB origin is kept at the player's feet; the capsule stays 1.8 m tall.
	if character is Node3D:
		(character as Node3D).position = Vector3.ZERO

	animation_player = character.find_child("AnimationPlayer", true, false) as AnimationPlayer
	if animation_player == null:
		push_warning("Mixamo model loaded, but no AnimationPlayer was found.")
		return

	if animation_player.has_animation(&"idle"):
		_play_animation(&"idle")
	else:
		push_warning("Mixamo model is missing the expected 'idle' animation.")

func _create_camera() -> void:
	camera_pivot = Node3D.new()
	camera_pivot.name = "CameraPivot"
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
	camera_pivot.rotation.y -= delta.x * touch_look_sensitivity
	camera_pitch = clampf(
		camera_pitch + delta.y * touch_look_sensitivity,
		camera_pitch_min,
		camera_pitch_max
	)
	camera_pivot.rotation.x = camera_pitch

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	elif event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	elif event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		camera_pivot.rotation.y -= event.relative.x * mouse_sensitivity

		camera_pitch = clampf(
			camera_pitch + event.relative.y * mouse_sensitivity,
			camera_pitch_min,
			camera_pitch_max
		)
		camera_pivot.rotation.x = camera_pitch

func _physics_process(delta: float) -> void:
	var input_vector := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	if touch_move_vector.length_squared() > 0.0025:
		input_vector = touch_move_vector

	var move_direction := Vector3(input_vector.x, 0.0, input_vector.y)
	move_direction = move_direction.rotated(Vector3.UP, camera_pivot.rotation.y)
	move_direction.y = 0.0
	if move_direction.length_squared() > 1.0:
		move_direction = move_direction.normalized()

	is_sprinting = Input.is_action_pressed("run") and input_vector.length_squared() > 0.01
	var target_speed := sprint_speed if is_sprinting else walk_speed
	var acceleration := ground_acceleration if is_on_floor() else air_acceleration

	# Vector acceleration preserves momentum through smooth starts and direction changes.
	var horizontal_velocity := Vector3(velocity.x, 0.0, velocity.z)
	var target_velocity := move_direction * target_speed
	if input_vector.length_squared() > 0.01:
		horizontal_velocity = horizontal_velocity.move_toward(target_velocity, acceleration * delta)
	else:
		horizontal_velocity = horizontal_velocity.move_toward(Vector3.ZERO, ground_deceleration * delta)
	velocity.x = horizontal_velocity.x
	velocity.z = horizontal_velocity.z

	if not is_on_floor():
		velocity.y -= gravity_strength * delta
	elif velocity.y < 0.0:
		velocity.y = -0.2

	if is_on_floor() and Input.is_action_just_pressed("jump"):
		velocity.y = jump_velocity

	if move_direction.length_squared() > 0.006:
		var desired_yaw := atan2(-move_direction.x, -move_direction.z)
		body_visual.rotation.y = lerp_angle(
			body_visual.rotation.y,
			desired_yaw,
			minf(delta * turn_smoothness, 1.0)
		)

	_update_locomotion_animation(move_direction)
	_update_camera_obstruction(delta)
	move_and_slide()

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
			"running": is_sprinting,
			"grounded": is_on_floor(),
			"fps": Engine.get_frames_per_second(),
			"prompt": prompt,
			"gamepad": Input.get_connected_joypads().size() > 0,
			"touch": DisplayServer.is_touchscreen_available()
		})

func _update_locomotion_animation(move_direction: Vector3) -> void:
	if animation_player == null:
		return

	var grounded := is_on_floor()
	var moving := move_direction.length_squared() > 0.006
	if not grounded:
		if velocity.y > 0.15 and animation_player.has_animation(&"jump"):
			_play_animation(&"jump")
		elif velocity.y < -0.15 and animation_player.has_animation(&"fall"):
			_play_animation(&"fall")
		elif moving:
			_play_animation(&"running" if is_sprinting else &"walking")
		return

	if not moving:
		_play_animation(&"idle")
	elif is_sprinting:
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
	camera.fov = lerpf(camera.fov, 78.0 if is_sprinting else 72.0, minf(delta * 4.0, 1.0))

	# Hard floor guard: the camera's world-space Y can never pass below the ground plane.
	var camera_world_position := camera.global_position
	if camera_world_position.y < CAMERA_MIN_WORLD_Y:
		camera_world_position.y = CAMERA_MIN_WORLD_Y
		camera.global_position = camera_world_position
