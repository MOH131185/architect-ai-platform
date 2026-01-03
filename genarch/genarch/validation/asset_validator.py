"""
Asset Validator - Ensures required assets exist before Phase 4.

This module validates that all required files are present in the run folder
before proceeding to Phase 4 A1 sheet assembly.

Asset Categories:
- Required: Must exist for Phase 4 to proceed (plan.json, plan.dxf)
- Recommended: Should exist for complete output (Phase 2 renders)
- Optional: Nice to have (Phase 3 AI renders)

Usage:
    from genarch.validation import AssetValidator

    validator = AssetValidator(strict=True)
    result = validator.validate(run_path)
    if not result.passed:
        for error in result.errors:
            print(f"Missing: {error}")
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Dict, Optional, Set
import json
import hashlib


@dataclass
class AssetInfo:
    """Information about a single asset."""

    path: str
    exists: bool
    required: bool
    category: str  # "phase1", "phase2", "phase3"
    size_bytes: Optional[int] = None
    hash: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "path": self.path,
            "exists": self.exists,
            "required": self.required,
            "category": self.category,
            "size_bytes": self.size_bytes,
            "hash": self.hash,
        }


@dataclass
class AssetValidationResult:
    """Result of asset validation."""

    passed: bool
    errors: List[str]  # Missing required assets
    warnings: List[str]  # Missing recommended assets
    assets: List[AssetInfo]
    summary: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "passed": self.passed,
            "errors": self.errors,
            "warnings": self.warnings,
            "assets": [a.to_dict() for a in self.assets],
            "summary": self.summary,
        }

    def save(self, path: Path) -> None:
        """Save validation result to JSON file."""
        with open(path, "w") as f:
            json.dump(self.to_dict(), f, indent=2)


class AssetValidator:
    """
    Validates that required assets exist before Phase 4.

    In strict mode, missing required assets cause validation failure.
    In non-strict mode, only errors are logged as warnings.
    """

    # Phase 1 required outputs
    PHASE1_REQUIRED = [
        "plan.json",
        "plan.dxf",
        "run.json",
    ]

    PHASE1_OPTIONAL = [
        "model.glb",
        "model.obj",
        "plan.svg",
    ]

    # Phase 2 recommended outputs (ControlNet renders)
    PHASE2_RECOMMENDED = [
        "phase2/manifest.json",
        "phase2/elevation_N_clay.png",
        "phase2/elevation_N_canny.png",
        "phase2/section_AA_clay.png",
        "phase2/section_AA_canny.png",
        "phase2/hero_perspective_clay.png",
    ]

    PHASE2_OPTIONAL = [
        "phase2/elevation_S_clay.png",
        "phase2/elevation_S_canny.png",
        "phase2/elevation_E_clay.png",
        "phase2/elevation_E_canny.png",
        "phase2/elevation_W_clay.png",
        "phase2/elevation_W_canny.png",
        "phase2/section_BB_clay.png",
        "phase2/section_BB_canny.png",
    ]

    # Phase 3 optional outputs (AI renders)
    PHASE3_OPTIONAL = [
        "phase3/manifest.json",
        "phase3/perspective_render.png",
        "phase3/elevation_N_render.png",
        "phase3/elevation_S_render.png",
        "phase3/section_AA_render.png",
    ]

    def __init__(
        self,
        strict: bool = False,
        require_phase2: bool = False,
        require_phase3: bool = False,
        compute_hashes: bool = True,
        verbose: bool = False,
    ):
        """
        Initialize asset validator.

        Args:
            strict: If True, fail on any missing required asset
            require_phase2: If True, Phase 2 outputs are required
            require_phase3: If True, Phase 3 outputs are required
            compute_hashes: If True, compute SHA256 hashes of existing files
            verbose: Enable verbose logging
        """
        self.strict = strict
        self.require_phase2 = require_phase2
        self.require_phase3 = require_phase3
        self.compute_hashes = compute_hashes
        self.verbose = verbose

    def _hash_file(self, path: Path) -> Optional[str]:
        """Compute SHA256 hash of file."""
        if not self.compute_hashes:
            return None

        try:
            hasher = hashlib.sha256()
            with open(path, "rb") as f:
                for chunk in iter(lambda: f.read(8192), b""):
                    hasher.update(chunk)
            return f"sha256:{hasher.hexdigest()[:16]}"
        except Exception:
            return None

    def _check_asset(
        self,
        run_path: Path,
        relative_path: str,
        required: bool,
        category: str,
    ) -> AssetInfo:
        """Check if a single asset exists."""
        full_path = run_path / relative_path
        exists = full_path.exists()

        size_bytes = None
        file_hash = None

        if exists:
            try:
                size_bytes = full_path.stat().st_size
                file_hash = self._hash_file(full_path)
            except Exception:
                pass

        return AssetInfo(
            path=relative_path,
            exists=exists,
            required=required,
            category=category,
            size_bytes=size_bytes,
            hash=file_hash,
        )

    def validate(self, run_path: Path) -> AssetValidationResult:
        """
        Validate all assets in run folder.

        Args:
            run_path: Path to run folder

        Returns:
            AssetValidationResult with pass/fail status and details
        """
        run_path = Path(run_path)
        assets: List[AssetInfo] = []
        errors: List[str] = []
        warnings: List[str] = []

        if self.verbose:
            print(f"[AssetValidator] Validating: {run_path}")

        # Check Phase 1 required
        for path in self.PHASE1_REQUIRED:
            asset = self._check_asset(run_path, path, required=True, category="phase1")
            assets.append(asset)
            if not asset.exists:
                errors.append(f"Missing required Phase 1 asset: {path}")

        # Check Phase 1 optional
        for path in self.PHASE1_OPTIONAL:
            asset = self._check_asset(run_path, path, required=False, category="phase1")
            assets.append(asset)

        # Check Phase 2 recommended
        phase2_required = self.require_phase2
        for path in self.PHASE2_RECOMMENDED:
            asset = self._check_asset(
                run_path, path, required=phase2_required, category="phase2"
            )
            assets.append(asset)
            if not asset.exists:
                if phase2_required:
                    errors.append(f"Missing required Phase 2 asset: {path}")
                else:
                    warnings.append(f"Missing recommended Phase 2 asset: {path}")

        # Check Phase 2 optional
        for path in self.PHASE2_OPTIONAL:
            asset = self._check_asset(run_path, path, required=False, category="phase2")
            assets.append(asset)

        # Check Phase 3 optional
        phase3_required = self.require_phase3
        for path in self.PHASE3_OPTIONAL:
            asset = self._check_asset(
                run_path, path, required=phase3_required, category="phase3"
            )
            assets.append(asset)
            if not asset.exists and phase3_required:
                errors.append(f"Missing required Phase 3 asset: {path}")

        # Compute summary
        existing = [a for a in assets if a.exists]
        missing_required = [a for a in assets if a.required and not a.exists]
        missing_optional = [a for a in assets if not a.required and not a.exists]

        total_size = sum(a.size_bytes or 0 for a in existing)

        summary = {
            "total_assets": len(assets),
            "existing": len(existing),
            "missing_required": len(missing_required),
            "missing_optional": len(missing_optional),
            "total_size_bytes": total_size,
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "phase1_complete": all(
                a.exists for a in assets if a.category == "phase1" and a.required
            ),
            "phase2_complete": all(
                a.exists for a in assets if a.category == "phase2" and a.required
            ),
            "phase3_complete": all(
                a.exists for a in assets if a.category == "phase3" and a.required
            ),
        }

        # Determine pass/fail
        if self.strict:
            passed = len(errors) == 0
        else:
            # Non-strict: only fail on Phase 1 required assets
            phase1_missing = [
                a
                for a in assets
                if a.category == "phase1" and a.required and not a.exists
            ]
            passed = len(phase1_missing) == 0

        if self.verbose:
            status = "PASSED" if passed else "FAILED"
            print(f"[AssetValidator] {status}: {len(existing)}/{len(assets)} assets present")
            if errors:
                print(f"[AssetValidator] Errors: {len(errors)}")
            if warnings:
                print(f"[AssetValidator] Warnings: {len(warnings)}")

        return AssetValidationResult(
            passed=passed,
            errors=errors,
            warnings=warnings,
            assets=assets,
            summary=summary,
        )

    def validate_for_phase4(self, run_path: Path) -> AssetValidationResult:
        """
        Validate assets specifically for Phase 4 assembly.

        This is a convenience method that checks the minimum requirements
        for Phase 4 to produce a valid A1 sheet.

        Minimum requirements:
        - plan.json (floor plan data)
        - plan.dxf (vector floor plan)

        Recommended for full output:
        - Phase 2 elevation/section renders
        - Phase 3 perspective render
        """
        run_path = Path(run_path)

        # Minimum required for Phase 4
        minimum_required = ["plan.json", "plan.dxf"]

        assets: List[AssetInfo] = []
        errors: List[str] = []
        warnings: List[str] = []

        # Check minimum required
        for path in minimum_required:
            asset = self._check_asset(run_path, path, required=True, category="phase1")
            assets.append(asset)
            if not asset.exists:
                errors.append(f"Missing required: {path}")

        # Check for at least one Phase 2 render (recommended)
        phase2_exists = any(
            (run_path / path).exists() for path in self.PHASE2_RECOMMENDED
        )
        if not phase2_exists:
            warnings.append("No Phase 2 renders found - A1 sheet will have placeholders")

        # Check for Phase 3 perspective (recommended)
        phase3_perspective = any(
            (run_path / path).exists()
            for path in self.PHASE3_OPTIONAL
            if "perspective" in path
        )
        if not phase3_perspective:
            warnings.append("No Phase 3 perspective found - using placeholder")

        # Summary
        summary = {
            "minimum_met": len(errors) == 0,
            "phase2_available": phase2_exists,
            "phase3_available": phase3_perspective,
            "ready_for_phase4": len(errors) == 0,
        }

        passed = len(errors) == 0

        if self.verbose:
            status = "READY" if passed else "NOT READY"
            print(f"[AssetValidator] Phase 4 {status}")

        return AssetValidationResult(
            passed=passed,
            errors=errors,
            warnings=warnings,
            assets=assets,
            summary=summary,
        )


def main():
    """CLI entry point for asset validation."""
    import argparse
    import sys

    parser = argparse.ArgumentParser(description="Validate run folder assets")
    parser.add_argument("--run", "-r", required=True, help="Run folder path")
    parser.add_argument(
        "--strict", action="store_true", help="Fail on any missing required asset"
    )
    parser.add_argument(
        "--require-phase2", action="store_true", help="Require Phase 2 outputs"
    )
    parser.add_argument(
        "--require-phase3", action="store_true", help="Require Phase 3 outputs"
    )
    parser.add_argument(
        "--phase4-check",
        action="store_true",
        help="Check minimum requirements for Phase 4",
    )
    parser.add_argument("--verbose", "-v", action="store_true")
    parser.add_argument(
        "--output", "-o", help="Output report path (default: {run}/asset_report.json)"
    )

    args = parser.parse_args()

    run_path = Path(args.run)
    if not run_path.exists():
        print(f"Error: Run folder not found: {run_path}")
        sys.exit(1)

    validator = AssetValidator(
        strict=args.strict,
        require_phase2=args.require_phase2,
        require_phase3=args.require_phase3,
        verbose=args.verbose,
    )

    if args.phase4_check:
        result = validator.validate_for_phase4(run_path)
    else:
        result = validator.validate(run_path)

    # Save report
    output_path = Path(args.output) if args.output else run_path / "asset_report.json"
    result.save(output_path)
    print(f"Report saved: {output_path}")

    # Print summary
    print(f"\nAssets: {result.summary.get('existing', 0)}/{result.summary.get('total_assets', 0)} present")
    if result.errors:
        print(f"Errors: {len(result.errors)}")
        for err in result.errors:
            print(f"  - {err}")
    if result.warnings:
        print(f"Warnings: {len(result.warnings)}")
        for warn in result.warnings:
            print(f"  - {warn}")

    # Exit with status
    sys.exit(0 if result.passed else 1)


if __name__ == "__main__":
    main()
