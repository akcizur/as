extends CanvasLayer

var telemetry_label: Label
var position_label: Label
var prompt_label: Label
var notice_label: Label
var objective_label: Label
var notice_timer: float = 0.0

func _ready() -> void:
	var overlay := Control.new()
	overlay.name = "Overlay"
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(overlay)

	var top_left := _make_panel(overlay, Control.PRESET_TOP_LEFT, Vector2(18.0, 18.0), Vector2(318.0, 110.0))
	var title := _make_label("OPENWORLD  /  SIMULATION", 15, Color(0.96, 0.72, 0.28))
	top_left.add_child(title)
	var subtitle := _make_label("V2.1  ·  GODOT 4  ·  SANDBOX RUNTIME", 10, Color(0.58, 0.69, 0.79))
	top_left.add_child(subtitle)
	objective_label = _make_label("OBJECTIVE   Explore the frontier", 12, Color(0.9, 0.94, 0.98))
	top_left.add_child(objective_label)

	var top_right := _make_panel(overlay, Control.PRESET_TOP_RIGHT, Vector2(-246.0, 18.0), Vector2(228.0, 88.0))
	telemetry_label = _make_label("FPS 60  ·  WALK", 12, Color(0.42, 0.9, 0.78))
	top_right.add_child(telemetry_label)
	position_label = _make_label("X 0.0   Y 0.0   Z 0.0", 10, Color(0.72, 0.8, 0.88))
	top_right.add_child(position_label)
	var resource_label := _make_label("FIELD PARTS   ∞ exploration", 10, Color(0.96, 0.72, 0.28))
	resource_label.name = "ResourceLine"
	top_right.add_child(resource_label)

	var bottom_left := _make_panel(overlay, Control.PRESET_BOTTOM_LEFT, Vector2(18.0, -120.0), Vector2(390.0, 102.0))
	bottom_left.add_child(_make_label("W A S D   MOVE     SHIFT   SPRINT     SPACE   JUMP", 10, Color(0.88, 0.92, 0.97)))
	bottom_left.add_child(_make_label("MOUSE   LOOK     E   INTERACT     B   SPAWN CRATE", 10, Color(0.88, 0.92, 0.97)))
	bottom_left.add_child(_make_label("R   RESET SANDBOX     ESC   RELEASE CURSOR", 10, Color(0.6, 0.71, 0.81)))

	var center_reticle := _make_label("＋", 18, Color(0.96, 0.78, 0.43))
	center_reticle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	center_reticle.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	center_reticle.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	center_reticle.offset_left = -12.0
	center_reticle.offset_top = -16.0
	center_reticle.offset_right = 12.0
	center_reticle.offset_bottom = 16.0
	overlay.add_child(center_reticle)

	prompt_label = _make_label("", 12, Color(0.98, 0.82, 0.48))
	prompt_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	prompt_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	prompt_label.offset_left = -260.0
	prompt_label.offset_top = -88.0
	prompt_label.offset_right = 260.0
	prompt_label.offset_bottom = -52.0
	overlay.add_child(prompt_label)

	notice_label = _make_label("CLICK TO ENTER THE WORLD", 13, Color(0.92, 0.96, 1.0))
	notice_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	notice_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	notice_label.offset_left = -260.0
	notice_label.offset_top = 42.0
	notice_label.offset_right = 260.0
	notice_label.offset_bottom = 78.0
	overlay.add_child(notice_label)

func _make_panel(parent: Control, preset: Control.LayoutPreset, anchor_offsets: Vector2, panel_size: Vector2) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.set_anchors_and_offsets_preset(preset)
	panel.size = panel_size
	if preset == Control.PRESET_TOP_RIGHT:
		panel.offset_left = anchor_offsets.x
		panel.offset_top = anchor_offsets.y
		panel.offset_right = -18.0
		panel.offset_bottom = anchor_offsets.y + panel_size.y
	elif preset == Control.PRESET_BOTTOM_LEFT:
		panel.offset_left = anchor_offsets.x
		panel.offset_top = anchor_offsets.y
		panel.offset_right = anchor_offsets.x + panel_size.x
		panel.offset_bottom = -18.0
	else:
		panel.offset_left = anchor_offsets.x
		panel.offset_top = anchor_offsets.y
		panel.offset_right = anchor_offsets.x + panel_size.x
		panel.offset_bottom = anchor_offsets.y + panel_size.y
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.025, 0.045, 0.07, 0.82)
	style.border_color = Color(0.52, 0.68, 0.78, 0.24)
	style.set_border_width_all(1)
	style.set_corner_radius_all(8)
	style.content_margin_left = 13.0
	style.content_margin_right = 13.0
	style.content_margin_top = 10.0
	style.content_margin_bottom = 9.0
	panel.add_theme_stylebox_override("panel", style)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 5)
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_child(column)
	parent.add_child(panel)
	return panel

func _make_label(text_value: String, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.text = text_value
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return label

func update_telemetry(data: Dictionary) -> void:
	if not is_instance_valid(telemetry_label):
		return
	var speed := float(data.get("speed", 0.0))
	var running := bool(data.get("running", false))
	var fps := int(data.get("fps", 60))
	var pos: Vector3 = data.get("position", Vector3.ZERO)
	telemetry_label.text = "FPS %d  ·  %s  ·  %.1f M/S" % [fps, "SPRINT" if running else "WALK", speed]
	position_label.text = "X %5.1f   Y %4.1f   Z %5.1f" % [pos.x, pos.y, pos.z]
	prompt_label.text = str(data.get("prompt", ""))

func notify(message: String) -> void:
	if is_instance_valid(notice_label):
		notice_label.text = message
		notice_timer = 3.2

func set_objective(message: String) -> void:
	if is_instance_valid(objective_label):
		objective_label.text = "OBJECTIVE   " + message

func _process(delta: float) -> void:
	if notice_timer > 0.0:
		notice_timer -= delta
		if is_instance_valid(notice_label):
			notice_label.modulate.a = clampf(notice_timer * 1.8, 0.0, 1.0)
	else:
		if is_instance_valid(notice_label) and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
			notice_label.modulate.a = 0.0
		elif is_instance_valid(notice_label):
			notice_label.modulate.a = 1.0
			notice_label.text = "CLICK TO ENTER THE WORLD"
