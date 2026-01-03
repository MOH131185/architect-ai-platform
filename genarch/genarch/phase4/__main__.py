#!/usr/bin/env python3
"""
A1 Sheet Assembler CLI

Composes a single print-ready A1 PDF from Phase 1-3 outputs.

Usage:
    python -m genarch.phase4 --run runs/run_001 --out output.pdf

Examples:
    # Basic usage with auto-scale
    python -m genarch.phase4 --run runs/run_001

    # With explicit scale and metadata
    python -m genarch.phase4 --run runs/run_001 \\
        --scale 1:100 \\
        --title "Modern Villa" \\
        --client "John Smith" \\
        --project-number "P-2025-001"

    # Strict mode (error if assets missing)
    python -m genarch.phase4 --run runs/run_001 --strict

    # Portrait orientation
    python -m genarch.phase4 --run runs/run_001 --orientation portrait
"""

import argparse
import sys
from pathlib import Path

from .assemble import A1SheetAssembler


def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Assemble A1 architectural sheet from Phase 1-3 outputs",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python -m genarch.phase4 --run runs/run_001
  python -m genarch.phase4 --run runs/run_001 --scale 1:100 --title "Villa Design"
  python -m genarch.phase4 --run runs/run_001 --strict --verbose
        """,
    )

    # Required arguments
    parser.add_argument(
        "--run", "-r",
        required=True,
        type=Path,
        help="Path to run folder containing Phase 1-3 outputs",
    )

    # Output options
    parser.add_argument(
        "--out", "-o",
        type=Path,
        default=None,
        help="Output PDF path (default: {run}/phase4/A1_sheet.pdf)",
    )
    parser.add_argument(
        "--format",
        default="A1",
        choices=["A1"],
        help="Paper format (default: A1)",
    )
    parser.add_argument(
        "--orientation",
        default="landscape",
        choices=["landscape", "portrait"],
        help="Page orientation (default: landscape)",
    )
    parser.add_argument(
        "--template",
        default="standard",
        help="Layout template (default: standard)",
    )

    # Scale options
    parser.add_argument(
        "--scale",
        default=None,
        help="Explicit scale (1:50, 1:75, 1:100, 1:150, 1:200) or auto-fit",
    )

    # Title block options
    parser.add_argument(
        "--title",
        default=None,
        help="Project title for title block (default: from run.json)",
    )
    parser.add_argument(
        "--client",
        default="",
        help="Client name for title block",
    )
    parser.add_argument(
        "--project-number",
        default="",
        help="Project number for title block",
    )

    # Quality options
    parser.add_argument(
        "--dpi",
        type=int,
        default=300,
        help="DPI threshold for raster quality warnings (default: 300)",
    )

    # Mode options
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Error if any required asset is missing",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose logging",
    )

    args = parser.parse_args()

    # Validate run path
    if not args.run.exists():
        print(f"Error: Run folder not found: {args.run}")
        sys.exit(1)

    if not args.run.is_dir():
        print(f"Error: Run path is not a directory: {args.run}")
        sys.exit(1)

    # Determine output path
    output_path = args.out
    if output_path is None:
        output_path = args.run / "phase4" / "A1_sheet.pdf"

    # Create output directory
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Check for required dependencies
    try:
        import reportlab
    except ImportError:
        print("Error: reportlab is required. Install with: pip install reportlab")
        sys.exit(1)

    try:
        from PIL import Image
    except ImportError:
        print("Error: Pillow is required. Install with: pip install Pillow")
        sys.exit(1)

    # Create assembler
    assembler = A1SheetAssembler(
        run_path=args.run,
        output_path=output_path,
        orientation=args.orientation,
        template=args.template,
        scale=args.scale,
        title=args.title,
        client=args.client,
        project_number=args.project_number,
        dpi_threshold=args.dpi,
        strict=args.strict,
        verbose=args.verbose,
    )

    # Run assembly
    try:
        success = assembler.assemble()
    except Exception as e:
        print(f"Error during assembly: {e}")
        if args.verbose:
            import traceback
            traceback.print_exc()
        sys.exit(1)

    # Exit code
    if success:
        print(f"A1 sheet generated: {output_path}")
        sys.exit(0)
    else:
        print("Assembly failed. Check warnings above.")
        sys.exit(1)


if __name__ == "__main__":
    main()
