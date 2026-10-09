extends CanvasLayer

const JOYSTICK_SCRIPT: Script = preload("res://scripts/touch_joystick.gd")
const LOOK_SCRIPT: Script = preload("res://scripts/touch_look.gd")

signal move_changed(value: Vector2)
signal look_delta(delta: Vector2)

var joystick: Control
var look_zone: Control
var controls_root: Control

func _ready() -> void:
	if not DisplayServer.is_touchscreen_available():
		queue_free()
		return
	
	layer = 20
	controls_root = Control.new()
	controls_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	controls_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(controls_root)
	
	_create_look_zone()
	_create_joystick()
	_create_action_buttons()

func _create_look_zone() -> void:
	look_zone = Control.new()
	look_zone.set_anchors_preset(Control.PRESET_RIGHT_WIDE)
	look_zone.anchor_left = 0.42
	look_zone.anchor_top = 0.0
	look_zone.anchor_right = 1.0
	look_zone.anchor_bottom = 1.0
	look_zone.offset_left = 0.0
	look_zone.offset_top = 0.0
	look_zone.offset_right = 0.0
	look_zone.offset_bottom = 0.0
	look_zone.mouse_filter = Control.MOUSE_FILTER_STOP
	look_zone.set_script(LOOK_SCRIPT)
	controls_root.add_child(look_zone)
	look_zone.look_delta.connect(func(delta: Vector2): look_delta.emit(delta))

func _create_joystick() -> void:
	joystick = Control.new()
	joystick.name = "MoveJoystick"
	joystick.set_script(JOYSTICK_SCRIPT)
	joystick.position = Vector2(32.0, -190.0)
	joystick.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	joystick.offset_left = 28.0
	joystick.offset_top = -190.0
	joystick.offset_right = 178.0
	joystick.offset_bottom = -40.0
	controls_root.add_child(joystick)
	joystick.changed.connect(func(value: Vector2): move_changed.emit(value))

func _create_action_buttons() -> void:
	_create_button("JUMP", "jump", Vector2(-188.0, -164.0), Vector2(92.0, 58.0))
	_create_button("RUN", "run", Vector2(-292.0, -94.0), Vector2(92.0, 52.0))
	_create_button("USE", "interact", Vector2(-188.0, -92.0), Vector2(92.0, 52.0))
	_create_button("RESET", "reset_player", Vector2(-292.0, -32.0), Vector2(92.0, 42.0))

func _create_button(label: String, action: StringName, offset: Vector2, button_size: Vector2) -> void:
	var button := Button.new()
	button.text = label
	button.custom_minimum_size = button_size
	button.position = offset
	button.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	button.offset_left = offset.x
	button.offset_top = offset.y
	button.offset_right = offset.x + button_size.x
	button.offset_bottom = offset.y + button_size.y
	button.mouse_filter = Control.MOUSE_FILTER_STOP
	button.add_theme_font_size_override("font_size", 14)
	button.modulate = Color(1.0, 1.0, 1.0, 0.78)
	controls_root.add_child(button)
	button.button_down.connect(func(): Input.action_press(action))
	button.button_up.connect(func(): Input.action_release(action))
