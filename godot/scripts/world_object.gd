extends StaticBody3D
class_name SandboxWorldObject

@export var display_name: String = "Field Object"
@export var action_label: String = "Interact"
@export_enum("supply", "relay", "beacon") var object_kind: String = "supply"
@export var activated: bool = false

var original_color: Color = Color(0.95, 0.58, 0.2)

func _ready() -> void:
	add_to_group("interactable")

func interact(world: Node) -> String:
	if activated:
		return "%s: already used." % display_name

	activated = true
	match object_kind:
		"supply":
			world.call("add_resource", 1)
			_set_visual_color(Color(0.22, 0.65, 0.48))
			return "SUPPLY SECURED  /  +1 FIELD PART"
		"relay":
			world.call("toggle_weather")
			_set_visual_color(Color(0.2, 0.78, 0.92))
			return "WEATHER RELAY CALIBRATED"
		"beacon":
			world.call("set_checkpoint", global_position)
			_set_visual_color(Color(0.95, 0.75, 0.2))
			return "CHECKPOINT REGISTERED"
	return "%s: done." % display_name

func reset_state() -> void:
	activated = false
	_set_visual_color(original_color)

func _set_visual_color(color: Color) -> void:
	var visual := get_node_or_null("Visual") as MeshInstance3D
	if visual:
		var material := visual.get_active_material(0) as StandardMaterial3D
		if material:
			material.albedo_color = color
			if color.r > 0.75 and color.g > 0.35:
				material.emission_enabled = true
				material.emission = color * 0.25
