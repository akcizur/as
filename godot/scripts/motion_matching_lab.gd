extends Node3D
## Isolated staging scene; does not replace or preload the live player controller.

const MODEL_SCENE: PackedScene = preload("res://assets/models/mixamo_base.glb")

func _ready() -> void:
	_build_environment()
	var model := MODEL_SCENE.instantiate()
	model.name = "MotionMatchingSubject"
	add_child(model)

func _build_environment() -> void:
	var world_environment := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_SKY
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color(0.72, 0.76, 0.84)
	environment.ambient_light_energy = 0.65
	world_environment.environment = environment
	add_child(world_environment)

	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-48.0, -32.0, 0.0)
	sun.light_energy = 1.1
	add_child(sun)

	var floor_body := StaticBody3D.new()
	floor_body.name = "TestFloor"
	var floor_shape := CollisionShape3D.new()
	var box_shape := BoxShape3D.new()
	box_shape.size = Vector3(24.0, 0.2, 24.0)
	floor_shape.shape = box_shape
	floor_shape.position.y = -0.1
	floor_body.add_child(floor_shape)
	var floor_mesh := MeshInstance3D.new()
	var plane := BoxMesh.new()
	plane.size = box_shape.size
	floor_mesh.mesh = plane
	floor_mesh.position.y = -0.1
	floor_body.add_child(floor_mesh)
	add_child(floor_body)

	var camera := Camera3D.new()
	camera.name = "LabCamera"
	camera.position = Vector3(3.5, 2.4, 5.2)
	camera.look_at(Vector3(0.0, 1.0, 0.0), Vector3.UP)
	camera.current = true
	add_child(camera)
