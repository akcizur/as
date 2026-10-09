extends Control

signal changed(value: Vector2)
signal released

@export var radius: float = 74.0
@export var deadzone: float = 0.12

var finger_id: int = -1
var center := Vector2.ZERO
var value := Vector2.ZERO

func _ready() -> void:
	custom_minimum_size = Vector2(radius * 2.0, radius * 2.0)
	mouse_filter = Control.MOUSE_FILTER_STOP
	queue_redraw()

func _gui_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		if event.pressed and finger_id == -1:
			finger_id = event.index
			center = size * 0.5
			_set_value(event.position - center)
			accept_event()
		elif not event.pressed and event.index == finger_id:
			finger_id = -1
			value = Vector2.ZERO
			changed.emit(value)
			released.emit()
			queue_redraw()
			accept_event()
	elif event is InputEventScreenDrag and event.index == finger_id:
		_set_value(event.position - center)
		accept_event()

func _set_value(offset: Vector2) -> void:
	var normalized := offset / maxf(radius, 1.0)
	if normalized.length() > 1.0:
		normalized = normalized.normalized()
	if normalized.length() < deadzone:
		normalized = Vector2.ZERO
	value = normalized
	changed.emit(value)
	queue_redraw()

func _draw() -> void:
	var c := size * 0.5
	var r := radius * 0.92
	draw_circle(c, r, Color(0.02, 0.03, 0.04, 0.48))
	draw_arc(c, r, 0.0, TAU, 48, Color(1.0, 1.0, 1.0, 0.22), 2.0)
	var knob := c + value * r * 0.66
	draw_circle(knob, r * 0.34, Color(1.0, 1.0, 1.0, 0.24))
	draw_arc(knob, r * 0.34, 0.0, TAU, 32, Color(1.0, 1.0, 1.0, 0.42), 1.5)
