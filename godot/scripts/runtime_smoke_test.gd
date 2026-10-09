extends SceneTree
## Assertions for the production scene. Run after Godot imports assets:
## godot --headless --path godot --script res://scripts/runtime_smoke_test.gd

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	var packed := load("res://scenes/main.tscn") as PackedScene
	if packed == null:
		_fail("Main scene could not be loaded.")
		return

	var game := packed.instantiate()
	root.add_child(game)
	await process_frame
	await physics_frame

	var player := game.get_node_or_null("Player") as CharacterBody3D
	if player == null:
		_fail("Production scene did not create its Player.")
		return

	var capsule := player.get_node_or_null("InvisibleCollisionCapsule") as CollisionShape3D
	if capsule == null or not (capsule.shape is CapsuleShape3D):
		_fail("Player is missing its authoritative capsule collider.")
		return

	var camera := player.get_node_or_null("CameraMount/ThirdPersonCamera") as Camera3D
	if camera == null or not camera.current:
		_fail("Player third-person camera is missing or not current.")
		return

	var model := player.get_node_or_null("Visuals/mixamo_base")
	if model == null or model.find_child("AnimationPlayer", true, false) == null:
		_fail("Animated Mixamo player model or AnimationPlayer is missing.")
		return
	if player.get_node_or_null("TouchControls") == null:
		_fail("Touch controls are not initialized for first-touch fallback.")
		return

	for action in ["move_forward", "move_back", "move_left", "move_right", "jump", "run", "crouch", "aim", "dodge", "turn_180", "interact", "spawn_crate", "reset_player"]:
		if not InputMap.has_action(action):
			_fail("Required InputMap action is missing: %s" % action)
			return

	var interactables := get_nodes_in_group("interactable")
	if interactables.size() < 4:
		_fail("Expected four or more interactable world objects; found %d." % interactables.size())
		return

	# Exercise the supply interaction and full reset, not just scene loading.
	var cache := game.get_node_or_null("FieldSupplyCache") as Node3D
	if cache == null:
		_fail("Field supply cache is missing.")
		return
	player.global_position = cache.global_position + Vector3(0.0, -0.25, 1.4)
	game.call("interact_nearby", player)
	if int(game.get("resource_count")) != 1:
		_fail("Supply interaction did not increment the resource count.")
		return
	player.call("_toggle_crouch")
	if not bool(player.get("is_crouching")):
		_fail("Crouch did not enter its expected state.")
		return
	game.call("reset_sandbox", player)
	if int(game.get("resource_count")) != 0 or bool(cache.get("activated")):
		_fail("Sandbox reset did not restore resources and interactable state.")
		return
	if bool(player.get("is_crouching")) or absf((capsule.shape as CapsuleShape3D).height - 1.8) > 0.01:
		_fail("Sandbox reset did not restore the standing player collision state.")
		return

	print("GAMEPLAY_RUNTIME_TEST_BEGIN")
	print("Player, invisible capsule, animated model, camera, input actions, interactables, supply pickup and reset all passed.")
	print("GAMEPLAY_RUNTIME_TEST_END")
	game.queue_free()
	await process_frame
	quit(0)

func _fail(message: String) -> void:
	push_error("Gameplay runtime test failed: " + message)
	quit(1)
