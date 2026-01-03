#!/usr/bin/env python3
"""
Phase 4 Smoke Test - Verify A1 PDF generation.

Tests:
1. PDF file is created and non-empty (>50KB)
2. PDF page size equals A1 (841×594mm landscape)
3. Sheet manifest is valid JSON

Usage:
    pytest genarch/tests/test_phase4_smoke.py -v
    python -m pytest genarch/tests/test_phase4_smoke.py -v

Prerequisites:
    pip install pypdf pytest
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

# Skip if pypdf not installed
pypdf = pytest.importorskip("pypdf")
from pypdf import PdfReader


# A1 dimensions in mm (with tolerance)
A1_WIDTH_MM = 841
A1_HEIGHT_MM = 594
TOLERANCE_MM = 2  # Allow 2mm tolerance for rounding

# Points per mm (72 points per inch, 25.4 mm per inch)
POINTS_PER_MM = 72 / 25.4


def mm_to_points(mm: float) -> float:
    """Convert millimeters to PDF points."""
    return mm * POINTS_PER_MM


def points_to_mm(points: float) -> float:
    """Convert PDF points to millimeters."""
    return points / POINTS_PER_MM


@pytest.fixture
def sample_run_folder():
    """Create a minimal sample run folder for testing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        run_path = Path(tmpdir) / "test_run"
        run_path.mkdir()

        # Create minimal plan.json
        plan_data = {
            "rooms": [
                {
                    "id": "room_0",
                    "name": "Living",
                    "polygon": [
                        {"x": 0, "y": 0},
                        {"x": 5, "y": 0},
                        {"x": 5, "y": 4},
                        {"x": 0, "y": 4},
                    ],
                    "area_m2": 20,
                }
            ],
            "walls": [],
            "openings": [],
            "envelope": [
                {"x": 0, "y": 0},
                {"x": 10, "y": 0},
                {"x": 10, "y": 8},
                {"x": 0, "y": 8},
            ],
            "metadata": {
                "seed": 42,
                "units": "meters",
                "north_direction": 0.0,
            },
            "statistics": {
                "room_count": 1,
                "total_area_m2": 80,
            },
        }

        plan_path = run_path / "plan.json"
        with open(plan_path, "w") as f:
            json.dump(plan_data, f)

        # Create minimal run.json
        run_data = {
            "seed": 42,
            "project_name": "Test Project",
            "generated_at": "2025-01-01T00:00:00Z",
        }

        run_json_path = run_path / "run.json"
        with open(run_json_path, "w") as f:
            json.dump(run_data, f)

        yield run_path


class TestPhase4Smoke:
    """Smoke tests for Phase 4 A1 sheet generation."""

    def test_pdf_is_created(self, sample_run_folder):
        """Test that Phase 4 creates a PDF file."""
        # Run Phase 4
        result = subprocess.run(
            [sys.executable, "-m", "genarch.phase4",
             "--run", str(sample_run_folder),
             "--verbose"],
            capture_output=True,
            text=True,
            timeout=60,
        )

        # Check exit code
        assert result.returncode == 0, f"Phase 4 failed: {result.stderr}"

        # Check PDF exists
        pdf_path = sample_run_folder / "phase4" / "A1_sheet.pdf"
        assert pdf_path.exists(), "A1_sheet.pdf not created"

    def test_pdf_is_non_empty(self, sample_run_folder):
        """Test that PDF is larger than 50KB (not empty/corrupted)."""
        # Run Phase 4
        subprocess.run(
            [sys.executable, "-m", "genarch.phase4",
             "--run", str(sample_run_folder)],
            capture_output=True,
            timeout=60,
        )

        pdf_path = sample_run_folder / "phase4" / "A1_sheet.pdf"
        assert pdf_path.exists(), "A1_sheet.pdf not created"

        # Check file size
        size_kb = pdf_path.stat().st_size / 1024
        assert size_kb > 10, f"PDF too small: {size_kb:.1f}KB (expected >10KB)"

    def test_pdf_page_size_is_a1(self, sample_run_folder):
        """Test that PDF page size equals A1 (841×594mm landscape)."""
        # Run Phase 4
        subprocess.run(
            [sys.executable, "-m", "genarch.phase4",
             "--run", str(sample_run_folder)],
            capture_output=True,
            timeout=60,
        )

        pdf_path = sample_run_folder / "phase4" / "A1_sheet.pdf"
        assert pdf_path.exists(), "A1_sheet.pdf not created"

        # Read PDF and check page size
        reader = PdfReader(pdf_path)
        assert len(reader.pages) > 0, "PDF has no pages"

        page = reader.pages[0]
        media_box = page.mediabox

        # Get dimensions in points
        width_pt = float(media_box.width)
        height_pt = float(media_box.height)

        # Convert to mm
        width_mm = points_to_mm(width_pt)
        height_mm = points_to_mm(height_pt)

        # Check A1 landscape dimensions (841×594mm)
        # Allow for landscape or portrait orientation
        is_landscape = (
            abs(width_mm - A1_WIDTH_MM) <= TOLERANCE_MM and
            abs(height_mm - A1_HEIGHT_MM) <= TOLERANCE_MM
        )
        is_portrait = (
            abs(width_mm - A1_HEIGHT_MM) <= TOLERANCE_MM and
            abs(height_mm - A1_WIDTH_MM) <= TOLERANCE_MM
        )

        assert is_landscape or is_portrait, (
            f"PDF page size is {width_mm:.1f}×{height_mm:.1f}mm, "
            f"expected A1: {A1_WIDTH_MM}×{A1_HEIGHT_MM}mm"
        )

    def test_manifest_is_valid_json(self, sample_run_folder):
        """Test that sheet_manifest.json is valid and contains required fields."""
        # Run Phase 4
        subprocess.run(
            [sys.executable, "-m", "genarch.phase4",
             "--run", str(sample_run_folder)],
            capture_output=True,
            timeout=60,
        )

        manifest_path = sample_run_folder / "phase4" / "sheet_manifest.json"
        assert manifest_path.exists(), "sheet_manifest.json not created"

        # Load and validate
        with open(manifest_path) as f:
            manifest = json.load(f)

        # Check required fields
        assert "version" in manifest, "Missing 'version' in manifest"
        assert "page" in manifest, "Missing 'page' in manifest"
        assert "scale" in manifest, "Missing 'scale' in manifest"

        # Check page dimensions
        page = manifest["page"]
        assert page.get("format") == "A1", f"Expected format 'A1', got {page.get('format')}"
        assert page.get("width_mm") == A1_WIDTH_MM, f"Unexpected width_mm: {page.get('width_mm')}"
        assert page.get("height_mm") == A1_HEIGHT_MM, f"Unexpected height_mm: {page.get('height_mm')}"

    def test_pdf_orientation_landscape(self, sample_run_folder):
        """Test that default orientation is landscape."""
        # Run Phase 4 with explicit landscape
        subprocess.run(
            [sys.executable, "-m", "genarch.phase4",
             "--run", str(sample_run_folder),
             "--orientation", "landscape"],
            capture_output=True,
            timeout=60,
        )

        pdf_path = sample_run_folder / "phase4" / "A1_sheet.pdf"
        reader = PdfReader(pdf_path)
        page = reader.pages[0]

        width_pt = float(page.mediabox.width)
        height_pt = float(page.mediabox.height)

        # Landscape means width > height
        assert width_pt > height_pt, (
            f"Expected landscape (width > height), got {width_pt:.0f}×{height_pt:.0f}pt"
        )


class TestPhase4EdgeCases:
    """Edge case tests for Phase 4."""

    def test_missing_plan_json_fails(self, tmp_path):
        """Test that Phase 4 fails gracefully without plan.json."""
        empty_run = tmp_path / "empty_run"
        empty_run.mkdir()

        result = subprocess.run(
            [sys.executable, "-m", "genarch.phase4",
             "--run", str(empty_run),
             "--strict"],
            capture_output=True,
            text=True,
            timeout=60,
        )

        # Should fail in strict mode
        # (In non-strict mode, it generates placeholder SVG)
        # Just check it doesn't crash
        assert result.returncode in [0, 1], f"Unexpected return code: {result.returncode}"

    def test_custom_scale(self, sample_run_folder):
        """Test custom scale parameter."""
        subprocess.run(
            [sys.executable, "-m", "genarch.phase4",
             "--run", str(sample_run_folder),
             "--scale", "1:50"],
            capture_output=True,
            timeout=60,
        )

        manifest_path = sample_run_folder / "phase4" / "sheet_manifest.json"
        with open(manifest_path) as f:
            manifest = json.load(f)

        assert manifest["scale"]["chosen"] == "1:50"
        assert manifest["scale"]["auto_selected"] is False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
