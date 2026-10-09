extends SceneTree
## Headless diagnostic for the Mixamo asset before any Motion Matching integration.
## Run after import: godot --headless --path godot --script res://scripts/motion_matching_asset_audit.gd

const MODEL_PATH := "res://assets/models/mixamo_base.glb"
const REPORT_PATH := "user://motion_matching_asset_audit.json"

func _initialize() -> void:
	call_deferred("_run_audit")

func _run_audit() -> void:
	var packed := load(MODEL_PATH) as PackedScene
	if packed == null:
		push_error("Motion Matching audit: could not load %s" % MODEL_PATH)
		quit(1)
		return

	var instance := packed.instantiate()
	root.add_child(instance)
	await process_frame

	var animation_players: Array[AnimationPlayer] = []
	var skeletons: Array[Skeleton3D] = []
	_collect_nodes(instance, animation_players, skeletons)

	var report := {
		"model": MODEL_PATH,
		"engine_version": Engine.get_version_info(),
		"animation_players": [],
		"skeletons": [],
		"notes": [
			"Horizontal root displacement is estimated from keyed position tracks only.",
			"Animation import/root-bone conventions must be confirmed in the Godot editor before enabling root motion."
		]
	}

	for player in animation_players:
		var player_report := {
			"name": str(player.get_path_to(instance)),
			"root_node": str(player.root_node),
			"animations": []
		}
		for animation_name in player.get_animation_list():
			var animation := player.get_animation(animation_name)
			if animation == null:
				continue
			var animation_report := _inspect_animation(animation_name, animation)
			player_report["animations"].append(animation_report)
		report["animation_players"].append(player_report)

	for skeleton in skeletons:
		var bones: Array[Dictionary] = []
		for bone_index in range(skeleton.get_bone_count()):
			bones.append({
				"index": bone_index,
				"name": skeleton.get_bone_name(bone_index),
				"parent": skeleton.get_bone_parent(bone_index)
			})
		report["skeletons"].append({
			"path": str(skeleton.get_path_to(instance)),
			"bone_count": skeleton.get_bone_count(),
			"bones": bones
		})

	var json_text := JSON.stringify(report, "\t")
	print("MOTION_MATCHING_ASSET_AUDIT_BEGIN")
	print(json_text)
	print("MOTION_MATCHING_ASSET_AUDIT_END")

	var output := FileAccess.open(REPORT_PATH, FileAccess.WRITE)
	if output:
		output.store_string(json_text)
		output.close()
		print("Audit report saved to: %s" % ProjectSettings.globalize_path(REPORT_PATH))

	instance.queue_free()
	quit(0)

func _collect_nodes(node: Node, players: Array[AnimationPlayer], skeletons: Array[Skeleton3D]) -> void:
	if node is AnimationPlayer:
		players.append(node as AnimationPlayer)
	if node is Skeleton3D:
		skeletons.append(node as Skeleton3D)
	for child in node.get_children():
		_collect_nodes(child, players, skeletons)

func _inspect_animation(animation_name: StringName, animation: Animation) -> Dictionary:
	var position_tracks: Array[Dictionary] = []
	var candidate_root_tracks: Array[Dictionary] = []
	for track_index in range(animation.get_track_count()):
		if animation.track_get_type(track_index) != Animation.TYPE_POSITION_3D:
			continue
		var path := animation.track_get_path(track_index)
		var path_text := String(path)
		var bone_token := path_text.to_lower()
		var key_count := animation.track_get_key_count(track_index)
		var first_value := Vector3.ZERO
		var last_value := Vector3.ZERO
		if key_count > 0:
			first_value = animation.track_get_key_value(track_index, 0)
			last_value = animation.track_get_key_value(track_index, key_count - 1)
		var horizontal_delta := Vector2(last_value.x - first_value.x, last_value.z - first_value.z).length()
		var item := {
			"path": path_text,
			"key_count": key_count,
			"first_position": _vector_to_array(first_value),
			"last_position": _vector_to_array(last_value),
			"horizontal_endpoint_delta": horizontal_delta,
			"duration": animation.length
		}
		position_tracks.append(item)
		if bone_token.contains("root") or bone_token.contains("hips") or bone_token.contains("pelvis"):
			candidate_root_tracks.append(item)

	return {
		"name": str(animation_name),
		"length": animation.length,
		"loop_mode": animation.loop_mode,
		"track_count": animation.get_track_count(),
		"position_tracks": position_tracks,
		"candidate_root_tracks": candidate_root_tracks
	}

func _vector_to_array(value: Vector3) -> Array[float]:
	return [value.x, value.y, value.z]
