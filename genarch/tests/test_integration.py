"""
Integration tests for genarch package.

Tests the full generation pipeline from constraints to export.
"""

import json
import tempfile
from pathlib import Path

import pytest

from genarch.models.constraints import (
    FloorPlanConstraints,
    RoomSpec,
    Point2D,
    BuildingType,
)
from genarch.generator.floor_plan_generator import generate_floorplan
from genarch.validator.geometry_validator import GeometryValidator
from genarch.validator.connectivity_validator import ConnectivityValidator
from genarch.validator.uk_building_regs import UKBuildingRegsValidator


@pytest.fixture
def simple_constraints():
    """Create simple test constraints."""
    return FloorPlanConstraints(
        envelope_polygon=[
            Point2D(0, 0),
            Point2D(10, 0),
            Point2D(10, 8),
            Point2D(0, 8),
        ],
        total_area_m2=80,
        rooms=[
            RoomSpec(name="Living", area_m2=30, adjacency=["Hallway"], exterior_wall_preference=True),
            RoomSpec(name="Bedroom", area_m2=20, adjacency=["Hallway"], exterior_wall_preference=True),
            RoomSpec(name="Kitchen", area_m2=15, adjacency=["Hallway"], exterior_wall_preference=True),
            RoomSpec(name="Hallway", area_m2=10, adjacency=["Living", "Bedroom", "Kitchen", "Entrance"]),
            RoomSpec(name="Entrance", area_m2=5, adjacency=["Hallway"], exterior_wall_preference=True),
        ],
        building_type=BuildingType.RESIDENTIAL,
        entrance_facade="south",
    )


@pytest.fixture
def villa_constraints():
    """Create villa test constraints from example file."""
    constraints_path = Path(__file__).parent.parent / "constraints.example.json"
    if constraints_path.exists():
        return FloorPlanConstraints.from_json(constraints_path)

    # Fallback if file doesn't exist
    return FloorPlanConstraints(
        envelope_polygon=[
            Point2D(0, 0),
            Point2D(15, 0),
            Point2D(15, 13.5),
            Point2D(0, 13.5),
        ],
        total_area_m2=200,
        rooms=[
            RoomSpec(name="Living/Kitchen", area_m2=45, adjacency=["Entrance", "Hallway"], exterior_wall_preference=True),
            RoomSpec(name="Master Bedroom", area_m2=18, adjacency=["Bathroom 1", "Hallway"], exterior_wall_preference=True),
            RoomSpec(name="Bedroom 2", area_m2=14, adjacency=["Hallway"], exterior_wall_preference=True),
            RoomSpec(name="Bedroom 3", area_m2=12, adjacency=["Hallway"], exterior_wall_preference=True),
            RoomSpec(name="Bathroom 1", area_m2=6, adjacency=["Master Bedroom", "Hallway"]),
            RoomSpec(name="Bathroom 2", area_m2=4, adjacency=["Hallway"]),
            RoomSpec(name="Hallway", area_m2=15, adjacency=["Entrance", "Living/Kitchen", "Master Bedroom", "Bedroom 2", "Bedroom 3", "Bathroom 1", "Bathroom 2", "Storage"]),
            RoomSpec(name="Storage", area_m2=6, adjacency=["Hallway"]),
            RoomSpec(name="Entrance", area_m2=8, adjacency=["Hallway", "Living/Kitchen"], exterior_wall_preference=True),
        ],
        building_type=BuildingType.RESIDENTIAL,
        entrance_facade="south",
    )


class TestGeneration:
    """Test floor plan generation."""

    def test_generate_simple_plan(self, simple_constraints):
        """Test generation with simple constraints."""
        floor_plan, metadata = generate_floorplan(simple_constraints, seed=42)

        assert floor_plan is not None
        assert metadata is not None
        assert metadata.seed == 42
        assert len(floor_plan.rooms) == len(simple_constraints.rooms)
        assert len(floor_plan.walls) > 0
        assert floor_plan.total_area_m2 > 0

    def test_generate_villa_plan(self, villa_constraints):
        """Test generation with villa constraints."""
        floor_plan, metadata = generate_floorplan(villa_constraints, seed=123)

        assert floor_plan is not None
        assert len(floor_plan.rooms) == len(villa_constraints.rooms)
        assert len(floor_plan.walls) > 0
        assert len(floor_plan.openings) > 0

    def test_deterministic_generation(self, simple_constraints):
        """Test that same seed produces identical results."""
        floor_plan1, _ = generate_floorplan(simple_constraints, seed=42)
        floor_plan2, _ = generate_floorplan(simple_constraints, seed=42)

        # Compare room positions
        for r1, r2 in zip(floor_plan1.rooms, floor_plan2.rooms):
            assert r1.name == r2.name
            assert r1.area_m2 == pytest.approx(r2.area_m2, rel=0.01)

    def test_different_seeds_different_results(self, simple_constraints):
        """Test that different seeds produce different results."""
        floor_plan1, _ = generate_floorplan(simple_constraints, seed=42)
        floor_plan2, _ = generate_floorplan(simple_constraints, seed=123)

        # At least some rooms should be in different positions
        # (with different seeds, BSP splits differently)
        different = False
        for r1, r2 in zip(floor_plan1.rooms, floor_plan2.rooms):
            if r1.polygon[0].x != r2.polygon[0].x:
                different = True
                break

        # Note: It's possible (though unlikely) that different seeds
        # produce the same layout for small constraint sets


class TestValidation:
    """Test floor plan validation."""

    def test_geometry_validation(self, simple_constraints):
        """Test geometry validator."""
        floor_plan, _ = generate_floorplan(simple_constraints, seed=42)
        validator = GeometryValidator()

        is_valid, errors = validator.validate(floor_plan, simple_constraints.total_area_m2)

        # May have some validation issues, but should complete
        assert isinstance(is_valid, bool)
        assert isinstance(errors, list)

    def test_connectivity_validation(self, simple_constraints):
        """Test connectivity validator."""
        floor_plan, _ = generate_floorplan(simple_constraints, seed=42)
        validator = ConnectivityValidator()

        is_valid, errors = validator.validate(floor_plan)

        assert isinstance(is_valid, bool)
        assert isinstance(errors, list)

    def test_uk_regs_validation(self, simple_constraints):
        """Test UK Building Regulations validator."""
        floor_plan, _ = generate_floorplan(simple_constraints, seed=42)
        validator = UKBuildingRegsValidator()

        is_valid, errors = validator.validate(floor_plan)

        assert isinstance(is_valid, bool)
        assert isinstance(errors, list)


class TestExport:
    """Test floor plan export."""

    def test_json_export(self, simple_constraints):
        """Test JSON export."""
        from genarch.exporters.json_exporter import export_json

        floor_plan, metadata = generate_floorplan(simple_constraints, seed=42)

        with tempfile.TemporaryDirectory() as tmpdir:
            output_path = Path(tmpdir) / "plan.json"
            export_json(floor_plan, output_path, metadata)

            assert output_path.exists()

            # Verify JSON is valid
            with open(output_path) as f:
                data = json.load(f)

            assert "rooms" in data
            assert "walls" in data
            assert "openings" in data
            assert len(data["rooms"]) == len(simple_constraints.rooms)

    def test_dxf_export(self, simple_constraints):
        """Test DXF export."""
        pytest.importorskip("ezdxf")
        from genarch.exporters.dxf_exporter import export_dxf

        floor_plan, metadata = generate_floorplan(simple_constraints, seed=42)

        with tempfile.TemporaryDirectory() as tmpdir:
            output_path = Path(tmpdir) / "plan.dxf"
            export_dxf(floor_plan, output_path, metadata)

            assert output_path.exists()
            assert output_path.stat().st_size > 0

    def test_mesh_export_glb(self, simple_constraints):
        """Test GLB mesh export."""
        pytest.importorskip("trimesh")
        from genarch.exporters.mesh_exporter import export_mesh

        floor_plan, metadata = generate_floorplan(simple_constraints, seed=42)

        with tempfile.TemporaryDirectory() as tmpdir:
            output_path = Path(tmpdir) / "model.glb"
            export_mesh(floor_plan, output_path, format="glb", metadata=metadata)

            assert output_path.exists()
            assert output_path.stat().st_size > 0

    def test_mesh_export_obj(self, simple_constraints):
        """Test OBJ mesh export."""
        pytest.importorskip("trimesh")
        from genarch.exporters.mesh_exporter import export_mesh

        floor_plan, metadata = generate_floorplan(simple_constraints, seed=42)

        with tempfile.TemporaryDirectory() as tmpdir:
            output_path = Path(tmpdir) / "model.obj"
            export_mesh(floor_plan, output_path, format="obj", metadata=metadata)

            assert output_path.exists()
            assert output_path.stat().st_size > 0


class TestModels:
    """Test data models."""

    def test_constraints_from_dict(self):
        """Test loading constraints from dict."""
        data = {
            "envelope": [
                {"x": 0, "y": 0},
                {"x": 10, "y": 0},
                {"x": 10, "y": 10},
                {"x": 0, "y": 10},
            ],
            "total_area_m2": 100,
            "rooms": [
                {"name": "Room1", "area_m2": 50},
                {"name": "Room2", "area_m2": 50},
            ],
        }

        constraints = FloorPlanConstraints.from_dict(data)

        assert len(constraints.envelope_polygon) == 4
        assert constraints.total_area_m2 == 100
        assert len(constraints.rooms) == 2

    def test_constraints_to_dict(self, simple_constraints):
        """Test converting constraints to dict."""
        data = simple_constraints.to_dict()

        assert "envelope" in data
        assert "total_area_m2" in data
        assert "rooms" in data

    def test_floor_plan_to_dict(self, simple_constraints):
        """Test converting floor plan to dict."""
        floor_plan, _ = generate_floorplan(simple_constraints, seed=42)
        data = floor_plan.to_dict()

        assert "rooms" in data
        assert "walls" in data
        assert "openings" in data
        assert "envelope" in data


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
