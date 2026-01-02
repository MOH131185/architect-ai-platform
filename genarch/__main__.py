"""
CLI entry point for genarch.

Usage:
    python -m genarch --constraints constraints.json --out runs/run_001 --seed 123
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from genarch.models.constraints import FloorPlanConstraints
from genarch.generator.floor_plan_generator import generate_floorplan
from genarch.validator.geometry_validator import GeometryValidator
from genarch.validator.connectivity_validator import ConnectivityValidator
from genarch.validator.uk_building_regs import UKBuildingRegsValidator
from genarch.exporters.dxf_exporter import export_dxf
from genarch.exporters.mesh_exporter import export_mesh
from genarch.exporters.json_exporter import export_json


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        prog="genarch",
        description="Generate deterministic floor plans and 3D meshes from architectural constraints",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python -m genarch --constraints constraints.json --out runs/run_001 --seed 123
    python -m genarch -c villa.json -o output/ -s 42 --wall-height 2.8
    python -m genarch -c constraints.json -o output/ --skip-mesh --skip-validation

Output files:
    plan.dxf    - Vector floor plan (AutoCAD DXF)
    plan.json   - Floor plan data (JSON)
    model.glb   - 3D mesh (GLTF Binary)
    model.obj   - 3D mesh (Wavefront OBJ)
    run.json    - Run metadata and validation results
        """,
    )

    parser.add_argument(
        "--constraints", "-c",
        type=Path,
        required=True,
        help="Path to constraints JSON file",
    )
    parser.add_argument(
        "--out", "-o",
        type=Path,
        required=True,
        help="Output directory for generated files",
    )
    parser.add_argument(
        "--seed", "-s",
        type=int,
        default=42,
        help="Random seed for deterministic generation (default: 42)",
    )
    parser.add_argument(
        "--wall-height",
        type=float,
        default=3.0,
        help="Wall height in meters (default: 3.0)",
    )
    parser.add_argument(
        "--skip-mesh",
        action="store_true",
        help="Skip 3D mesh generation (faster)",
    )
    parser.add_argument(
        "--skip-validation",
        action="store_true",
        help="Skip validation (not recommended)",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Use strict UK Building Regs validation",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Print detailed progress information",
    )

    return parser.parse_args()


def main():
    """Main entry point."""
    args = parse_args()

    # Validate input file exists
    if not args.constraints.exists():
        print(f"Error: Constraints file not found: {args.constraints}")
        sys.exit(1)

    # Create output directory
    args.out.mkdir(parents=True, exist_ok=True)

    # Load constraints
    if args.verbose:
        print(f"Loading constraints from {args.constraints}...")

    try:
        constraints = FloorPlanConstraints.from_json(args.constraints)
    except Exception as e:
        print(f"Error loading constraints: {e}")
        sys.exit(1)

    if args.verbose:
        print(f"  - Envelope: {len(constraints.envelope_polygon)} vertices")
        print(f"  - Target area: {constraints.total_area_m2} m²")
        print(f"  - Rooms: {len(constraints.rooms)}")
        print(f"  - Building type: {constraints.building_type.value}")

    # Generate floor plan
    if args.verbose:
        print(f"\nGenerating floor plan with seed {args.seed}...")

    floor_plan, metadata = generate_floorplan(constraints, args.seed)

    if args.verbose:
        print(f"  - Generated {len(floor_plan.rooms)} rooms")
        print(f"  - Generated {len(floor_plan.walls)} walls")
        print(f"  - Generated {len(floor_plan.openings)} openings")
        print(f"  - Total area: {floor_plan.total_area_m2:.1f} m²")

    # Validate
    validation_passed = True
    if not args.skip_validation:
        if args.verbose:
            print("\nValidating floor plan...")

        # Geometry validation
        geo_validator = GeometryValidator()
        geo_valid, geo_errors = geo_validator.validate(
            floor_plan, constraints.total_area_m2
        )
        metadata.add_validation_result("geometry", geo_valid)

        if not geo_valid:
            validation_passed = False
            print("Geometry validation errors:")
            for err in geo_errors:
                print(f"  - {err}")

        # Connectivity validation
        conn_validator = ConnectivityValidator()
        conn_valid, conn_errors = conn_validator.validate(floor_plan)
        metadata.add_validation_result("connectivity", conn_valid)

        if not conn_valid:
            # Connectivity issues are warnings, not errors
            print("Connectivity warnings:")
            for err in conn_errors:
                print(f"  - {err}")

        # UK Building Regs validation
        uk_validator = UKBuildingRegsValidator(strict=args.strict)
        uk_valid, uk_errors = uk_validator.validate(floor_plan)
        metadata.add_validation_result("uk_building_regs", uk_valid)

        if not uk_valid:
            validation_passed = False
            print("UK Building Regs validation errors:")
            for err in uk_errors:
                print(f"  - {err}")

        if validation_passed:
            if args.verbose:
                print("  All validations passed!")
        else:
            print("\nWarning: Validation errors found. Continuing with export...")

    # Export files
    if args.verbose:
        print("\nExporting files...")

    # DXF export
    dxf_path = args.out / "plan.dxf"
    if args.verbose:
        print(f"  - Exporting DXF to {dxf_path}...")
    export_dxf(floor_plan, dxf_path, metadata)

    # JSON export
    json_path = args.out / "plan.json"
    if args.verbose:
        print(f"  - Exporting JSON to {json_path}...")
    export_json(floor_plan, json_path, metadata)

    # 3D mesh export
    if not args.skip_mesh:
        glb_path = args.out / "model.glb"
        if args.verbose:
            print(f"  - Exporting GLB to {glb_path}...")
        export_mesh(
            floor_plan, glb_path,
            format="glb",
            wall_height_m=args.wall_height,
            metadata=metadata,
        )

        obj_path = args.out / "model.obj"
        if args.verbose:
            print(f"  - Exporting OBJ to {obj_path}...")
        export_mesh(
            floor_plan, obj_path,
            format="obj",
            wall_height_m=args.wall_height,
            metadata=metadata,
        )

    # Export run metadata
    run_path = args.out / "run.json"
    if args.verbose:
        print(f"  - Exporting run metadata to {run_path}...")

    metadata.add_statistic("constraints_file", str(args.constraints))
    metadata.add_statistic("output_directory", str(args.out))
    metadata.to_json(run_path)

    # Summary
    print(f"\nOutput files written to {args.out}/")
    print(f"  - plan.dxf")
    print(f"  - plan.json")
    if not args.skip_mesh:
        print(f"  - model.glb")
        print(f"  - model.obj")
    print(f"  - run.json")

    if not validation_passed:
        print("\nNote: Some validation errors were found. Review the output carefully.")
        sys.exit(1)

    print("\nGeneration complete!")


if __name__ == "__main__":
    main()
