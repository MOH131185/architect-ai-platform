#!/usr/bin/env python3
"""
genarch Pipeline CLI

End-to-end architectural generation from prompt to print-ready PDF.

Usage:
    python -m genarch.pipeline --prompt "modern minimalist villa 200sqm" --out runs/run_001

Examples:
    # Generate from natural language prompt
    python -m genarch.pipeline --prompt "3-bedroom house with open plan living 180sqm" --out runs/villa

    # Generate from constraints file
    python -m genarch.pipeline --constraints constraints.json --out runs/custom

    # Force re-run all phases (ignore cache)
    python -m genarch.pipeline --prompt "office 300sqm" --out runs/office --force

    # Skip Blender rendering (faster, no Phase 2)
    python -m genarch.pipeline --prompt "clinic 250sqm" --out runs/clinic --skip-phase2

    # Verbose output with custom seed
    python -m genarch.pipeline --prompt "villa 200sqm" --out runs/villa --seed 123 -v
"""

import argparse
import sys
from pathlib import Path

from .runner import PipelineRunner, PipelineConfig


def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        prog="genarch.pipeline",
        description="End-to-end architectural generation from prompt to A1 PDF",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Phases:
  1. Floor plan + 3D mesh generation (genarch)
  2. Blender ControlNet snapshot rendering
  3. AI perspective generation (future - skipped by default)
  4. A1 sheet PDF assembly (genarch.phase4)

Examples:
  python -m genarch.pipeline --prompt "modern villa 200sqm" --out runs/villa_001
  python -m genarch.pipeline --constraints villa.json --out runs/villa_001 --force
        """,
    )

    # Input options (mutually exclusive)
    input_group = parser.add_mutually_exclusive_group(required=True)
    input_group.add_argument(
        "--prompt", "-p",
        type=str,
        help="Natural language description (e.g., 'modern villa 200sqm')",
    )
    input_group.add_argument(
        "--constraints", "-c",
        type=Path,
        help="Path to constraints JSON file",
    )

    # Output options
    parser.add_argument(
        "--out", "-o",
        type=Path,
        required=True,
        help="Output run folder path",
    )

    # Generation parameters
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

    # Phase control
    parser.add_argument(
        "--skip-phase2",
        action="store_true",
        help="Skip Blender rendering (faster, no ControlNet snapshots)",
    )
    parser.add_argument(
        "--skip-phase4",
        action="store_true",
        help="Skip A1 PDF assembly",
    )
    parser.add_argument(
        "--phase3",
        action="store_true",
        dest="run_phase3",
        help="Enable Phase 3 AI perspective (experimental)",
    )

    # Caching
    parser.add_argument(
        "--force", "-f",
        action="store_true",
        help="Force re-run all phases (ignore cache)",
    )
    parser.add_argument(
        "--no-cache",
        action="store_true",
        help="Disable caching entirely",
    )

    # Execution options
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose output",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Stop on any error (don't continue with warnings)",
    )

    # External tools
    parser.add_argument(
        "--blender-path",
        type=str,
        default=None,
        help="Path to Blender executable (default: 'blender' or BLENDER_PATH env)",
    )

    args = parser.parse_args()

    # Build config
    config = PipelineConfig(
        prompt=args.prompt,
        constraints_path=args.constraints,
        output_path=args.out,
        seed=args.seed,
        wall_height=args.wall_height,
        skip_phase2=args.skip_phase2,
        skip_phase3=not args.run_phase3,
        skip_phase4=args.skip_phase4,
        force=args.force,
        cache_enabled=not args.no_cache,
        verbose=args.verbose,
        strict=args.strict,
        blender_path=args.blender_path,
    )

    # Print banner
    if args.verbose:
        print("=" * 60)
        print("  genarch Pipeline - Architectural Generation")
        print("=" * 60)
        print(f"  Output: {args.out}")
        print(f"  Seed: {args.seed}")
        if args.prompt:
            print(f"  Prompt: {args.prompt[:50]}{'...' if len(args.prompt) > 50 else ''}")
        if args.constraints:
            print(f"  Constraints: {args.constraints}")
        print(f"  Phases: 1 {'2' if not args.skip_phase2 else '-'} {'3' if args.run_phase3 else '-'} {'4' if not args.skip_phase4 else '-'}")
        print("=" * 60)
        print()

    # Run pipeline
    runner = PipelineRunner(config)
    success = runner.run()

    # Print summary
    print()
    print("=" * 60)
    if success:
        print("  Pipeline completed successfully!")
        print(f"  Output folder: {args.out}")

        # List key outputs
        pdf_path = args.out / "phase4" / "A1_sheet.pdf"
        if pdf_path.exists():
            print(f"  A1 Sheet: {pdf_path}")

        plan_path = args.out / "plan.json"
        if plan_path.exists():
            print(f"  Floor Plan: {plan_path}")

    else:
        print("  Pipeline completed with errors")
        if runner.results["errors"]:
            print("  Errors:")
            for err in runner.results["errors"]:
                print(f"    - [{err.get('phase', '?')}] {err['message']}")

    print("=" * 60)

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
