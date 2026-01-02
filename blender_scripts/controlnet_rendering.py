"""
ControlNet multi-pass rendering for architectural visualization.

Phase 2: Camera Setup + ControlNet Snapshots

Renders per view:
- clay.png: Flat-shaded geometry (no textures, neutral gray)
- normal.png: World-space normals mapped to RGB
- depth.png: Normalized Z-depth (linear, 0-1 range)
- mask.png: Object silhouette (binary or object-index)

Usage (inside Blender):
    blender -b -P controlnet_rendering.py -- --in model.glb --config phase2_config.json --out output_dir/
"""

import bpy
import math
import os
import json
import mathutils
from pathlib import Path


# ========== RENDER PASS CONFIGURATION ==========

PASS_SETTINGS = {
    "clay": {
        "material": "clay_gray",
        "samples": 1,
        "film_transparent": False,
        "color": (0.6, 0.6, 0.6),
    },
    "normal": {
        "material": "world_normal",
        "samples": 1,
        "film_transparent": False,
    },
    "depth": {
        "use_compositor": True,
        "samples": 1,
        "film_transparent": False,
    },
    "mask": {
        "material": "holdout_white",
        "samples": 1,
        "film_transparent": True,
    },
}


# ========== MATERIAL CREATION ==========

def create_clay_material(color=(0.6, 0.6, 0.6)):
    """Create flat gray clay material."""
    mat = bpy.data.materials.new(name="ControlNet_Clay")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()

    emission = nodes.new('ShaderNodeEmission')
    emission.inputs['Color'].default_value = (*color, 1.0)
    emission.inputs['Strength'].default_value = 1.0

    output = nodes.new('ShaderNodeOutputMaterial')
    mat.node_tree.links.new(emission.outputs['Emission'], output.inputs['Surface'])

    return mat


def create_normal_material():
    """Create world-space normal visualization material."""
    mat = bpy.data.materials.new(name="ControlNet_Normal")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    geom = nodes.new('ShaderNodeNewGeometry')

    # Map normals from [-1,1] to [0,1] for RGB
    mapping = nodes.new('ShaderNodeVectorMath')
    mapping.operation = 'MULTIPLY_ADD'
    mapping.inputs[1].default_value = (0.5, 0.5, 0.5)
    mapping.inputs[2].default_value = (0.5, 0.5, 0.5)

    emission = nodes.new('ShaderNodeEmission')
    emission.inputs['Strength'].default_value = 1.0

    output = nodes.new('ShaderNodeOutputMaterial')

    links.new(geom.outputs['Normal'], mapping.inputs[0])
    links.new(mapping.outputs['Vector'], emission.inputs['Color'])
    links.new(emission.outputs['Emission'], output.inputs['Surface'])

    return mat


def create_mask_material():
    """Create white holdout material for silhouette."""
    mat = bpy.data.materials.new(name="ControlNet_Mask")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()

    emission = nodes.new('ShaderNodeEmission')
    emission.inputs['Color'].default_value = (1.0, 1.0, 1.0, 1.0)
    emission.inputs['Strength'].default_value = 1.0

    output = nodes.new('ShaderNodeOutputMaterial')
    mat.node_tree.links.new(emission.outputs['Emission'], output.inputs['Surface'])

    return mat


# ========== DEPTH COMPOSITOR SETUP ==========

def setup_depth_compositor(clip_start, clip_end):
    """Setup compositor nodes for normalized depth output."""
    bpy.context.scene.use_nodes = True
    tree = bpy.context.scene.node_tree
    nodes = tree.nodes
    links = tree.links

    for node in nodes:
        nodes.remove(node)

    render_layers = nodes.new('CompositorNodeRLayers')
    render_layers.location = (0, 0)

    # Normalize depth: (Z - clip_start) / (clip_end - clip_start)
    subtract = nodes.new('CompositorNodeMath')
    subtract.operation = 'SUBTRACT'
    subtract.inputs[1].default_value = clip_start
    subtract.location = (200, 0)

    divide = nodes.new('CompositorNodeMath')
    divide.operation = 'DIVIDE'
    divide.inputs[1].default_value = max(clip_end - clip_start, 0.001)
    divide.location = (400, 0)

    clamp_max = nodes.new('CompositorNodeMath')
    clamp_max.operation = 'MINIMUM'
    clamp_max.inputs[1].default_value = 1.0
    clamp_max.location = (600, 0)

    clamp_min = nodes.new('CompositorNodeMath')
    clamp_min.operation = 'MAXIMUM'
    clamp_min.inputs[1].default_value = 0.0
    clamp_min.location = (800, 0)

    composite = nodes.new('CompositorNodeComposite')
    composite.location = (1000, 0)

    links.new(render_layers.outputs['Depth'], subtract.inputs[0])
    links.new(subtract.outputs['Value'], divide.inputs[0])
    links.new(divide.outputs['Value'], clamp_max.inputs[0])
    links.new(clamp_max.outputs['Value'], clamp_min.inputs[0])
    links.new(clamp_min.outputs['Value'], composite.inputs['Image'])


def clear_compositor():
    """Clear compositor nodes and disable compositing."""
    bpy.context.scene.use_nodes = False


# ========== BOUNDS CALCULATION ==========

def calculate_bounds():
    """Calculate bounding box of all mesh objects."""
    min_coord = [float('inf')] * 3
    max_coord = [float('-inf')] * 3

    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            for corner in obj.bound_box:
                world_corner = obj.matrix_world @ mathutils.Vector(corner)
                for i in range(3):
                    min_coord[i] = min(min_coord[i], world_corner[i])
                    max_coord[i] = max(max_coord[i], world_corner[i])

    if min_coord[0] == float('inf'):
        min_coord = [0, 0, 0]
        max_coord = [1, 1, 1]

    return {
        'min': min_coord,
        'max': max_coord,
        'center': [(min_coord[i] + max_coord[i]) / 2 for i in range(3)],
        'size': [max(max_coord[i] - min_coord[i], 0.1) for i in range(3)],
    }


# ========== CAMERA CREATION ==========

def create_ortho_camera(name, location, rotation, ortho_scale, clip_start=0.1, clip_end=1000.0):
    """Create orthographic camera with given parameters."""
    cam_data = bpy.data.cameras.new(name=name)
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = ortho_scale
    cam_data.clip_start = clip_start
    cam_data.clip_end = clip_end

    cam_obj = bpy.data.objects.new(name, cam_data)
    bpy.context.collection.objects.link(cam_obj)

    cam_obj.location = location
    cam_obj.rotation_euler = mathutils.Euler(rotation, 'XYZ')

    return {
        'name': name,
        'object': cam_obj,
        'type': 'ORTHO',
        'ortho_scale': ortho_scale,
        'location': list(location),
        'rotation': list(rotation),
        'clip_start': clip_start,
        'clip_end': clip_end,
    }


def create_perspective_camera(name, location, target, focal_length=35, clip_start=0.1, clip_end=1000.0):
    """Create perspective camera aimed at target."""
    cam_data = bpy.data.cameras.new(name=name)
    cam_data.type = 'PERSP'
    cam_data.lens = focal_length
    cam_data.clip_start = clip_start
    cam_data.clip_end = clip_end

    cam_obj = bpy.data.objects.new(name, cam_data)
    bpy.context.collection.objects.link(cam_obj)

    cam_obj.location = location

    direction = mathutils.Vector(target) - mathutils.Vector(location)
    rot_quat = direction.to_track_quat('-Z', 'Y')
    cam_obj.rotation_euler = rot_quat.to_euler()

    return {
        'name': name,
        'object': cam_obj,
        'type': 'PERSP',
        'focal_length': focal_length,
        'location': list(location),
        'rotation': list(cam_obj.rotation_euler),
        'target': list(target),
        'clip_start': clip_start,
        'clip_end': clip_end,
    }


def calculate_elevation_position(center, size, angle_deg):
    """Calculate position for elevation camera based on compass direction."""
    max_dim = max(size[0], size[1])
    distance = max_dim * 2.0
    angle_rad = math.radians(angle_deg)

    x = center[0] + distance * math.sin(angle_rad)
    y = center[1] + distance * math.cos(angle_rad)
    z = center[2]

    return (x, y, z)


def calculate_elevation_rotation(angle_deg):
    """Calculate rotation for elevation camera based on compass direction."""
    return (math.radians(90), 0, math.radians(angle_deg + 180))


# ========== DETERMINISTIC CAMERA SETUP ==========

def setup_deterministic_cameras(bounds, config):
    """Create deterministic camera positions based on bounding box."""
    cameras = []
    center = bounds['center']
    size = bounds['size']
    max_dim = max(size)

    views_config = config.get('views', {})

    # Floor plan camera (orthographic, top-down)
    if views_config.get('floor_plan', {}).get('enabled', True):
        margin = views_config.get('floor_plan', {}).get('margin_factor', 1.2)
        floor_cam = create_ortho_camera(
            name="floor_plan",
            location=(center[0], center[1], center[2] + max_dim * 2),
            rotation=(0, 0, 0),
            ortho_scale=max(size[0], size[1]) * margin,
            clip_start=0.1,
            clip_end=max_dim * 4,
        )
        cameras.append(floor_cam)

    # Section camera (orthographic, looking East through center)
    if views_config.get('section_AA', {}).get('enabled', True):
        margin = views_config.get('section_AA', {}).get('margin_factor', 1.2)
        section_cam = create_ortho_camera(
            name="section_AA",
            location=(center[0] - max_dim * 2, center[1], center[2]),
            rotation=(math.radians(90), 0, math.radians(-90)),
            ortho_scale=max(size[1], size[2]) * margin,
            clip_start=0.1,
            clip_end=max_dim * 4,
        )
        cameras.append(section_cam)

    # Hero perspective camera
    if views_config.get('hero_perspective', {}).get('enabled', True):
        focal = views_config.get('hero_perspective', {}).get('focal_length', 35)
        dist_factor = views_config.get('hero_perspective', {}).get('distance_factor', 1.5)
        persp_cam = create_perspective_camera(
            name="hero_perspective",
            location=(
                center[0] - max_dim * dist_factor,
                center[1] - max_dim * dist_factor,
                center[2] + max_dim * 0.8
            ),
            target=center,
            focal_length=focal,
            clip_start=0.1,
            clip_end=max_dim * 6,
        )
        cameras.append(persp_cam)

    # Elevation cameras (N, S, E, W)
    for orient, angle in [('N', 0), ('S', 180), ('E', 90), ('W', 270)]:
        view_key = f'elevation_{orient}'
        if views_config.get(view_key, {}).get('enabled', True):
            margin = views_config.get(view_key, {}).get('margin_factor', 1.2)
            elev_cam = create_ortho_camera(
                name=view_key,
                location=calculate_elevation_position(center, size, angle),
                rotation=calculate_elevation_rotation(angle),
                ortho_scale=max(size[0], size[2]) * margin,
                clip_start=0.1,
                clip_end=max_dim * 4,
            )
            cameras.append(elev_cam)

    return cameras


# ========== MAIN RENDER FUNCTION ==========

def render_controlnet_passes(cameras, output_dir, resolution=(2048, 2048), passes_config=None):
    """Render all ControlNet passes for each camera."""
    scene = bpy.context.scene
    scene.render.resolution_x = resolution[0]
    scene.render.resolution_y = resolution[1]
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_depth = '8'
    scene.render.engine = 'BLENDER_EEVEE'

    if passes_config is None:
        passes_config = {}

    # Create materials once
    clay_mat = create_clay_material(
        color=tuple(passes_config.get('clay', {}).get('color', [0.6, 0.6, 0.6]))
    )
    normal_mat = create_normal_material()
    mask_mat = create_mask_material()

    # Store original materials
    original_materials = {}
    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            original_materials[obj.name] = list(obj.data.materials)

    results = []

    for cam_spec in cameras:
        cam_obj = cam_spec['object']
        scene.camera = cam_obj
        cam_name = cam_spec['name']

        print(f"Rendering camera: {cam_name}")

        cam_result = {
            'camera': cam_name,
            'passes': {},
            'camera_data': {
                'type': cam_spec['type'],
                'location': cam_spec['location'],
                'rotation': cam_spec['rotation'],
                'clip_start': cam_spec['clip_start'],
                'clip_end': cam_spec['clip_end'],
            }
        }

        if cam_spec['type'] == 'ORTHO':
            cam_result['camera_data']['ortho_scale'] = cam_spec['ortho_scale']
            meters_per_pixel = cam_spec['ortho_scale'] / resolution[0]
            cam_result['camera_data']['meters_per_pixel'] = meters_per_pixel
        else:
            cam_result['camera_data']['focal_length'] = cam_spec['focal_length']
            if 'target' in cam_spec:
                cam_result['camera_data']['target'] = cam_spec['target']

        # Render each enabled pass
        for pass_name, pass_config in PASS_SETTINGS.items():
            if not passes_config.get(pass_name, {}).get('enabled', True):
                continue

            filepath = os.path.join(output_dir, f"{cam_name}_{pass_name}.png")

            if pass_name == 'depth':
                setup_depth_compositor(cam_spec['clip_start'], cam_spec['clip_end'])
                scene.view_layers["ViewLayer"].use_pass_z = True
                scene.render.film_transparent = False
                scene.render.filepath = filepath
                bpy.ops.render.render(write_still=True)
                clear_compositor()
            else:
                mat = {'clay': clay_mat, 'normal': normal_mat, 'mask': mask_mat}[pass_name]
                for obj in bpy.data.objects:
                    if obj.type == 'MESH':
                        obj.data.materials.clear()
                        obj.data.materials.append(mat)

                scene.render.film_transparent = pass_config.get('film_transparent', False)
                scene.render.filepath = filepath
                bpy.ops.render.render(write_still=True)

            cam_result['passes'][pass_name] = filepath
            print(f"  Rendered: {pass_name}")

        results.append(cam_result)

    # Restore original materials
    for obj_name, mats in original_materials.items():
        obj = bpy.data.objects.get(obj_name)
        if obj:
            obj.data.materials.clear()
            for mat in mats:
                obj.data.materials.append(mat)

    return results


# ========== CAMERAS.JSON EXPORT ==========

def write_cameras_json(cameras, output_dir, resolution):
    """Write cameras.json with intrinsics/extrinsics."""
    cameras_data = {
        'version': '1.0.0',
        'coordinate_system': {
            'up': 'Z',
            'forward': '-Y',
            'units': 'meters',
        },
        'resolution': {
            'width': resolution[0],
            'height': resolution[1],
        },
        'cameras': []
    }

    for cam_spec in cameras:
        cam_entry = {
            'name': cam_spec['name'],
            'type': cam_spec['type'],
            'extrinsics': {
                'location': cam_spec['location'],
                'rotation_euler': cam_spec['rotation'],
            },
            'intrinsics': {
                'clip_start': cam_spec['clip_start'],
                'clip_end': cam_spec['clip_end'],
            }
        }

        if cam_spec['type'] == 'ORTHO':
            cam_entry['intrinsics']['ortho_scale'] = cam_spec['ortho_scale']
            cam_entry['intrinsics']['meters_per_pixel'] = cam_spec['ortho_scale'] / resolution[0]
        else:
            focal_length = cam_spec.get('focal_length', 35)
            cam_entry['intrinsics']['focal_length'] = focal_length
            sensor_width = 36
            fov = 2 * math.atan(sensor_width / (2 * focal_length))
            cam_entry['intrinsics']['fov_horizontal'] = math.degrees(fov)
            if 'target' in cam_spec:
                cam_entry['extrinsics']['target'] = cam_spec['target']

        cameras_data['cameras'].append(cam_entry)

    output_path = os.path.join(output_dir, 'cameras.json')
    with open(output_path, 'w') as f:
        json.dump(cameras_data, f, indent=2)

    return output_path


# ========== CLI ENTRY POINT ==========

def main():
    import sys
    import argparse

    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []

    parser = argparse.ArgumentParser(description='ControlNet rendering for architecture')
    parser.add_argument('--in', dest='input', required=True, help='Input GLB/OBJ model path')
    parser.add_argument('--config', required=True, help='Phase 2 config JSON path')
    parser.add_argument('--out', required=True, help='Output directory')
    args = parser.parse_args(argv)

    # Load config
    with open(args.config) as f:
        config = json.load(f)

    print(f"ControlNet Rendering - Phase 2")
    print(f"  Input model: {args.input}")
    print(f"  Config: {args.config}")
    print(f"  Output: {args.out}")

    # Reset scene
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # Import model
    print("Importing model...")
    if args.input.endswith('.glb') or args.input.endswith('.gltf'):
        bpy.ops.import_scene.gltf(filepath=args.input)
    elif args.input.endswith('.obj'):
        bpy.ops.wm.obj_import(filepath=args.input)
    else:
        raise ValueError(f"Unsupported model format: {args.input}")

    # Apply transforms and enforce metric units
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.length_unit = 'METERS'

    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            obj.select_set(False)

    # Calculate bounds
    bounds = calculate_bounds()
    print(f"Model bounds: center={bounds['center']}, size={bounds['size']}")

    # Setup cameras
    resolution = tuple(config.get('resolution', [2048, 2048]))
    cameras = setup_deterministic_cameras(bounds, config)
    print(f"Created {len(cameras)} cameras")

    # Create output directory
    os.makedirs(args.out, exist_ok=True)

    # Render all passes
    passes_config = config.get('passes', {})
    results = render_controlnet_passes(cameras, args.out, resolution, passes_config)

    # Write cameras.json
    cameras_json_path = write_cameras_json(cameras, args.out, resolution)
    print(f"Wrote: {cameras_json_path}")

    # Write manifest
    manifest = {
        'version': '2.0.0',
        'phase': 'controlnet_snapshots',
        'input_model': args.input,
        'output_dir': args.out,
        'cameras_json': cameras_json_path,
        'resolution': {'width': resolution[0], 'height': resolution[1]},
        'bounds': bounds,
        'renders': results,
    }

    manifest_path = os.path.join(args.out, 'manifest.json')
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)

    print(f"ControlNet rendering complete. Manifest: {manifest_path}")
    return manifest


if __name__ == "__main__":
    main()
