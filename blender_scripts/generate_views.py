"""
Technical drawing generator for architectural designs.

Phase 1: Design DNA -> Blender 3D -> Technical PNG renders

Generates deterministic camera positions and renders all standard
architectural views (plans, elevations, sections, perspectives).

Usage:
    blender -b -P generate_views.py -- design_state.json output_dir/ \
        --manifest output_dir/manifest.json --run-id run_001

Outputs:
    - PNG renders for each view (plan_ground, elev_north, etc.)
    - manifest.json with view metadata
    - {run_id}.blend scene file for further editing

Requires: Blender 3.6+ (auto-detects EEVEE engine variant)
"""

import bpy
import json
import math
import os
import sys
import mathutils
from datetime import datetime
from pathlib import Path


# ========== CONSTANTS ==========

RENDER_RESOLUTION = (2048, 2048)
RENDER_SAMPLES = 16

# Panel types matching BlenderBridgeService.cjs PANEL_FILENAME_MAP
PANEL_TYPES = {
    "plan_ground":  {"type": "plan",      "level": 0},
    "plan_first":   {"type": "plan",      "level": 1},
    "plan_level2":  {"type": "plan",      "level": 2},
    "elev_north":   {"type": "elevation", "angle": 0},
    "elev_south":   {"type": "elevation", "angle": 180},
    "elev_east":    {"type": "elevation", "angle": 90},
    "elev_west":    {"type": "elevation", "angle": 270},
    "section_aa":   {"type": "section",   "axis": "Y", "label": "A-A"},
    "section_bb":   {"type": "section",   "axis": "X", "label": "B-B"},
    "axon":         {"type": "axonometric"},
    "hero_3d":      {"type": "perspective"},
    "interior_3d":  {"type": "interior"},
}

# Clay material color (neutral architectural gray)
CLAY_COLOR = (0.72, 0.72, 0.72)
FLOOR_COLOR = (0.85, 0.85, 0.82)
ROOF_COLOR = (0.55, 0.50, 0.45)


# ========== ENGINE DETECTION ==========

def get_eevee_engine():
    """Return correct EEVEE engine name for current Blender version."""
    version = bpy.app.version
    if version >= (4, 2, 0):
        return 'BLENDER_EEVEE_NEXT'
    return 'BLENDER_EEVEE'


# ========== MATERIAL CREATION ==========

def create_material(name, color, roughness=0.8):
    """Create a simple diffuse material."""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Specular IOR Level'].default_value = 0.2

    output = nodes.new('ShaderNodeOutputMaterial')
    links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

    return mat


def create_clay_material():
    """Create flat emission clay material for technical rendering."""
    mat = bpy.data.materials.new(name="TechDraw_Clay")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()

    emission = nodes.new('ShaderNodeEmission')
    emission.inputs['Color'].default_value = (*CLAY_COLOR, 1.0)
    emission.inputs['Strength'].default_value = 1.0

    output = nodes.new('ShaderNodeOutputMaterial')
    mat.node_tree.links.new(emission.outputs['Emission'], output.inputs['Surface'])

    return mat


# ========== GEOMETRY BUILDING ==========

def build_geometry_from_design_state(design_state):
    """
    Build 3D massing geometry from DesignState JSON.

    Handles the schema produced by BlenderBridgeService.buildDesignStateFromDNA():
    - levels[]: floor elevations and heights
    - slabs[]: floor plate polygons with thickness
    - roof: type, pitch, ridge height, footprint
    - rooms[]: room metadata (used for interior camera placement)
    - materials[]: named materials with colors
    """
    objects_created = []

    dims = design_state.get('dimensions', {})
    length = dims.get('length', 12)
    width = dims.get('width', 10)
    total_height = dims.get('height', 8)

    levels = design_state.get('levels', [])
    slabs = design_state.get('slabs', [])
    roof = design_state.get('roof', {})

    # Materials
    wall_mat = create_material("Wall", CLAY_COLOR)
    floor_mat = create_material("Floor", FLOOR_COLOR)
    roof_mat = create_material("Roof", ROOF_COLOR)

    # Build floor slabs
    for i, slab in enumerate(slabs):
        thickness = slab.get('thickness', 0.3)
        level_id = slab.get('levelId', f'level_{i}')

        # Find matching level for elevation
        elevation = 0
        for lv in levels:
            if lv.get('id') == level_id:
                elevation = lv.get('elevation', i * 3.0)
                break

        verts = slab.get('polygon', {}).get('vertices', [
            {'x': 0, 'y': 0},
            {'x': length, 'y': 0},
            {'x': length, 'y': width},
            {'x': 0, 'y': width},
        ])

        obj = create_extruded_polygon(
            name=f"Slab_{level_id}",
            vertices=[(v['x'], v['y']) for v in verts],
            z_base=elevation,
            height=thickness,
            material=floor_mat,
        )
        if obj:
            objects_created.append(obj)

    # Build walls per floor
    wall_thickness = 0.25
    for i, level in enumerate(levels):
        elevation = level.get('elevation', i * 3.0)
        floor_height = level.get('height', 3.0)

        # Outer walls as 4 boxes
        walls = [
            # North wall
            (0, width - wall_thickness, length, wall_thickness),
            # South wall
            (0, 0, length, wall_thickness),
            # East wall
            (length - wall_thickness, 0, wall_thickness, width),
            # West wall
            (0, 0, wall_thickness, width),
        ]

        for wi, (wx, wy, wl, ww) in enumerate(walls):
            verts = [
                {'x': wx, 'y': wy},
                {'x': wx + wl, 'y': wy},
                {'x': wx + wl, 'y': wy + ww},
                {'x': wx, 'y': wy + ww},
            ]
            obj = create_extruded_polygon(
                name=f"Wall_L{i}_{wi}",
                vertices=[(v['x'], v['y']) for v in verts],
                z_base=elevation + (slabs[i]['thickness'] if i < len(slabs) else 0.3),
                height=floor_height - (slabs[i]['thickness'] if i < len(slabs) else 0.3),
                material=wall_mat,
            )
            if obj:
                objects_created.append(obj)

    # Build roof
    if roof:
        roof_obj = build_roof(roof, length, width, levels, roof_mat)
        if roof_obj:
            objects_created.append(roof_obj)

    return objects_created


def create_extruded_polygon(name, vertices, z_base, height, material=None):
    """Create extruded polygon mesh from 2D vertices."""
    if len(vertices) < 3 or height <= 0:
        return None

    n = len(vertices)
    mesh_verts = []
    faces = []

    # Bottom vertices
    for x, y in vertices:
        mesh_verts.append((x, y, z_base))

    # Top vertices
    for x, y in vertices:
        mesh_verts.append((x, y, z_base + height))

    # Bottom face
    faces.append(list(range(n)))

    # Top face
    faces.append(list(range(n, 2 * n)))

    # Side faces
    for i in range(n):
        j = (i + 1) % n
        faces.append([i, j, j + n, i + n])

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(mesh_verts, [], faces)
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    if material:
        obj.data.materials.append(material)

    return obj


def build_roof(roof_data, length, width, levels, material):
    """Build roof geometry based on type."""
    roof_type = roof_data.get('type', 'flat')
    pitch_deg = roof_data.get('pitch', 30)
    ridge_height = roof_data.get('ridgeHeight', None)

    # Calculate roof base elevation
    if levels:
        last_level = levels[-1]
        base_z = last_level.get('elevation', 0) + last_level.get('height', 3.0)
    else:
        base_z = 6.0

    overhang = 0.3

    if roof_type == 'flat':
        return create_extruded_polygon(
            name="Roof_Flat",
            vertices=[
                (-overhang, -overhang),
                (length + overhang, -overhang),
                (length + overhang, width + overhang),
                (-overhang, width + overhang),
            ],
            z_base=base_z,
            height=0.3,
            material=material,
        )

    elif roof_type in ('gable', 'pitched'):
        pitch_rad = math.radians(pitch_deg)
        calculated_ridge = (width / 2) * math.tan(pitch_rad)
        ridge_h = ridge_height - base_z if ridge_height else calculated_ridge

        verts = [
            (-overhang, -overhang, base_z),
            (length + overhang, -overhang, base_z),
            (length + overhang, width + overhang, base_z),
            (-overhang, width + overhang, base_z),
            (-overhang, width / 2, base_z + ridge_h),
            (length + overhang, width / 2, base_z + ridge_h),
        ]

        faces = [
            [0, 1, 5, 4],  # South slope
            [2, 3, 4, 5],  # North slope
            [0, 4, 3],     # West gable
            [1, 2, 5],     # East gable
            [0, 3, 2, 1],  # Bottom (optional)
        ]

        mesh = bpy.data.meshes.new("Roof_Gable")
        mesh.from_pydata(verts, [], faces)
        mesh.update()

        obj = bpy.data.objects.new("Roof_Gable", mesh)
        bpy.context.collection.objects.link(obj)

        if material:
            obj.data.materials.append(material)

        return obj

    elif roof_type == 'hip':
        pitch_rad = math.radians(pitch_deg)
        ridge_h = min(width, length) / 2 * math.tan(pitch_rad)
        ridge_offset = max(0, (length - width) / 2)

        verts = [
            (-overhang, -overhang, base_z),
            (length + overhang, -overhang, base_z),
            (length + overhang, width + overhang, base_z),
            (-overhang, width + overhang, base_z),
            (ridge_offset, width / 2, base_z + ridge_h),
            (length - ridge_offset, width / 2, base_z + ridge_h),
        ]

        faces = [
            [0, 1, 5, 4],  # South slope
            [2, 3, 4, 5],  # North slope
            [0, 4, 3],     # West hip
            [1, 2, 5],     # East hip
        ]

        mesh = bpy.data.meshes.new("Roof_Hip")
        mesh.from_pydata(verts, [], faces)
        mesh.update()

        obj = bpy.data.objects.new("Roof_Hip", mesh)
        bpy.context.collection.objects.link(obj)

        if material:
            obj.data.materials.append(material)

        return obj

    # Fallback: flat roof
    return create_extruded_polygon(
        name="Roof_Default",
        vertices=[
            (-overhang, -overhang),
            (length + overhang, -overhang),
            (length + overhang, width + overhang),
            (-overhang, width + overhang),
        ],
        z_base=base_z,
        height=0.3,
        material=material,
    )


# ========== MODEL IMPORT ==========

def import_model(model_path):
    """Import GLB/OBJ model file."""
    ext = Path(model_path).suffix.lower()

    if ext in ('.glb', '.gltf'):
        bpy.ops.import_scene.gltf(filepath=model_path)
    elif ext == '.obj':
        bpy.ops.wm.obj_import(filepath=model_path)
    else:
        raise ValueError(f"Unsupported model format: {ext}")

    # Apply transforms
    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            obj.select_set(False)


# ========== BOUNDS CALCULATION ==========

def calculate_bounds():
    """Calculate bounding box of all mesh objects in the scene."""
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
        max_coord = [12, 10, 8]

    return {
        'min': min_coord,
        'max': max_coord,
        'center': [(min_coord[i] + max_coord[i]) / 2 for i in range(3)],
        'size': [max(max_coord[i] - min_coord[i], 0.1) for i in range(3)],
    }


# ========== CAMERA CREATION ==========

def create_ortho_camera(name, location, rotation, ortho_scale, clip_start=0.1, clip_end=1000.0):
    """Create orthographic camera."""
    cam_data = bpy.data.cameras.new(name=name)
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = ortho_scale
    cam_data.clip_start = clip_start
    cam_data.clip_end = clip_end

    cam_obj = bpy.data.objects.new(name, cam_data)
    bpy.context.collection.objects.link(cam_obj)
    cam_obj.location = location
    cam_obj.rotation_euler = mathutils.Euler(rotation, 'XYZ')

    return cam_obj


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

    return cam_obj


# ========== CAMERA SETUP ==========

def setup_all_cameras(bounds, design_state):
    """
    Create deterministic cameras for all architectural views.

    Returns dict of {panel_id: camera_object} matching PANEL_TYPES keys.
    """
    cameras = {}
    center = bounds['center']
    size = bounds['size']
    max_dim = max(size)
    margin = 1.3

    levels = design_state.get('levels', [])
    dims = design_state.get('dimensions', {})
    length = dims.get('length', size[0])
    width = dims.get('width', size[1])

    # --- Floor plan cameras (orthographic, top-down) ---
    for level_idx, level in enumerate(levels):
        panel_ids = {0: 'plan_ground', 1: 'plan_first', 2: 'plan_level2'}
        panel_id = panel_ids.get(level_idx)
        if not panel_id:
            continue

        elevation = level.get('elevation', level_idx * 3.0)
        floor_height = level.get('height', 3.0)
        # Camera at cut height (1.2m above floor) looking down
        cut_z = elevation + min(1.2, floor_height * 0.4)

        cam = create_ortho_camera(
            name=panel_id,
            location=(center[0], center[1], cut_z + max_dim * 2),
            rotation=(0, 0, 0),
            ortho_scale=max(size[0], size[1]) * margin,
            clip_start=max_dim * 2 - 0.1,  # Only render at cut height
            clip_end=max_dim * 4,
        )
        cameras[panel_id] = cam

    # Ensure at least ground floor plan exists
    if 'plan_ground' not in cameras:
        cam = create_ortho_camera(
            name='plan_ground',
            location=(center[0], center[1], center[2] + max_dim * 2),
            rotation=(0, 0, 0),
            ortho_scale=max(size[0], size[1]) * margin,
            clip_start=0.1,
            clip_end=max_dim * 4,
        )
        cameras['plan_ground'] = cam

    # --- Elevation cameras (orthographic, cardinal directions) ---
    elevation_configs = {
        'elev_north': {'angle': 0,   'look_axis': '-Y'},
        'elev_south': {'angle': 180, 'look_axis': '+Y'},
        'elev_east':  {'angle': 90,  'look_axis': '-X'},
        'elev_west':  {'angle': 270, 'look_axis': '+X'},
    }

    for panel_id, cfg in elevation_configs.items():
        angle_rad = math.radians(cfg['angle'])
        distance = max_dim * 2.5

        loc_x = center[0] + distance * math.sin(angle_rad)
        loc_y = center[1] + distance * math.cos(angle_rad)
        loc_z = center[2]

        rot = (math.radians(90), 0, math.radians(cfg['angle'] + 180))

        # Scale ortho to show full facade
        if cfg['angle'] in (0, 180):
            facade_scale = max(size[0], size[2]) * margin
        else:
            facade_scale = max(size[1], size[2]) * margin

        cam = create_ortho_camera(
            name=panel_id,
            location=(loc_x, loc_y, loc_z),
            rotation=rot,
            ortho_scale=facade_scale,
            clip_start=0.1,
            clip_end=distance * 2,
        )
        cameras[panel_id] = cam

    # --- Section cameras (orthographic with clip-plane section cut) ---
    # Section A-A: cut through Y center, looking East (+X)
    section_aa_clip = max(size[1] / 2, 0.5)
    cam_aa = create_ortho_camera(
        name='section_aa',
        location=(center[0] - max_dim * 2.5, center[1], center[2]),
        rotation=(math.radians(90), 0, math.radians(-90)),
        ortho_scale=max(size[1], size[2]) * margin,
        clip_start=max_dim * 2.5 - section_aa_clip,  # Clip near the center
        clip_end=max_dim * 4,
    )
    cameras['section_aa'] = cam_aa

    # Section B-B: cut through X center, looking North (+Y)
    section_bb_clip = max(size[0] / 2, 0.5)
    cam_bb = create_ortho_camera(
        name='section_bb',
        location=(center[0], center[1] - max_dim * 2.5, center[2]),
        rotation=(math.radians(90), 0, 0),
        ortho_scale=max(size[0], size[2]) * margin,
        clip_start=max_dim * 2.5 - section_bb_clip,
        clip_end=max_dim * 4,
    )
    cameras['section_bb'] = cam_bb

    # --- Axonometric camera (orthographic, elevated SW angle) ---
    axon_dist = max_dim * 2.0
    cam_axon = create_ortho_camera(
        name='axon',
        location=(
            center[0] - axon_dist * 0.7,
            center[1] - axon_dist * 0.7,
            center[2] + axon_dist * 0.8,
        ),
        rotation=(math.radians(54.7), 0, math.radians(-45)),  # Isometric angles
        ortho_scale=max_dim * margin * 1.2,
        clip_start=0.1,
        clip_end=axon_dist * 4,
    )
    cameras['axon'] = cam_axon

    # --- Hero perspective camera (SW elevated) ---
    hero_dist = max_dim * 1.8
    cam_hero = create_perspective_camera(
        name='hero_3d',
        location=(
            center[0] - hero_dist,
            center[1] - hero_dist,
            center[2] + hero_dist * 0.6,
        ),
        target=center,
        focal_length=35,
        clip_start=0.1,
        clip_end=hero_dist * 4,
    )
    cameras['hero_3d'] = cam_hero

    # --- Interior camera (eye-level in largest ground-floor room) ---
    interior_cam = setup_interior_camera(bounds, design_state)
    if interior_cam:
        cameras['interior_3d'] = interior_cam

    return cameras


def setup_interior_camera(bounds, design_state):
    """
    Place camera at eye height inside the building.

    Tries to use room data for placement; falls back to building center.
    """
    center = bounds['center']
    size = bounds['size']
    dims = design_state.get('dimensions', {})
    rooms = design_state.get('rooms', [])
    levels = design_state.get('levels', [])

    # Find ground floor elevation
    ground_elevation = 0
    ground_height = 3.0
    if levels:
        ground_elevation = levels[0].get('elevation', 0)
        ground_height = levels[0].get('height', 3.0)

    eye_height = ground_elevation + 1.6  # Standard eye level

    # Try to find the largest ground-floor room
    ground_rooms = [r for r in rooms if r.get('levelId', 'ground') == 'ground']
    if not ground_rooms:
        ground_rooms = rooms[:1] if rooms else []

    if ground_rooms:
        largest = max(ground_rooms, key=lambda r: r.get('area', 0))
        # Use room center if available, otherwise use building center
        room_width = largest.get('width', dims.get('width', size[1]) * 0.5)
        room_length = largest.get('length', dims.get('length', size[0]) * 0.5)
        cam_x = center[0]
        cam_y = center[1]
    else:
        cam_x = center[0]
        cam_y = center[1]

    # Look toward the longest interior wall (slightly off-center for interest)
    target_x = cam_x + dims.get('length', size[0]) * 0.3
    target_y = cam_y + dims.get('width', size[1]) * 0.15
    target_z = eye_height

    cam = create_perspective_camera(
        name='interior_3d',
        location=(cam_x, cam_y, eye_height),
        target=(target_x, target_y, target_z),
        focal_length=24,  # Wide angle for interiors
        clip_start=0.05,
        clip_end=max(size) * 2,
    )

    return cam


# ========== LIGHTING ==========

def setup_lighting():
    """Add architectural lighting for technical rendering."""
    # Sun lamp from elevated SE angle
    sun_data = bpy.data.lights.new(name="Sun_Main", type='SUN')
    sun_data.energy = 3.0
    sun_data.color = (1.0, 0.98, 0.95)

    sun_obj = bpy.data.objects.new("Sun_Main", sun_data)
    bpy.context.collection.objects.link(sun_obj)
    sun_obj.rotation_euler = (math.radians(50), math.radians(15), math.radians(-30))

    # Fill light from opposite side
    fill_data = bpy.data.lights.new(name="Sun_Fill", type='SUN')
    fill_data.energy = 1.0
    fill_data.color = (0.9, 0.92, 1.0)

    fill_obj = bpy.data.objects.new("Sun_Fill", fill_data)
    bpy.context.collection.objects.link(fill_obj)
    fill_obj.rotation_euler = (math.radians(40), math.radians(-10), math.radians(150))

    # World ambient
    world = bpy.data.worlds.new("TechDraw_World")
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs['Color'].default_value = (0.95, 0.95, 0.95, 1.0)
        bg.inputs['Strength'].default_value = 0.5
    bpy.context.scene.world = world


# ========== RENDER ENGINE ==========

def setup_render_engine(resolution):
    """Configure render engine for technical drawing output."""
    scene = bpy.context.scene
    scene.render.engine = get_eevee_engine()
    scene.render.resolution_x = resolution[0]
    scene.render.resolution_y = resolution[1]
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_depth = '8'
    scene.render.film_transparent = False

    # EEVEE settings
    eevee = scene.eevee
    eevee.use_gtao = True
    eevee.gtao_distance = 1.0
    eevee.use_bloom = False

    # Enforce metric units
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.length_unit = 'METERS'


# ========== RENDERING ==========

def render_all_views(cameras, output_dir, run_id, resolution):
    """
    Render all camera views and return view metadata.

    Returns list of view dicts for the manifest.
    """
    scene = bpy.context.scene
    views = []

    for panel_id, cam_obj in cameras.items():
        scene.camera = cam_obj
        filename = f"{run_id}_{panel_id}.png"
        filepath = os.path.join(output_dir, filename)

        scene.render.filepath = filepath
        print(f"  Rendering: {panel_id} -> {filename}")
        bpy.ops.render.render(write_still=True)

        # Get image dimensions (same as render resolution)
        view_meta = {
            'id': panel_id,
            'type': PANEL_TYPES.get(panel_id, {}).get('type', 'unknown'),
            'path': os.path.abspath(filepath),
            'filename': filename,
            'width': resolution[0],
            'height': resolution[1],
            'metadata': {
                'camera_type': cam_obj.data.type,
                'location': list(cam_obj.location),
                'rotation': list(cam_obj.rotation_euler),
            },
        }

        if cam_obj.data.type == 'ORTHO':
            view_meta['metadata']['ortho_scale'] = cam_obj.data.ortho_scale
            view_meta['metadata']['meters_per_pixel'] = cam_obj.data.ortho_scale / resolution[0]
        else:
            view_meta['metadata']['focal_length'] = cam_obj.data.lens

        views.append(view_meta)

    return views


# ========== MANIFEST ==========

def write_manifest(manifest_path, views, run_id, design_state, blend_path=None):
    """Write manifest JSON with view metadata."""
    manifest = {
        'version': '1.0.0',
        'phase': 'technical_drawings',
        'runId': run_id,
        'generatedAt': datetime.utcnow().isoformat() + 'Z',
        'blenderVersion': '.'.join(str(v) for v in bpy.app.version),
        'views': views,
        'designState': {
            'dimensions': design_state.get('dimensions', {}),
            'floorCount': len(design_state.get('levels', [])),
            'buildingType': design_state.get('metadata', {}).get('buildingType', 'unknown'),
            'source': design_state.get('source', 'dna'),
        },
        'stats': {
            'totalViews': len(views),
            'viewTypes': [v['id'] for v in views],
        },
    }

    if blend_path:
        manifest['blendFile'] = os.path.abspath(blend_path)

    os.makedirs(os.path.dirname(manifest_path) or '.', exist_ok=True)
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)

    return manifest


# ========== CLI ENTRY POINT ==========

def main():
    import argparse

    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []

    parser = argparse.ArgumentParser(description='Generate architectural technical drawings')
    parser.add_argument('design_state', help='Path to design_state.json')
    parser.add_argument('output_dir', help='Output directory for renders')
    parser.add_argument('--manifest', required=True, help='Path to write manifest.json')
    parser.add_argument('--run-id', required=True, help='Run identifier for deterministic filenames')
    parser.add_argument('--resolution', type=int, nargs=2, default=list(RENDER_RESOLUTION),
                        help='Render resolution (width height)')
    parser.add_argument('--no-blend', action='store_true', help='Skip saving .blend file')
    args = parser.parse_args(argv)

    print("=" * 60)
    print("Architectural Technical Drawing Generator")
    print("=" * 60)
    print(f"  Design state: {args.design_state}")
    print(f"  Output dir:   {args.output_dir}")
    print(f"  Manifest:     {args.manifest}")
    print(f"  Run ID:       {args.run_id}")
    print(f"  Resolution:   {args.resolution[0]}x{args.resolution[1]}")
    print(f"  Blender:      {'.'.join(str(v) for v in bpy.app.version)}")
    print(f"  Engine:       {get_eevee_engine()}")
    print()

    # Load design state
    with open(args.design_state) as f:
        design_state = json.load(f)

    # Reset scene
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # Build or import geometry
    model_path = design_state.get('modelPath')
    meshy_url = design_state.get('meshyModelUrl')

    if model_path and os.path.exists(model_path):
        print(f"Importing model: {model_path}")
        try:
            import_model(model_path)
            print("Model imported successfully")
        except Exception as e:
            print(f"WARNING: Model import failed ({e}), building procedural geometry")
            build_geometry_from_design_state(design_state)
    else:
        print("Building procedural geometry from DesignState...")
        build_geometry_from_design_state(design_state)

    # Calculate bounds
    bounds = calculate_bounds()
    print(f"Scene bounds: center={[f'{c:.2f}' for c in bounds['center']]}, "
          f"size={[f'{s:.2f}' for s in bounds['size']]}")

    # Setup lighting and render engine
    setup_lighting()
    resolution = tuple(args.resolution)
    setup_render_engine(resolution)

    # Create cameras
    cameras = setup_all_cameras(bounds, design_state)
    print(f"Created {len(cameras)} cameras: {', '.join(cameras.keys())}")

    # Create output directory
    os.makedirs(args.output_dir, exist_ok=True)

    # Render all views
    print("\nRendering views...")
    views = render_all_views(cameras, args.output_dir, args.run_id, resolution)
    print(f"\nRendered {len(views)} views")

    # Save .blend file
    blend_path = None
    if not args.no_blend:
        blend_path = os.path.join(args.output_dir, f"{args.run_id}.blend")
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(blend_path), compress=True)
        print(f"Saved .blend: {blend_path}")

    # Write manifest
    manifest = write_manifest(args.manifest, views, args.run_id, design_state, blend_path)
    print(f"Wrote manifest: {args.manifest}")
    print(f"\nGeneration complete: {len(views)} technical drawings")

    return manifest


if __name__ == "__main__":
    main()
