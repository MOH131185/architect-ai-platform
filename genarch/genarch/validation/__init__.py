"""
genarch.validation - Quality gates for pipeline validation.

This module provides:
- DriftChecker: Validates Phase 3 renders match Phase 2 geometry
- AssetValidator: Ensures required assets exist before Phase 4
"""

from .drift_checker import DriftChecker, DriftResult
from .asset_validator import AssetValidator, AssetValidationResult

__all__ = [
    "DriftChecker",
    "DriftResult",
    "AssetValidator",
    "AssetValidationResult",
]
