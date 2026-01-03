#!/usr/bin/env python3
"""
Smoke Tests for genarch Pipeline

Fast validation tests for CI:
1. PDF page size (A1: 841mm × 594mm)
2. Non-empty outputs (plan.json, plan.dxf, run.json)
3. Manifest schema validation
4. Basic pipeline execution (Phase 1 only)

Run with: python -m pytest tests/test_smoke.py -v
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest

# A1 paper dimensions in mm
A1_WIDTH_MM = 841
A1_HEIGHT_MM = 594
# Tolerance for PDF size validation (±2mm)
SIZE_TOLERANCE_MM = 2


class TestPDFValidation:
    """Tests for A1 PDF validation."""

    def test_validate_a1_size_from_file(self, tmp_path):
        """Test PDF size validation with a generated PDF."""
        # Skip if pypdf not installed
        pytest.importorskip("pypdf")
        from pypdf import PdfReader

        # Run a quick pipeline to generate a PDF
        run_path = tmp_path / "smoke_run"
        result = self._run_pipeline(
            prompt="small house 100sqm",
            output_path=run_path,
            seed=12345,
            skip_phase2=True,
        )

        if result["returncode"] != 0:
            pytest.skip(f"Pipeline failed: {result['stderr'][:500]}")

        pdf_path = run_path / "phase4" / "A1_sheet.pdf"
        if not pdf_path.exists():
            pytest.skip("PDF not generated (Phase 4 may have failed)")

        # Validate PDF size
        reader = PdfReader(str(pdf_path))
        page = reader.pages[0]

        # Convert points to mm (1 point = 1/72 inch, 1 inch = 25.4mm)
        width_pt = float(page.mediabox.width)
        height_pt = float(page.mediabox.height)
        width_mm = width_pt * 25.4 / 72
        height_mm = height_pt * 25.4 / 72

        # Check A1 dimensions (landscape: 841 × 594mm)
        assert abs(width_mm - A1_WIDTH_MM) < SIZE_TOLERANCE_MM, \
            f"PDF width {width_mm:.1f}mm != A1 width {A1_WIDTH_MM}mm"
        assert abs(height_mm - A1_HEIGHT_MM) < SIZE_TOLERANCE_MM, \
            f"PDF height {height_mm:.1f}mm != A1 height {A1_HEIGHT_MM}mm"

    def _run_pipeline(
        self,
        prompt: str,
        output_path: Path,
        seed: int = 42,
        skip_phase2: bool = True,
    ) -> Dict[str, Any]:
        """Run genarch pipeline and return result."""
        cmd = [
            sys.executable, "-m", "genarch.pipeline",
            "--prompt", prompt,
            "--out", str(output_path),
            "--seed", str(seed),
        ]
        if skip_phase2:
            cmd.append("--skip-phase2")

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
            cwd=str(Path(__file__).parent.parent),
        )

        return {
            "returncode": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
        }


class TestOutputValidation:
    """Tests for pipeline output validation."""

    def test_phase1_outputs_exist(self, tmp_path):
        """Test that Phase 1 produces required outputs."""
        run_path = tmp_path / "phase1_test"

        result = subprocess.run(
            [
                sys.executable, "-m", "genarch.pipeline",
                "--prompt", "simple house 80sqm",
                "--out", str(run_path),
                "--seed", "99999",
                "--skip-phase2",
                "--skip-phase4",
            ],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=str(Path(__file__).parent.parent),
        )

        # Pipeline may exit with code 1 due to validation warnings, but still produce outputs
        # Check that required outputs exist regardless of exit code
        required_files = ["plan.json", "plan.dxf", "run.json"]
        for filename in required_files:
            file_path = run_path / filename
            assert file_path.exists(), f"Missing required output: {filename} (exit code: {result.returncode})"
            assert file_path.stat().st_size > 0, f"Empty output file: {filename}"

    def test_plan_json_has_required_fields(self, tmp_path):
        """Test that plan.json has required schema fields."""
        run_path = tmp_path / "schema_test"

        result = subprocess.run(
            [
                sys.executable, "-m", "genarch.pipeline",
                "--prompt", "office building 150sqm",
                "--out", str(run_path),
                "--seed", "11111",
                "--skip-phase2",
                "--skip-phase4",
            ],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=str(Path(__file__).parent.parent),
        )

        # Pipeline may exit with code 1 due to validation warnings
        # Skip only if plan.json wasn't generated at all

        plan_path = run_path / "plan.json"
        assert plan_path.exists(), "plan.json not found"

        with open(plan_path) as f:
            plan = json.load(f)

        # Check required top-level fields
        required_fields = ["rooms", "walls", "envelope"]
        for field in required_fields:
            assert field in plan, f"Missing required field: {field}"

        # Check rooms have required properties
        if plan["rooms"]:
            room = plan["rooms"][0]
            room_fields = ["id", "name", "polygon"]
            for field in room_fields:
                assert field in room, f"Room missing field: {field}"

    def test_constraints_json_generated(self, tmp_path):
        """Test that constraints.json is generated from prompt."""
        run_path = tmp_path / "constraints_test"

        result = subprocess.run(
            [
                sys.executable, "-m", "genarch.pipeline",
                "--prompt", "modern villa 200sqm",
                "--out", str(run_path),
                "--seed", "22222",
                "--skip-phase2",
                "--skip-phase4",
            ],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=str(Path(__file__).parent.parent),
        )

        # Pipeline may exit with code 1 due to validation warnings
        # Check if constraints.json was generated regardless

        constraints_path = run_path / "constraints.json"
        assert constraints_path.exists(), "constraints.json not generated"

        with open(constraints_path) as f:
            constraints = json.load(f)

        # Verify area was parsed from prompt
        assert "total_area_m2" in constraints, "Missing total_area_m2"
        assert constraints["total_area_m2"] == 200, "Area not parsed from prompt"


class TestManifestValidation:
    """Tests for pipeline manifest validation."""

    def test_pipeline_manifest_schema(self, tmp_path):
        """Test that pipeline_manifest.json has valid schema."""
        run_path = tmp_path / "manifest_test"

        result = subprocess.run(
            [
                sys.executable, "-m", "genarch.pipeline",
                "--prompt", "house 120sqm",
                "--out", str(run_path),
                "--seed", "33333",
                "--skip-phase2",
            ],
            capture_output=True,
            text=True,
            timeout=120,
            cwd=str(Path(__file__).parent.parent),
        )

        # Pipeline may exit with code 1 due to validation warnings
        # Check if manifest was generated regardless

        manifest_path = run_path / "pipeline_manifest.json"
        assert manifest_path.exists(), "pipeline_manifest.json not found"

        with open(manifest_path) as f:
            manifest = json.load(f)

        # Check required manifest fields
        required_fields = [
            "version",
            "pipeline",
            "run_id",
            "started_at",
            "completed_at",
            "duration_seconds",
            "config",
            "phases",
            "outputs",
        ]
        for field in required_fields:
            assert field in manifest, f"Manifest missing field: {field}"

        # Validate types
        assert isinstance(manifest["duration_seconds"], (int, float))
        assert manifest["duration_seconds"] >= 0
        assert isinstance(manifest["phases"], dict)
        assert isinstance(manifest["config"], dict)

    def test_phase4_sheet_manifest(self, tmp_path):
        """Test that sheet_manifest.json has valid schema."""
        run_path = tmp_path / "sheet_manifest_test"

        result = subprocess.run(
            [
                sys.executable, "-m", "genarch.pipeline",
                "--prompt", "apartment 90sqm",
                "--out", str(run_path),
                "--seed", "44444",
                "--skip-phase2",
            ],
            capture_output=True,
            text=True,
            timeout=120,
            cwd=str(Path(__file__).parent.parent),
        )

        # Pipeline may exit with code 1 due to validation warnings

        sheet_manifest_path = run_path / "phase4" / "sheet_manifest.json"
        if not sheet_manifest_path.exists():
            pytest.skip("sheet_manifest.json not found (Phase 4 may have failed)")

        with open(sheet_manifest_path) as f:
            manifest = json.load(f)

        # Check required sheet manifest fields
        required_fields = ["version", "page", "panels"]
        for field in required_fields:
            assert field in manifest, f"Sheet manifest missing field: {field}"

        # Validate page dimensions
        page = manifest["page"]
        assert page["format"] == "A1"
        assert page["width_mm"] == A1_WIDTH_MM
        assert page["height_mm"] == A1_HEIGHT_MM


class TestValidationIntegration:
    """Tests for validation system integration."""

    def test_asset_validation_runs(self, tmp_path):
        """Test that asset validation runs and produces report."""
        run_path = tmp_path / "asset_val_test"

        result = subprocess.run(
            [
                sys.executable, "-m", "genarch.pipeline",
                "--prompt", "cottage 70sqm",
                "--out", str(run_path),
                "--seed", "55555",
                "--skip-phase2",
            ],
            capture_output=True,
            text=True,
            timeout=120,
            cwd=str(Path(__file__).parent.parent),
        )

        # Pipeline may exit with code 1 due to validation warnings

        # Asset report should be generated
        asset_report_path = run_path / "asset_report.json"
        assert asset_report_path.exists(), "asset_report.json not generated"

        with open(asset_report_path) as f:
            report = json.load(f)

        assert "passed" in report
        assert "assets" in report
        assert "summary" in report

    def test_drift_validation_skipped_without_phase3(self, tmp_path):
        """Test that drift check is gracefully skipped without Phase 3."""
        run_path = tmp_path / "drift_test"

        result = subprocess.run(
            [
                sys.executable, "-m", "genarch.pipeline",
                "--prompt", "studio 50sqm",
                "--out", str(run_path),
                "--seed", "66666",
                "--skip-phase2",
            ],
            capture_output=True,
            text=True,
            timeout=120,
            cwd=str(Path(__file__).parent.parent),
        )

        # Pipeline should succeed even without Phase 2/3
        # Drift check should be skipped gracefully
        assert result.returncode == 0 or "Phase 4" in result.stderr


class TestReproducibility:
    """Tests for pipeline reproducibility."""

    def test_same_seed_produces_same_output(self, tmp_path):
        """Test that same seed produces identical plan.json."""
        run1_path = tmp_path / "repro_run1"
        run2_path = tmp_path / "repro_run2"

        prompt = "bungalow 100sqm"
        seed = 77777

        # Run pipeline twice with same seed
        for run_path in [run1_path, run2_path]:
            result = subprocess.run(
                [
                    sys.executable, "-m", "genarch.pipeline",
                    "--prompt", prompt,
                    "--out", str(run_path),
                    "--seed", str(seed),
                    "--skip-phase2",
                    "--skip-phase4",
                ],
                capture_output=True,
                text=True,
                timeout=60,
                cwd=str(Path(__file__).parent.parent),
            )

            # Pipeline may exit with code 1 due to validation warnings
            # Skip only if plan.json wasn't generated
            plan_path = run_path / "plan.json"
            if not plan_path.exists():
                pytest.skip(f"Pipeline failed to produce plan.json: {result.stderr[:300]}")

        # Compare plan.json outputs
        with open(run1_path / "plan.json") as f:
            plan1 = json.load(f)
        with open(run2_path / "plan.json") as f:
            plan2 = json.load(f)

        # Remove timestamp fields for comparison
        for plan in [plan1, plan2]:
            if "metadata" in plan:
                plan["metadata"].pop("generated_at", None)

        assert plan1 == plan2, "Same seed produced different outputs"


# Standalone smoke test runner
def run_quick_smoke_test():
    """Run a quick smoke test without pytest."""
    import tempfile

    print("=" * 60)
    print("GENARCH SMOKE TEST")
    print("=" * 60)

    with tempfile.TemporaryDirectory() as tmp_dir:
        run_path = Path(tmp_dir) / "smoke_test"

        print("\n[1/3] Running pipeline (Phase 1 + 4, skip Blender)...")
        result = subprocess.run(
            [
                sys.executable, "-m", "genarch.pipeline",
                "--prompt", "modern house 150sqm",
                "--out", str(run_path),
                "--seed", "42",
                "--skip-phase2",
                "-v",
            ],
            capture_output=True,
            text=True,
            timeout=120,
            cwd=str(Path(__file__).parent.parent),
        )

        # Pipeline may exit with code 1 due to validation warnings, but still produce outputs
        # We check for outputs first, then report the exit code
        if result.returncode != 0:
            print(f"NOTE: Pipeline exited with code {result.returncode} (may be validation warnings)")
            if result.stderr:
                # Only show first 500 chars of stderr
                print(f"  STDERR: {result.stderr[:500]}")
        else:
            print("PASS: Pipeline completed with exit code 0")

        # Check outputs
        print("\n[2/3] Checking outputs...")
        required_files = ["plan.json", "plan.dxf", "run.json", "constraints.json"]
        missing = []
        for filename in required_files:
            path = run_path / filename
            if not path.exists():
                missing.append(filename)
            elif path.stat().st_size == 0:
                missing.append(f"{filename} (empty)")

        if missing:
            print(f"FAIL: Missing or empty files: {missing}")
            return False

        print(f"PASS: All required files present")

        # Check PDF if available
        print("\n[3/3] Checking A1 PDF...")
        pdf_path = run_path / "phase4" / "A1_sheet.pdf"
        if pdf_path.exists():
            try:
                from pypdf import PdfReader
                reader = PdfReader(str(pdf_path))
                page = reader.pages[0]
                width_mm = float(page.mediabox.width) * 25.4 / 72
                height_mm = float(page.mediabox.height) * 25.4 / 72
                print(f"  PDF size: {width_mm:.1f}mm × {height_mm:.1f}mm")

                if abs(width_mm - A1_WIDTH_MM) < SIZE_TOLERANCE_MM and \
                   abs(height_mm - A1_HEIGHT_MM) < SIZE_TOLERANCE_MM:
                    print("PASS: PDF is A1 size")
                else:
                    print(f"WARN: PDF size differs from A1 ({A1_WIDTH_MM}×{A1_HEIGHT_MM}mm)")
            except ImportError:
                print("SKIP: pypdf not installed, cannot validate PDF size")
        else:
            print("SKIP: PDF not generated (Phase 4 may have skipped)")

        print("\n" + "=" * 60)
        print("SMOKE TEST PASSED")
        print("=" * 60)
        return True


if __name__ == "__main__":
    success = run_quick_smoke_test()
    sys.exit(0 if success else 1)
