extends Control

signal look_delta(delta: Vector2)

var finger_id: int = -1
var last_position := Vector2.ZERO

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP

func _gui_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		if event.pressed and finger_id == -1:
			finger_id = event.index
			last_position = event.position
			accept_event()
		elif not event.pressed and event.index == finger_id:
			finger_id = -1
			accept_event()
	elif event is InputEventScreenDrag and event.index == finger_id:
		var delta := event.position - last_position
		last_position = event.position
		look_delta.emit(delta)
		accept_event()
