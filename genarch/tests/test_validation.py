#!/usr/bin/env python3
"""
Tests for genarch.validation module.

Tests:
1. Asset validation - required files check
2. Drift check - edge comparison (requires opencv-python)
3. Integration with pipeline
"""

import json
import tempfile
from pathlib import Path

import pytest


class TestAssetValidator:
    """Tests for AssetValidator."""

    def test_import(self):
        """Test that AssetValidator can be imported."""
        from genarch.validation import AssetValidator
        assert AssetValidator is not None

    def test_validate_empty_folder(self, tmp_path):
        """Test validation of empty folder fails."""
        from genarch.validation import AssetValidator

        validator = AssetValidator(strict=True, verbose=False)
        result = validator.validate(tmp_path)

        assert not result.passed
        assert len(result.errors) > 0
        assert any("plan.json" in err for err in result.errors)

    def test_validate_with_required_files(self, tmp_path):
        """Test validation passes with required Phase 1 files."""
        from genarch.validation import AssetValidator

        # Create required files
        (tmp_path / "plan.json").write_text("{}")
        (tmp_path / "plan.dxf").write_text("0\nEOF")
        (tmp_path / "run.json").write_text("{}")

        validator = AssetValidator(strict=True, verbose=False)
        result = validator.validate(tmp_path)

        assert result.passed
        assert len(result.errors) == 0

    def test_validate_for_phase4_minimal(self, tmp_path):
        """Test Phase 4 validation with minimal files."""
        from genarch.validation import AssetValidator

        # Create only required files for Phase 4
        (tmp_path / "plan.json").write_text('{"rooms": []}')
        (tmp_path / "plan.dxf").write_text("0\nEOF")

        validator = AssetValidator(verbose=False)
        result = validator.validate_for_phase4(tmp_path)

        assert result.passed
        assert result.summary.get("ready_for_phase4") is True

    def test_validate_for_phase4_missing_plan(self, tmp_path):
        """Test Phase 4 validation fails without plan.json."""
        from genarch.validation import AssetValidator

        # Create only DXF, missing plan.json
        (tmp_path / "plan.dxf").write_text("0\nEOF")

        validator = AssetValidator(verbose=False)
        result = validator.validate_for_phase4(tmp_path)

        assert not result.passed
        assert any("plan.json" in err for err in result.errors)

    def test_asset_info_hashing(self, tmp_path):
        """Test that asset hashing works."""
        from genarch.validation import AssetValidator

        # Create a file with known content
        test_file = tmp_path / "test.txt"
        test_file.write_text("hello world")

        validator = AssetValidator(compute_hashes=True, verbose=False)
        # Access internal method
        info = validator._check_asset(tmp_path, "test.txt", required=True, category="test")

        assert info.exists
        assert info.hash is not None
        assert info.hash.startswith("sha256:")

    def test_result_save_json(self, tmp_path):
        """Test saving validation result to JSON."""
        from genarch.validation import AssetValidator

        (tmp_path / "plan.json").write_text("{}")
        (tmp_path / "plan.dxf").write_text("0\nEOF")
        (tmp_path / "run.json").write_text("{}")

        validator = AssetValidator(verbose=False)
        result = validator.validate(tmp_path)

        # Save result
        output_path = tmp_path / "asset_report.json"
        result.save(output_path)

        assert output_path.exists()

        # Verify JSON is valid
        with open(output_path) as f:
            data = json.load(f)

        assert "passed" in data
        assert "assets" in data
        assert "summary" in data


class TestDriftChecker:
    """Tests for DriftChecker."""

    def test_import(self):
        """Test that DriftChecker can be imported."""
        from genarch.validation import DriftChecker
        assert DriftChecker is not None

    def test_check_missing_files_gracefully(self, tmp_path):
        """Test that missing files are handled gracefully."""
        from genarch.validation import DriftChecker

        checker = DriftChecker(threshold=0.15, verbose=False)
        result = checker.check_view(tmp_path, "elevation_N")

        # Should pass (skip) when files don't exist or deps missing
        assert result.passed
        # Either skipped due to missing deps or missing files
        assert result.error is not None or result.score == 0.0

    def test_check_all_empty_folder(self, tmp_path):
        """Test check_all on empty folder."""
        from genarch.validation import DriftChecker

        checker = DriftChecker(verbose=False)
        report = checker.check_all(tmp_path)

        # All views should pass (skipped - no files or deps missing)
        assert report.passed

    def test_drift_result_to_dict(self):
        """Test DriftResult serialization."""
        from genarch.validation.drift_checker import DriftResult

        result = DriftResult(
            view_name="elevation_N",
            passed=True,
            score=0.05,
            threshold=0.15,
            phase2_path="/path/to/phase2.png",
            phase3_path="/path/to/phase3.png",
            details={"chamfer_distance": 0.03, "edge_iou": 0.95},
        )

        data = result.to_dict()

        assert data["view_name"] == "elevation_N"
        assert data["passed"] is True
        assert data["score"] == 0.05
        assert data["details"]["chamfer_distance"] == 0.03

    def test_report_save_json(self, tmp_path):
        """Test saving drift report to JSON."""
        from genarch.validation.drift_checker import DriftCheckReport, DriftResult

        results = [
            DriftResult(
                view_name="elevation_N",
                passed=True,
                score=0.05,
                threshold=0.15,
            )
        ]

        report = DriftCheckReport(
            passed=True,
            results=results,
            summary={"total_views": 1, "passed": 1},
        )

        output_path = tmp_path / "drift_report.json"
        report.save(output_path)

        assert output_path.exists()

        with open(output_path) as f:
            data = json.load(f)

        assert data["passed"] is True
        assert len(data["results"]) == 1


@pytest.mark.skipif(
    True,  # Skip by default - requires opencv-python
    reason="Requires opencv-python: pip install opencv-python"
)
class TestDriftCheckerWithImages:
    """Tests for DriftChecker that require opencv-python."""

    def test_edge_detection(self, tmp_path):
        """Test edge detection on synthetic image."""
        try:
            import cv2
            import numpy as np
        except ImportError:
            pytest.skip("opencv-python not installed")

        from genarch.validation import DriftChecker

        # Create synthetic edge image (Phase 2 style)
        phase2_dir = tmp_path / "phase2"
        phase2_dir.mkdir()

        # Create simple edge image
        edge_img = np.zeros((256, 256), dtype=np.uint8)
        cv2.rectangle(edge_img, (50, 50), (200, 200), 255, 2)
        cv2.imwrite(str(phase2_dir / "elevation_N_canny.png"), edge_img)

        # Create matching render (Phase 3)
        phase3_dir = tmp_path / "phase3"
        phase3_dir.mkdir()

        render_img = np.ones((256, 256, 3), dtype=np.uint8) * 200
        cv2.rectangle(render_img, (50, 50), (200, 200), (50, 50, 50), 2)
        cv2.imwrite(str(phase3_dir / "elevation_N_render.png"), render_img)

        # Run drift check
        checker = DriftChecker(threshold=0.5, verbose=False)
        result = checker.check_view(tmp_path, "elevation_N")

        assert result.passed
        assert result.score < 0.5

    def test_drift_detection(self, tmp_path):
        """Test that drift is detected when images don't match."""
        try:
            import cv2
            import numpy as np
        except ImportError:
            pytest.skip("opencv-python not installed")

        from genarch.validation import DriftChecker

        # Create Phase 2 edge image
        phase2_dir = tmp_path / "phase2"
        phase2_dir.mkdir()

        edge_img = np.zeros((256, 256), dtype=np.uint8)
        cv2.rectangle(edge_img, (50, 50), (200, 200), 255, 2)
        cv2.imwrite(str(phase2_dir / "elevation_N_canny.png"), edge_img)

        # Create Phase 3 render with DIFFERENT shape (drift!)
        phase3_dir = tmp_path / "phase3"
        phase3_dir.mkdir()

        render_img = np.ones((256, 256, 3), dtype=np.uint8) * 200
        cv2.circle(render_img, (128, 128), 80, (50, 50, 50), 2)  # Circle instead of rectangle
        cv2.imwrite(str(phase3_dir / "elevation_N_render.png"), render_img)

        # Run drift check with tight threshold
        checker = DriftChecker(threshold=0.1, verbose=False)
        result = checker.check_view(tmp_path, "elevation_N")

        # Should fail due to shape mismatch
        assert not result.passed
        assert result.score > 0.1


class TestPipelineIntegration:
    """Tests for validation integration with pipeline."""

    def test_pipeline_config_has_validation_options(self):
        """Test that PipelineConfig includes validation options."""
        from genarch.pipeline.runner import PipelineConfig

        config = PipelineConfig(
            prompt="test",
            output_path=Path("/tmp/test"),
            validate_assets=True,
            drift_check=True,
            drift_threshold=0.20,
        )

        assert config.validate_assets is True
        assert config.drift_check is True
        assert config.drift_threshold == 0.20

    def test_pipeline_runner_has_validators(self, tmp_path):
        """Test that PipelineRunner initializes validators."""
        from genarch.pipeline.runner import PipelineRunner, PipelineConfig

        config = PipelineConfig(
            prompt="test",
            output_path=tmp_path,
            cache_enabled=False,
        )

        runner = PipelineRunner(config)

        assert runner.asset_validator is not None
        assert runner.drift_checker is not None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
