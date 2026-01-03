"""
genarch.validation - Quality gates for pipeline validation.

This module provides:
- DriftChecker: Validates Phase 3 renders match Phase 2 geometry (F1/precision/recall)
- AssetValidator: Ensures required assets exist before Phase 4

Usage:
    # CLI
    python -m genarch.validate --run runs/run_001 --view persp_main --threshold 0.65

    # Python API
    from genarch.validation import DriftChecker, AssetValidator

    checker = DriftChecker(threshold=0.65, tolerance_px=3)
    report = checker.check_all(run_path)
    if not report.passed:
        print(f"Drift detected: {report.summary['failed_views']}")

    validator = AssetValidator(strict=True)
    result = validator.validate_for_phase4(run_path)
    if not result.passed:
        print(f"Missing assets: {result.errors}")
"""

from .drift_checker import DriftChecker, DriftResult, DriftCheckReport, DriftMetrics
from .asset_validator import AssetValidator, AssetValidationResult, AssetInfo

__all__ = [
    # Drift checking
    "DriftChecker",
    "DriftResult",
    "DriftCheckReport",
    "DriftMetrics",
    # Asset validation
    "AssetValidator",
    "AssetValidationResult",
    "AssetInfo",
]
