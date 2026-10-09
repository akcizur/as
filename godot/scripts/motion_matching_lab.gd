extends Node3D
## Isolated animation inspection lab. Does not instantiate or replace PlayerController.

const MODEL_SCENE: PackedScene = preload("res://assets/models/mixamo_base.glb")
const CLIP_KEYS := [KEY_1, KEY_2, KEY_3, KEY_4, KEY_5, KEY_6]

var subject: Node3D
var animation_player: AnimationPlayer
var status_label: Label
var clip_names: PackedStringArray = []
var selected_clip := -1
var paused := false

func _ready() -> void:
	_build_environment()
	subject = MODEL_SCENE.instantiate() as Node3D
	subject.name = "MotionMatchingSubject"
	add_child(subject)

	animation_player = subject.find_child("AnimationPlayer", true, false) as AnimationPlayer
	if animation_player == null:
		push_error("Motion Matching Lab: no AnimationPlayer found in mixamo_base.glb")
	_build_overlay()
	if animation_player == null:
		status_label.text = "ASSET ERROR: AnimationPlayer not found"
		return

	clip_names = animation_player.get_animation_list()
	clip_names.sort()
	_set_clip_by_name("idle")
	if selected_clip == -1 and not clip_names.is_empty():
		_set_clip(0)
	_refresh_status()

func _input(event: InputEvent) -> void:
	if not event is InputEventKey or not event.pressed or event.echo:
		return
	var key_event := event as InputEventKey
	for index in range(CLIP_KEYS.size()):
		if key_event.keycode == CLIP_KEYS[index] and index < clip_names.size():
			_set_clip(index)
			return
	match key_event.keycode:
		KEY_SPACE:
			if animation_player == null:
				return
			paused = not paused
			animation_player.pause() if paused else animation_player.play()
			_refresh_status()
		KEY_R:
			if animation_player != null and selected_clip >= 0:
				animation_player.play(clip_names[selected_clip], 0.0, 1.0, false)
				paused = false
				_refresh_status()
		KEY_LEFT:
			if subject:
				subject.rotate_y(0.15)
		KEY_RIGHT:
			if subject:
				subject.rotate_y(-0.15)

func _set_clip_by_name(wanted: String) -> void:
	var index := clip_names.find(wanted)
	if index >= 0:
		_set_clip(index)

func _set_clip(index: int) -> void:
	if animation_player == null or index < 0 or index >= clip_names.size():
		return
	selected_clip = index
	paused = false
	animation_player.play(clip_names[index], 0.0, 1.0, false)
	_refresh_status()

func _build_overlay() -> void:
	var canvas := CanvasLayer.new()
	canvas.name = "LabOverlay"
	add_child(canvas)

	var panel := PanelContainer.new()
	panel.position = Vector2(16.0, 16.0)
	panel.custom_minimum_size = Vector2(330.0, 180.0)
	canvas.add_child(panel)

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 14)
	margin.add_theme_constant_override("margin_right", 14)
	margin.add_theme_constant_override("margin_top", 12)
	margin.add_theme_constant_override("margin_bottom", 12)
	panel.add_child(margin)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 6)
	margin.add_child(column)

	var heading := Label.new()
	heading.text = "MOTION / ANIMATION LAB"
	heading.add_theme_font_size_override("font_size", 16)
	column.add_child(heading)

	status_label = Label.new()
	status_label.text = "Loading imported animation clips…"
	status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(status_label)

	var controls := Label.new()
	controls.text = "1–6 select clip   SPACE pause/resume\nR restart clip   ← / → rotate character"
	controls.add_theme_font_size_override("font_size", 12)
	column.add_child(controls)

func _refresh_status() -> void:
	if status_label == null:
		return
	if animation_player == null:
		status_label.text = "ASSET ERROR: AnimationPlayer not found"
		return
	var lines: PackedStringArray = []
	for index in range(mini(clip_names.size(), CLIP_KEYS.size())):
		var marker := "▶ " if index == selected_clip else "  "
		lines.append("%s%d  %s" % [marker, index + 1, clip_names[index]])
	var active_name := str(clip_names[selected_clip]) if selected_clip >= 0 else "none"
	var playback_state := "PAUSED" if paused else "PLAYING"
	status_label.text = "Active: %s (%s)\n%s" % [active_name, playback_state, "\n".join(lines)]

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
