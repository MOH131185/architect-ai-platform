"""
genarch.validation - Quality gates CLI

Unified CLI for pipeline validation:
- Drift check: Validates Phase 3 renders match Phase 2 geometry
- Asset validation: Ensures required assets exist before Phase 4

Usage:
    # Check drift for specific view
    python -m genarch.validate --run runs/run_001 --view persp_main --threshold 0.65 --tolerance-px 3

    # Check all drift
    python -m genarch.validate --run runs/run_001 --drift --threshold 0.65

    # Check assets for Phase 4
    python -m genarch.validate --run runs/run_001 --assets --strict

    # Full validation (drift + assets)
    python -m genarch.validate --run runs/run_001 --all
"""

import argparse
import json
import sys
from pathlib import Path

from .drift_checker import DriftChecker, DriftCheckReport
from .asset_validator import AssetValidator, AssetValidationResult


def run_drift_check(
    run_path: Path,
    view: str = None,
    threshold: float = 0.65,
    tolerance_px: int = 3,
    canny_low: int = 50,
    canny_high: int = 150,
    no_debug: bool = False,
    verbose: bool = False,
) -> DriftCheckReport:
    """Run drift validation."""
    output_dir = run_path / "validation"

    checker = DriftChecker(
        threshold=threshold,
        tolerance_px=tolerance_px,
        canny_low=canny_low,
        canny_high=canny_high,
        views=[view] if view else None,
        generate_debug=not no_debug,
        verbose=verbose,
    )

    if view:
        # Single view check
        result = checker.check_view(run_path, view, output_dir)
        report = DriftCheckReport(
            passed=result.passed,
            results=[result],
            summary={
                "total_views": 1,
                "checked": 1 if not result.error else 0,
                "passed": 1 if result.passed else 0,
                "failed": 0 if result.passed else 1,
                "threshold": threshold,
                "tolerance_px": tolerance_px,
            },
        )
    else:
        # All views check
        report = checker.check_all(run_path, output_dir)

    return report


def run_asset_check(
    run_path: Path,
    strict: bool = False,
    require_phase2: bool = False,
    require_phase3: bool = False,
    phase4_check: bool = False,
    verbose: bool = False,
) -> AssetValidationResult:
    """Run asset validation."""
    validator = AssetValidator(
        strict=strict,
        require_phase2=require_phase2,
        require_phase3=require_phase3,
        verbose=verbose,
    )

    if phase4_check:
        return validator.validate_for_phase4(run_path)
    else:
        return validator.validate(run_path)


def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        prog="python -m genarch.validate",
        description="Validation quality gates for genarch pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Check drift for single view
  python -m genarch.validate --run runs/run_001 --view persp_main --threshold 0.65

  # Check all drift
  python -m genarch.validate --run runs/run_001 --drift

  # Check assets for Phase 4
  python -m genarch.validate --run runs/run_001 --assets --phase4-check

  # Full validation (drift + assets)
  python -m genarch.validate --run runs/run_001 --all --strict
""",
    )

    # Required arguments
    parser.add_argument(
        "--run", "-r", required=True, help="Run folder path (e.g., runs/run_001)"
    )

    # Mode selection
    mode_group = parser.add_argument_group("Validation modes")
    mode_group.add_argument(
        "--drift", action="store_true", help="Run drift validation"
    )
    mode_group.add_argument(
        "--assets", action="store_true", help="Run asset validation"
    )
    mode_group.add_argument(
        "--all", action="store_true", help="Run all validations (drift + assets)"
    )

    # Drift options
    drift_group = parser.add_argument_group("Drift options")
    drift_group.add_argument(
        "--view", help="Specific view to check (e.g., persp_main, elevation_N)"
    )
    drift_group.add_argument(
        "--threshold",
        "-t",
        type=float,
        default=0.65,
        help="F1 threshold (default: 0.65)",
    )
    drift_group.add_argument(
        "--tolerance-px",
        type=int,
        default=3,
        help="Dilation tolerance in pixels (default: 3)",
    )
    drift_group.add_argument(
        "--canny-low", type=int, default=50, help="Canny low threshold (default: 50)"
    )
    drift_group.add_argument(
        "--canny-high",
        type=int,
        default=150,
        help="Canny high threshold (default: 150)",
    )
    drift_group.add_argument(
        "--no-debug", action="store_true", help="Skip generating debug overlay images"
    )

    # Asset options
    asset_group = parser.add_argument_group("Asset options")
    asset_group.add_argument(
        "--strict", action="store_true", help="Fail on any missing required asset"
    )
    asset_group.add_argument(
        "--require-phase2", action="store_true", help="Require Phase 2 outputs"
    )
    asset_group.add_argument(
        "--require-phase3", action="store_true", help="Require Phase 3 outputs"
    )
    asset_group.add_argument(
        "--phase4-check",
        action="store_true",
        help="Check minimum requirements for Phase 4",
    )

    # Output options
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    parser.add_argument(
        "--output", "-o", help="Output directory (default: {run}/validation)"
    )

    args = parser.parse_args()

    run_path = Path(args.run)
    if not run_path.exists():
        print(f"Error: Run folder not found: {run_path}")
        sys.exit(1)

    output_dir = Path(args.output) if args.output else run_path / "validation"
    output_dir.mkdir(parents=True, exist_ok=True)

    # Determine which validations to run
    run_drift = args.drift or args.all or args.view
    run_assets = args.assets or args.all

    # If no mode specified and no view, run both
    if not run_drift and not run_assets:
        run_drift = True
        run_assets = True

    results = {}
    all_passed = True

    # Run drift validation
    if run_drift:
        if args.verbose:
            print("=" * 60)
            print("DRIFT VALIDATION")
            print("=" * 60)

        drift_report = run_drift_check(
            run_path=run_path,
            view=args.view,
            threshold=args.threshold,
            tolerance_px=args.tolerance_px,
            canny_low=args.canny_low,
            canny_high=args.canny_high,
            no_debug=args.no_debug,
            verbose=args.verbose,
        )

        # Save drift report
        drift_report_path = output_dir / "drift_report.json"
        drift_report.save(drift_report_path)

        results["drift"] = {
            "passed": drift_report.passed,
            "report_path": str(drift_report_path),
            "summary": drift_report.summary,
        }

        if not drift_report.passed:
            all_passed = False

        print(f"\nDrift validation: {'PASSED' if drift_report.passed else 'FAILED'}")
        print(f"  Report: {drift_report_path}")
        if drift_report.summary.get("failed_views"):
            print(f"  Failed views: {drift_report.summary['failed_views']}")

    # Run asset validation
    if run_assets:
        if args.verbose:
            print("\n" + "=" * 60)
            print("ASSET VALIDATION")
            print("=" * 60)

        asset_result = run_asset_check(
            run_path=run_path,
            strict=args.strict,
            require_phase2=args.require_phase2,
            require_phase3=args.require_phase3,
            phase4_check=args.phase4_check,
            verbose=args.verbose,
        )

        # Save asset report
        asset_report_path = output_dir / "asset_report.json"
        asset_result.save(asset_report_path)

        results["assets"] = {
            "passed": asset_result.passed,
            "report_path": str(asset_report_path),
            "summary": asset_result.summary,
            "errors": asset_result.errors,
            "warnings": asset_result.warnings,
        }

        if not asset_result.passed:
            all_passed = False

        print(f"\nAsset validation: {'PASSED' if asset_result.passed else 'FAILED'}")
        print(f"  Report: {asset_report_path}")
        if asset_result.errors:
            for err in asset_result.errors:
                print(f"  ERROR: {err}")
        if asset_result.warnings and args.verbose:
            for warn in asset_result.warnings:
                print(f"  WARN: {warn}")

    # Write combined validation report
    validation_report = {
        "passed": all_passed,
        "run_path": str(run_path),
        "validations": results,
    }
    combined_path = output_dir / "validation_report.json"
    with open(combined_path, "w") as f:
        json.dump(validation_report, f, indent=2)

    # Final summary
    print("\n" + "=" * 60)
    print(f"VALIDATION {'PASSED' if all_passed else 'FAILED'}")
    print(f"Combined report: {combined_path}")
    print("=" * 60)

    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
