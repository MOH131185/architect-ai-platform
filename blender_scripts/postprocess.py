#!/usr/bin/env python3
"""
Postprocess ControlNet renders to generate edge maps.

Phase 2: Camera Setup + ControlNet Snapshots

Usage:
    python postprocess.py --input phase2_dir/ --output phase2_dir/

Generates:
- {camera}_canny.png from {camera}_clay.png
- {camera}_mlsd.png (optional line segment detection)

Validates:
- All output sizes match
- Depth and mask are non-empty
"""

import argparse
import json
import os
import sys
from pathlib import Path

try:
    import cv2
    import numpy as np
except ImportError:
    print("ERROR: OpenCV and NumPy required. Install with: pip install opencv-python numpy")
    sys.exit(1)


# ========== EDGE DETECTION ==========

def generate_canny_edges(clay_path, output_path, low_threshold=50, high_threshold=150):
    """
    Generate Canny edge detection from clay render.

    Args:
        clay_path: Path to clay.png
        output_path: Path to write canny.png
        low_threshold: Canny low threshold
        high_threshold: Canny high threshold

    Returns:
        True if successful, False otherwise
    """
    img = cv2.imread(clay_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        print(f"ERROR: Could not read {clay_path}")
        return False

    # Apply Gaussian blur to reduce noise
    blurred = cv2.GaussianBlur(img, (5, 5), 1.4)

    # Canny edge detection
    edges = cv2.Canny(blurred, low_threshold, high_threshold)

    # Invert (white background, black edges - ControlNet convention)
    edges = 255 - edges

    cv2.imwrite(output_path, edges)
    return True


def generate_mlsd_edges(clay_path, output_path, length_threshold=10, distance_threshold=20):
    """
    Generate MLSD (Mobile Line Segment Detection) style edges.

    Uses Hough Line Transform as a simpler alternative to full MLSD.

    Args:
        clay_path: Path to clay.png
        output_path: Path to write mlsd.png
        length_threshold: Minimum line length
        distance_threshold: Maximum gap between line segments

    Returns:
        True if successful, False otherwise
    """
    img = cv2.imread(clay_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        print(f"ERROR: Could not read {clay_path}")
        return False

    # Edge detection first
    edges = cv2.Canny(img, 50, 150, apertureSize=3)

    # Probabilistic Hough Line Transform
    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi / 180,
        threshold=50,
        minLineLength=length_threshold,
        maxLineGap=distance_threshold
    )

    # Draw lines on white background (ControlNet convention)
    output = np.ones_like(img) * 255
    if lines is not None:
        for line in lines:
            x1, y1, x2, y2 = line[0]
            cv2.line(output, (x1, y1), (x2, y2), 0, 2)

    cv2.imwrite(output_path, output)
    return True


# ========== VALIDATION ==========

def validate_output_sizes(output_dir, expected_width, expected_height):
    """
    Validate all PNG files have consistent dimensions.

    Args:
        output_dir: Directory containing PNG files
        expected_width: Expected image width
        expected_height: Expected image height

    Returns:
        List of error messages (empty if all valid)
    """
    errors = []

    for png_file in Path(output_dir).glob("*.png"):
        img = cv2.imread(str(png_file))
        if img is None:
            errors.append(f"Could not read: {png_file.name}")
            continue

        h, w = img.shape[:2]
        if w != expected_width or h != expected_height:
            errors.append(f"Size mismatch: {png_file.name} is {w}x{h}, expected {expected_width}x{expected_height}")

    return errors


def validate_depth_mask_non_empty(output_dir):
    """
    Validate depth and mask renders are non-empty.

    Args:
        output_dir: Directory containing PNG files

    Returns:
        List of error messages (empty if all valid)
    """
    errors = []

    for pattern in ["*_depth.png", "*_mask.png"]:
        for png_file in Path(output_dir).glob(pattern):
            img = cv2.imread(str(png_file), cv2.IMREAD_GRAYSCALE)
            if img is None:
                errors.append(f"Could not read: {png_file.name}")
                continue

            # Check for all-black or all-white
            unique_values = np.unique(img)
            if len(unique_values) <= 1:
                errors.append(f"Empty render (single value {unique_values[0]}): {png_file.name}")
            elif "_depth" in str(png_file) and len(unique_values) <= 2:
                # Depth should have gradient, not just binary
                val_range = np.max(unique_values) - np.min(unique_values)
                if val_range < 10:
                    errors.append(f"Nearly flat depth (range={val_range}): {png_file.name}")

    return errors


def validate_clay_has_content(output_dir):
    """
    Validate clay renders have actual geometry content.

    Args:
        output_dir: Directory containing PNG files

    Returns:
        List of error messages (empty if all valid)
    """
    errors = []

    for png_file in Path(output_dir).glob("*_clay.png"):
        img = cv2.imread(str(png_file), cv2.IMREAD_GRAYSCALE)
        if img is None:
            errors.append(f"Could not read: {png_file.name}")
            continue

        # Check for content (not all same value)
        std_dev = np.std(img)
        if std_dev < 1.0:
            errors.append(f"No content in clay render (std={std_dev:.2f}): {png_file.name}")

    return errors


# ========== MAIN ==========

def main():
    parser = argparse.ArgumentParser(
        description='Postprocess ControlNet renders to generate edge maps'
    )
    parser.add_argument(
        '--input', '-i',
        required=True,
        help='Input directory with rendered PNG files'
    )
    parser.add_argument(
        '--output', '-o',
        default=None,
        help='Output directory (default: same as input)'
    )
    parser.add_argument(
        '--skip-mlsd',
        action='store_true',
        help='Skip MLSD edge generation (faster)'
    )
    parser.add_argument(
        '--validate-only',
        action='store_true',
        help='Only validate outputs, no edge processing'
    )
    parser.add_argument(
        '--canny-low',
        type=int,
        default=50,
        help='Canny low threshold (default: 50)'
    )
    parser.add_argument(
        '--canny-high',
        type=int,
        default=150,
        help='Canny high threshold (default: 150)'
    )
    args = parser.parse_args()

    input_dir = Path(args.input)
    output_dir = Path(args.output) if args.output else input_dir

    if not input_dir.exists():
        print(f"ERROR: Input directory does not exist: {input_dir}")
        return 1

    output_dir.mkdir(parents=True, exist_ok=True)

    # Load manifest if exists to get expected resolution
    manifest_path = input_dir / 'manifest.json'
    expected_width = 2048
    expected_height = 2048

    if manifest_path.exists():
        with open(manifest_path) as f:
            manifest = json.load(f)
        resolution = manifest.get('resolution', {})
        expected_width = resolution.get('width', 2048)
        expected_height = resolution.get('height', 2048)
        print(f"Loaded manifest: resolution {expected_width}x{expected_height}")
    else:
        print(f"No manifest found, assuming {expected_width}x{expected_height} resolution")

    # Validation
    print("\nValidating outputs...")
    all_errors = []

    size_errors = validate_output_sizes(input_dir, expected_width, expected_height)
    all_errors.extend(size_errors)

    depth_mask_errors = validate_depth_mask_non_empty(input_dir)
    all_errors.extend(depth_mask_errors)

    clay_errors = validate_clay_has_content(input_dir)
    all_errors.extend(clay_errors)

    if all_errors:
        print("Validation errors:")
        for err in all_errors:
            print(f"  - {err}")
    else:
        print("Validation passed!")

    if args.validate_only:
        return 1 if all_errors else 0

    # Process clay renders to generate edge maps
    print("\nGenerating edge maps...")
    clay_files = list(input_dir.glob("*_clay.png"))

    if not clay_files:
        print("WARNING: No clay renders found to process")
        return 0

    canny_count = 0
    mlsd_count = 0

    for clay_path in clay_files:
        camera_name = clay_path.stem.replace("_clay", "")

        # Canny edges
        canny_path = output_dir / f"{camera_name}_canny.png"
        if generate_canny_edges(str(clay_path), str(canny_path), args.canny_low, args.canny_high):
            print(f"  Generated: {canny_path.name}")
            canny_count += 1

        # MLSD edges (optional)
        if not args.skip_mlsd:
            mlsd_path = output_dir / f"{camera_name}_mlsd.png"
            if generate_mlsd_edges(str(clay_path), str(mlsd_path)):
                print(f"  Generated: {mlsd_path.name}")
                mlsd_count += 1

    # Update manifest with postprocess info
    if manifest_path.exists():
        with open(manifest_path) as f:
            manifest = json.load(f)

        manifest['postprocess'] = {
            'canny_generated': canny_count,
            'mlsd_generated': mlsd_count,
            'canny_params': {
                'low_threshold': args.canny_low,
                'high_threshold': args.canny_high,
            },
            'validation_passed': len(all_errors) == 0,
            'validation_errors': all_errors,
        }

        with open(manifest_path, 'w') as f:
            json.dump(manifest, f, indent=2)

        print(f"\nUpdated manifest: {manifest_path}")

    print(f"\nPostprocessing complete!")
    print(f"  Canny edges: {canny_count}")
    print(f"  MLSD edges: {mlsd_count}")
    print(f"  Validation: {'PASSED' if len(all_errors) == 0 else f'FAILED ({len(all_errors)} errors)'}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
