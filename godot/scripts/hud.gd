extends CanvasLayer

const HUD_IDLE_DELAY := 4.0
const HUD_FADE_SECONDS := 0.65
const NOTICE_DURATION := 2.8

var ambient_hud: Control
var objective_label: Label
var resource_label: Label
var reticle_label: Label
var prompt_label: Label
var notice_label: Label
var idle_timer := HUD_IDLE_DELAY
var ambient_alpha := 1.0
var notice_timer := 0.0
var previous_input_source := ""

func _ready() -> void:
	layer = 10
	var overlay := Control.new()
	overlay.name = "Overlay"
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(overlay)

	ambient_hud = Control.new()
	ambient_hud.name = "AmbientHUD"
	ambient_hud.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ambient_hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.add_child(ambient_hud)

	objective_label = _make_label("EXPLORE THE FRONTIER", 12, Color(0.91, 0.94, 0.96, 0.92))
	objective_label.position = Vector2(22.0, 20.0)
	objective_label.size = Vector2(300.0, 24.0)
	ambient_hud.add_child(objective_label)

	resource_label = _make_label("PARTS  0", 11, Color(0.91, 0.94, 0.96, 0.82))
	resource_label.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	resource_label.offset_left = -132.0
	resource_label.offset_top = 22.0
	resource_label.offset_right = -22.0
	resource_label.offset_bottom = 44.0
	resource_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	ambient_hud.add_child(resource_label)

	reticle_label = _make_label("·", 24, Color(1.0, 1.0, 1.0, 0.42))
	reticle_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	reticle_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	reticle_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	reticle_label.offset_left = -8.0
	reticle_label.offset_top = -12.0
	reticle_label.offset_right = 8.0
	reticle_label.offset_bottom = 12.0
	ambient_hud.add_child(reticle_label)

	prompt_label = _make_label("", 12, Color(0.98, 0.94, 0.82, 0.96))
	prompt_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	prompt_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	prompt_label.offset_left = -260.0
	prompt_label.offset_top = -86.0
	prompt_label.offset_right = 260.0
	prompt_label.offset_bottom = -54.0
	prompt_label.visible = false
	overlay.add_child(prompt_label)

	notice_label = _make_label("", 12, Color(0.94, 0.96, 0.98))
	notice_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	notice_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	notice_label.offset_left = -280.0
	notice_label.offset_top = 48.0
	notice_label.offset_right = 280.0
	notice_label.offset_bottom = 78.0
	notice_label.modulate.a = 0.0
	overlay.add_child(notice_label)

func _input(event: InputEvent) -> void:
	if event is InputEventMouseMotion:
		if (event as InputEventMouseMotion).relative.length_squared() > 0.8:
			_mark_activity()
	elif event is InputEventScreenTouch:
		if (event as InputEventScreenTouch).pressed:
			_mark_activity()
	elif event is InputEventScreenDrag:
		_mark_activity()
	elif event is InputEventKey:
		if (event as InputEventKey).pressed and not (event as InputEventKey).echo:
			_mark_activity()
	elif event is InputEventMouseButton:
		if (event as InputEventMouseButton).pressed:
			_mark_activity()
	elif event is InputEventJoypadButton:
		if (event as InputEventJoypadButton).pressed:
			_mark_activity()
	elif event is InputEventJoypadMotion:
		if absf((event as InputEventJoypadMotion).axis_value) > 0.18:
			_mark_activity()

func _mark_activity() -> void:
	idle_timer = HUD_IDLE_DELAY

func _make_label(text_value: String, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.text = text_value
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return label

func update_telemetry(data: Dictionary) -> void:
	if not is_instance_valid(ambient_hud):
		return
	var speed := float(data.get("speed", 0.0))
	if speed > 0.12:
		_mark_activity()
	var input_source := str(data.get("input_source", ""))
	if not input_source.is_empty() and input_source != previous_input_source:
		previous_input_source = input_source
		_mark_activity()
	var prompt := str(data.get("prompt", ""))
	prompt_label.text = prompt
	prompt_label.visible = not prompt.is_empty()

func notify(message: String) -> void:
	if not is_instance_valid(notice_label):
		return
	notice_label.text = message
	notice_timer = NOTICE_DURATION
	notice_label.modulate.a = 1.0
	_mark_activity()

func set_objective(message: String) -> void:
	if is_instance_valid(objective_label):
		objective_label.text = message.to_upper()
		_mark_activity()

func set_resource_count(count: int) -> void:
	if is_instance_valid(resource_label):
		resource_label.text = "PARTS  %d" % count
		_mark_activity()

func _process(delta: float) -> void:
	idle_timer = maxf(0.0, idle_timer - delta)
	var target_alpha := 1.0 if idle_timer > 0.0 else 0.0
	ambient_alpha = move_toward(ambient_alpha, target_alpha, delta / HUD_FADE_SECONDS)
	if is_instance_valid(ambient_hud):
		ambient_hud.modulate.a = ambient_alpha

	if notice_timer > 0.0:
		notice_timer = maxf(0.0, notice_timer - delta)
		if is_instance_valid(notice_label):
			notice_label.modulate.a = clampf(notice_timer / 0.35, 0.0, 1.0)
	elif is_instance_valid(notice_label):
		notice_label.modulate.a = 0.0
