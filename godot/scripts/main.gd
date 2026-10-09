extends Node3D

const PLAYER_SCRIPT = preload("res://scripts/player_controller.gd")
const HUD_SCRIPT = preload("res://scripts/hud.gd")
const WORLD_OBJECT_SCRIPT = preload("res://scripts/world_object.gd")

var world_environment: Environment
var sun: DirectionalLight3D
var player: CharacterBody3D
var hud: CanvasLayer
var resource_count: int = 0
var weather_active: bool = false
var world_clock: float = 0.25
var checkpoint_position: Vector3 = Vector3(0.0, 0.2, 7.0)
var spawned_crates: Array[RigidBody3D] = []

func _ready() -> void:
	_create_atmosphere()
	_create_terrain()
	_create_world_props()
	_create_interactables()
	_create_player()
	_create_hud()
	_notify("FRONTIER ONLINE  /  Find the field relay and explore.")
	set_process(true)

func _process(delta: float) -> void:
	world_clock = fposmod(world_clock + delta * 0.0018, 1.0)
	if is_instance_valid(sun):
		sun.rotation_degrees.x = -38.0 - sin(world_clock * TAU) * 12.0
		sun.rotation_degrees.y = -28.0 + cos(world_clock * TAU) * 10.0
	if world_environment:
		world_environment.ambient_light_energy = 0.62 + (sin(world_clock * TAU) + 1.0) * 0.08

func _create_atmosphere() -> void:
	var world_env := WorldEnvironment.new()
	world_env.name = "Atmosphere"
	world_environment = Environment.new()
	world_environment.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var sky_material := ProceduralSkyMaterial.new()
	sky_material.sky_top_color = Color(0.035, 0.095, 0.17)
	sky_material.sky_horizon_color = Color(0.47, 0.62, 0.68)
	sky_material.ground_bottom_color = Color(0.055, 0.075, 0.075)
	sky_material.ground_horizon_color = Color(0.3, 0.42, 0.4)
	sky.sky_material = sky_material
	world_environment.sky = sky
	world_environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	world_environment.ambient_light_color = Color(0.48, 0.59, 0.68)
	world_environment.ambient_light_energy = 0.72
	world_environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	world_environment.fog_enabled = true
	world_environment.fog_light_color = Color(0.34, 0.47, 0.52)
	world_environment.fog_density = 0.0018
	world_env.environment = world_environment
	add_child(world_env)

	sun = DirectionalLight3D.new()
	sun.name = "Sun"
	sun.rotation_degrees = Vector3(-42.0, -28.0, 0.0)
	sun.light_color = Color(1.0, 0.86, 0.68)
	sun.light_energy = 1.35
	sun.shadow_enabled = true
	add_child(sun)

func _create_terrain() -> void:
	var ground_body := StaticBody3D.new()
	ground_body.name = "Terrain"
	ground_body.position.y = -0.5
	add_child(ground_body)

	var ground_mesh := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(300.0, 300.0)
	ground_mesh.mesh = plane
	ground_mesh.position.y = 0.5
	ground_mesh.material_override = _material(Color(0.16, 0.25, 0.22), 0.95)
	ground_body.add_child(ground_mesh)

	var ground_shape := CollisionShape3D.new()
	var ground_box := BoxShape3D.new()
	ground_box.size = Vector3(300.0, 1.0, 300.0)
	ground_shape.shape = ground_box
	ground_body.add_child(ground_shape)

	_add_visual_box("Trail", Vector3(0.0, 0.018, -28.0), Vector3(5.2, 0.04, 100.0), Color(0.25, 0.28, 0.25))
	_add_visual_box("Trail Edge L", Vector3(-2.8, 0.025, -28.0), Vector3(0.12, 0.055, 100.0), Color(0.45, 0.43, 0.32))
	_add_visual_box("Trail Edge R", Vector3(2.8, 0.025, -28.0), Vector3(0.12, 0.055, 100.0), Color(0.45, 0.43, 0.32))

	_add_hill(Vector3(-52.0, -3.0, -40.0), Vector3(35.0, 15.0, 43.0), Color(0.12, 0.2, 0.2))
	_add_hill(Vector3(47.0, -4.0, -63.0), Vector3(38.0, 18.0, 48.0), Color(0.13, 0.23, 0.21))
	_add_hill(Vector3(-88.0, -5.0, 25.0), Vector3(42.0, 18.0, 50.0), Color(0.12, 0.19, 0.19))
	_add_hill(Vector3(91.0, -4.0, 22.0), Vector3(46.0, 17.0, 45.0), Color(0.14, 0.22, 0.2))

	var rng := RandomNumberGenerator.new()
	rng.seed = 2101
	for index in range(82):
		var x := rng.randf_range(-91.0, 91.0)
		var z := rng.randf_range(-92.0, 83.0)
		if Vector2(x, z - 5.0).length() < 15.0 or (absf(x) < 7.0 and z > -65.0 and z < 12.0):
			continue
		var green := rng.randf_range(0.18, 0.34)
		var foliage := Color(0.055 + green * 0.4, green, 0.18 + green * 0.28)
		_add_tree(Vector3(x, 0.0, z), rng.randf_range(0.72, 1.3), foliage)

	for index in range(46):
		var rock_x := rng.randf_range(-88.0, 88.0)
		var rock_z := rng.randf_range(-88.0, 78.0)
		var rock := MeshInstance3D.new()
		rock.name = "LandscapeRock_%02d" % index
		var rock_mesh := SphereMesh.new()
		rock_mesh.radius = 1.0
		rock_mesh.height = 2.0
		rock.mesh = rock_mesh
		rock.scale = Vector3(rng.randf_range(0.35, 1.5), rng.randf_range(0.25, 0.85), rng.randf_range(0.35, 1.3))
		rock.position = Vector3(rock_x, rock.scale.y * 0.55, rock_z)
		rock.material_override = _material(Color(0.24, 0.29, 0.3), 0.92)
		add_child(rock)

func _create_world_props() -> void:
	_add_solid_box("Outpost", Vector3(-17.0, 0.0, -20.0), Vector3(8.0, 3.1, 7.0), Color(0.16, 0.22, 0.27))
	_add_visual_box("Outpost Roof", Vector3(-17.0, 3.25, -20.0), Vector3(8.8, 0.32, 7.8), Color(0.08, 0.13, 0.18))
	_add_visual_box("Outpost Trim", Vector3(-17.0, 1.2, -16.43), Vector3(2.4, 1.0, 0.12), Color(0.09, 0.68, 0.74))
	_add_solid_box("Supply Platform", Vector3(12.0, 0.0, -42.0), Vector3(8.0, 0.35, 8.0), Color(0.18, 0.23, 0.25))
	_add_visual_box("Landing Pad Mark", Vector3(12.0, 0.19, -42.0), Vector3(4.8, 0.025, 4.8), Color(0.82, 0.57, 0.23))

	for index in range(7):
		var x := -3.0 + float(index) * 1.0
		_add_visual_box("Trail Marker %d" % index, Vector3(x, 0.18, -10.0 - float(index) * 8.0), Vector3(0.18, 0.36, 0.18), Color(0.85, 0.61, 0.29))

func _create_interactables() -> void:
	_create_interactable("Field Supply Cache", Vector3(4.5, 0.0, -11.5), Vector3(1.2, 0.95, 0.9), Color(0.91, 0.48, 0.16), "supply", "Open cache")
	_create_interactable("Weather Relay", Vector3(-12.0, 0.0, -13.0), Vector3(0.9, 1.6, 0.9), Color(0.12, 0.68, 0.87), "relay", "Calibrate relay")
	_create_interactable("Frontier Beacon", Vector3(12.0, 0.35, -39.0), Vector3(0.8, 2.1, 0.8), Color(0.95, 0.72, 0.24), "beacon", "Register checkpoint")
	_create_interactable("Ridge Supply Cache", Vector3(-31.0, 0.0, -47.0), Vector3(1.3, 0.9, 1.0), Color(0.91, 0.48, 0.16), "supply", "Open cache")

func _create_interactable(display_name: String, base_position: Vector3, size: Vector3, color: Color, kind: String, action: String) -> void:
	var object := StaticBody3D.new()
	object.set_script(WORLD_OBJECT_SCRIPT)
	object.set("display_name", display_name)
	object.set("action_label", action)
	object.set("object_kind", kind)
	object.set("original_color", color)
	object.position = base_position + Vector3(0.0, size.y * 0.5, 0.0)
	object.name = display_name.replace(" ", "")
	add_child(object)

	var visual := MeshInstance3D.new()
	visual.name = "Visual"
	var box := BoxMesh.new()
	box.size = size
	visual.mesh = box
	var material := _material(color, 0.38, 0.24)
	material.emission_enabled = true
	material.emission = color * 0.12
	visual.material_override = material
	object.add_child(visual)

	var collider := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	collider.shape = shape
	object.add_child(collider)

	var beacon := MeshInstance3D.new()
	var beacon_mesh := BoxMesh.new()
	beacon_mesh.size = Vector3(0.14, 0.14, 0.14)
	beacon.mesh = beacon_mesh
	beacon.position.y = size.y * 0.5 + 0.15
	beacon.material_override = _material(Color(1.0, 0.78, 0.36), 0.28, 0.3)
	object.add_child(beacon)

func _create_player() -> void:
	player = CharacterBody3D.new()
	player.set_script(PLAYER_SCRIPT)
	player.position = Vector3(0.0, 0.2, 7.0)
	add_child(player)

func _create_hud() -> void:
	hud = CanvasLayer.new()
	hud.set_script(HUD_SCRIPT)
	add_child(hud)
	if is_instance_valid(player):
		player.connect("telemetry_changed", Callable(hud, "update_telemetry"))

func _add_tree(at: Vector3, scale_factor: float, foliage_color: Color) -> void:
	var tree := StaticBody3D.new()
	tree.name = "Pine"
	tree.position = at
	add_child(tree)

	var trunk := MeshInstance3D.new()
	var trunk_mesh := CylinderMesh.new()
	trunk_mesh.top_radius = 0.12 * scale_factor
	trunk_mesh.bottom_radius = 0.25 * scale_factor
	trunk_mesh.height = 2.4 * scale_factor
	trunk.mesh = trunk_mesh
	trunk.position.y = 1.2 * scale_factor
	trunk.material_override = _material(Color(0.25, 0.17, 0.12), 0.96)
	tree.add_child(trunk)

	var crown := MeshInstance3D.new()
	var crown_mesh := SphereMesh.new()
	crown_mesh.radius = 1.0
	crown_mesh.height = 2.0
	crown.mesh = crown_mesh
	crown.scale = Vector3(1.0, 1.3, 1.0) * scale_factor
	crown.position.y = 2.45 * scale_factor
	crown.material_override = _material(foliage_color, 0.9)
	tree.add_child(crown)

	var shape_node := CollisionShape3D.new()
	var shape := CapsuleShape3D.new()
	shape.radius = 0.3 * scale_factor
	shape.height = 2.6 * scale_factor
	shape_node.shape = shape
	shape_node.position.y = 1.3 * scale_factor
	tree.add_child(shape_node)

func _add_hill(at: Vector3, hill_scale: Vector3, color: Color) -> void:
	var hill := MeshInstance3D.new()
	hill.name = "DistantRidge"
	var sphere := SphereMesh.new()
	sphere.radius = 1.0
	sphere.height = 2.0
	hill.mesh = sphere
	hill.position = at
	hill.scale = hill_scale
	hill.material_override = _material(color, 1.0)
	add_child(hill)

func _add_visual_box(object_name: String, center: Vector3, size: Vector3, color: Color) -> MeshInstance3D:
	var visual := MeshInstance3D.new()
	visual.name = object_name
	var mesh := BoxMesh.new()
	mesh.size = size
	visual.mesh = mesh
	visual.position = center
	visual.material_override = _material(color, 0.86)
	add_child(visual)
	return visual

func _add_solid_box(object_name: String, base_position: Vector3, size: Vector3, color: Color) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.name = object_name
	body.position = base_position + Vector3(0.0, size.y * 0.5, 0.0)
	add_child(body)
	var visual := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	visual.mesh = mesh
	visual.material_override = _material(color, 0.82)
	body.add_child(visual)
	var collider := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	collider.shape = shape
	body.add_child(collider)
	return body

func _material(color: Color, roughness: float = 0.82, metallic: float = 0.0) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = roughness
	material.metallic = metallic
	return material

func get_interaction_prompt(actor: Node3D) -> String:
	var nearest: Node3D
	var nearest_distance := 4.0
	for candidate in get_tree().get_nodes_in_group("interactable"):
		if not is_instance_valid(candidate):
			continue
		var distance := actor.global_position.distance_to((candidate as Node3D).global_position)
		if distance < nearest_distance:
			nearest = candidate as Node3D
			nearest_distance = distance
	if nearest == null:
		return ""
	var label := str(nearest.get("display_name"))
	var action := str(nearest.get("action_label"))
	if bool(nearest.get("activated")):
		return "%s  /  ALREADY USED" % label.to_upper()
	return "[ E ]  %s  —  %s" % [action.to_upper(), label.to_upper()]

func interact_nearby(actor: Node3D) -> void:
	var nearest: Node3D
	var nearest_distance := 4.0
	for candidate in get_tree().get_nodes_in_group("interactable"):
		if not is_instance_valid(candidate):
			continue
		var object := candidate as Node3D
		var distance := actor.global_position.distance_to(object.global_position)
		if distance < nearest_distance:
			nearest = object
			nearest_distance = distance
	if nearest == null:
		_notify("NO INTERACTABLE IN RANGE")
		return
	var result := str(nearest.call("interact", self))
	_notify(result)
	if bool(nearest.get("activated")):
		if str(nearest.get("object_kind")) == "supply":
			_update_objective("Recover supplies and reach the beacon")
		elif str(nearest.get("object_kind")) == "relay":
			_update_objective("Relay calibrated · explore the ridge")

func add_resource(amount: int) -> void:
	resource_count += amount
	if is_instance_valid(hud) and hud.has_method("set_resource_count"):
		hud.call("set_resource_count", resource_count)
	_notify("FIELD PARTS +%d  /  TOTAL %d" % [amount, resource_count])

func toggle_weather() -> void:
	weather_active = not weather_active
	if world_environment:
		world_environment.fog_density = 0.009 if weather_active else 0.0018
		world_environment.fog_light_color = Color(0.22, 0.31, 0.38) if weather_active else Color(0.34, 0.47, 0.52)
		world_environment.ambient_light_energy = 0.38 if weather_active else 0.72
	if is_instance_valid(sun):
		sun.light_energy = 0.62 if weather_active else 1.35
	_notify("ATMOSPHERE  /  %s" % ("CLOUDY" if weather_active else "CLEAR"))

func set_checkpoint(position_value: Vector3) -> void:
	checkpoint_position = Vector3(position_value.x, 0.2, position_value.z)
	_update_objective("Checkpoint registered · roam freely")
	_notify("CHECKPOINT SAVED  /  PRESS R TO RESET THE SANDBOX")

func spawn_crate(actor: Node3D) -> void:
	if spawned_crates.size() >= 24:
		_notify("SANDBOX LIMIT  /  RESET TO CLEAR PROPS")
		return
	var forward := -actor.global_basis.z
	var camera_pivot := actor.get_node_or_null("CameraPivot") as Node3D
	if camera_pivot:
		forward = -camera_pivot.global_basis.z
	var crate := RigidBody3D.new()
	crate.name = "SpawnedCrate_%02d" % (spawned_crates.size() + 1)
	crate.position = actor.global_position + forward * 2.4 + Vector3.UP * 1.4
	crate.mass = 1.4
	crate.linear_damp = 0.35
	crate.angular_damp = 0.6
	add_child(crate)

	var box_mesh := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = Vector3(0.9, 0.9, 0.9)
	box_mesh.mesh = mesh
	var crate_material := _material(Color(0.92, 0.43, 0.13), 0.62, 0.05)
	crate_material.emission_enabled = true
	crate_material.emission = Color(0.22, 0.055, 0.01)
	box_mesh.material_override = crate_material
	crate.add_child(box_mesh)

	var collider := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = Vector3(0.9, 0.9, 0.9)
	collider.shape = shape
	crate.add_child(collider)
	crate.apply_central_impulse(forward * 2.1 + Vector3.UP * 1.0)
	spawned_crates.append(crate)
	_notify("SANDBOX PROP SPAWNED  /  %d ACTIVE" % spawned_crates.size())

func player_respawn(actor: Node3D) -> void:
	actor.global_position = checkpoint_position
	actor.set("velocity", Vector3.ZERO)
	_notify("RESPAWNED AT CHECKPOINT")

func reset_sandbox(actor: Node3D) -> void:
	for crate in spawned_crates:
		if is_instance_valid(crate):
			crate.queue_free()
	spawned_crates.clear()
	resource_count = 0
	if is_instance_valid(hud) and hud.has_method("set_resource_count"):
		hud.call("set_resource_count", resource_count)
	for candidate in get_tree().get_nodes_in_group("interactable"):
		if is_instance_valid(candidate) and candidate.has_method("reset_state"):
			candidate.call("reset_state")
	checkpoint_position = Vector3(0.0, 0.2, 7.0)
	actor.global_position = checkpoint_position
	actor.set("velocity", Vector3.ZERO)
	weather_active = false
	if world_environment:
		world_environment.fog_density = 0.0018
		world_environment.fog_light_color = Color(0.34, 0.47, 0.52)
		world_environment.ambient_light_energy = 0.72
	if is_instance_valid(sun):
		sun.light_energy = 1.35
	_update_objective("Explore the frontier")
	_notify("SANDBOX RESET  /  WORLD STATE RESTORED")

func _update_objective(value: String) -> void:
	if is_instance_valid(hud) and hud.has_method("set_objective"):
		hud.call("set_objective", value)

func _notify(message: String) -> void:
	if is_instance_valid(hud) and hud.has_method("notify"):
		hud.call("notify", message)
