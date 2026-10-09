extends CharacterBody3D

signal telemetry_changed(data: Dictionary)

@export var walk_speed: float = 5.6
@export var sprint_speed: float = 9.2
@export var ground_acceleration: float = 22.0
@export var air_acceleration: float = 6.0
@export var jump_velocity: float = 7.0
@export var mouse_sensitivity: float = 0.0022

var camera_pivot: Node3D
var camera: Camera3D
var body_visual: Node3D
var camera_pitch: float = -0.12
var telemetry_clock: float = 0.0
var is_sprinting: bool = false

func _ready() -> void:
	name = "Player"
	add_to_group("player")
	floor_snap_length = 0.3
	floor_max_angle = deg_to_rad(48.0)

	var collider := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.38
	capsule.height = 1.8
	collider.shape = capsule
	collider.position.y = 0.9
	add_child(collider)

	body_visual = Node3D.new()
	body_visual.name = "BodyVisual"
	add_child(body_visual)

	var body_mesh := MeshInstance3D.new()
	body_mesh.name = "Suit"
	var capsule_mesh := CapsuleMesh.new()
	capsule_mesh.radius = 0.34
	capsule_mesh.height = 1.55
	body_mesh.mesh = capsule_mesh
	body_mesh.position.y = 0.92
	var suit_material := StandardMaterial3D.new()
	suit_material.albedo_color = Color(0.09, 0.63, 0.72)
	suit_material.metallic = 0.16
	suit_material.roughness = 0.36
	body_mesh.material_override = suit_material
	body_visual.add_child(body_mesh)

	var head := MeshInstance3D.new()
	var head_mesh := SphereMesh.new()
	head_mesh.radius = 0.22
	head_mesh.height = 0.44
	head.mesh = head_mesh
	head.position = Vector3(0.0, 1.83, 0.0)
	var head_material := StandardMaterial3D.new()
	head_material.albedo_color = Color(0.78, 0.68, 0.55)
	head_material.roughness = 0.8
	head.material_override = head_material
	body_visual.add_child(head)

	var pack := MeshInstance3D.new()
	var pack_mesh := BoxMesh.new()
	pack_mesh.size = Vector3(0.48, 0.52, 0.2)
	pack.mesh = pack_mesh
	pack.position = Vector3(0.0, 1.03, 0.27)
	var pack_material := StandardMaterial3D.new()
	pack_material.albedo_color = Color(0.08, 0.15, 0.22)
	pack_material.roughness = 0.8
	pack.material_override = pack_material
	body_visual.add_child(pack)

	camera_pivot = Node3D.new()
	camera_pivot.name = "CameraPivot"
	camera_pivot.position.y = 1.42
	camera_pivot.rotation.x = camera_pitch
	add_child(camera_pivot)

	camera = Camera3D.new()
	camera.name = "ThirdPersonCamera"
	camera.position = Vector3(0.0, 0.22, 5.2)
	camera.fov = 76.0
	camera.near = 0.08
	camera.far = 320.0
	camera.current = true
	camera_pivot.add_child(camera)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	elif event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	elif event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		camera_pivot.rotation.y -= event.relative.x * mouse_sensitivity
		camera_pitch = clampf(camera_pitch - event.relative.y * mouse_sensitivity, -0.72, 0.32)
		camera_pivot.rotation.x = camera_pitch

func _physics_process(delta: float) -> void:
	var input_vector := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var camera_yaw := camera_pivot.rotation.y
	var move_direction := Vector3(input_vector.x, 0.0, input_vector.y).rotated(Vector3.UP, camera_yaw)
	move_direction.y = 0.0
	move_direction = move_direction.normalized()

	is_sprinting = Input.is_action_pressed("run") and input_vector.length() > 0.05
	var target_speed := sprint_speed if is_sprinting else walk_speed
	var acceleration := ground_acceleration if is_on_floor() else air_acceleration

	velocity.x = move_toward(velocity.x, move_direction.x * target_speed, acceleration * delta)
	velocity.z = move_toward(velocity.z, move_direction.z * target_speed, acceleration * delta)

	if not is_on_floor():
		velocity.y -= 22.0 * delta
	elif velocity.y < 0.0:
		velocity.y = -0.2

	if is_on_floor() and Input.is_action_just_pressed("jump"):
		velocity.y = jump_velocity

	if move_direction.length() > 0.08:
		var desired_yaw := atan2(-move_direction.x, -move_direction.z)
		body_visual.rotation.y = lerp_angle(body_visual.rotation.y, desired_yaw, minf(delta * 12.0, 1.0))

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
			"prompt": prompt
		})
