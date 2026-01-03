"""
Asset Loading and Management

Handles image loading, DPI calculation, file hashing, and asset resolution
for A1 sheet assembly.
"""

import hashlib
from pathlib import Path
from typing import Optional, Tuple, List, Dict, Any

try:
    from PIL import Image
except ImportError:
    Image = None

# Asset resolution patterns for each panel type
PERSPECTIVE_PATTERNS = [
    "phase3/views/perspective/perspective_final.png",
    "phase3/perspective_final.png",
    "phase2/hero_perspective_canny.png",  # Fallback to Phase 2
    "phase2/hero_perspective_clay.png",
]

NORTH_ELEV_PATTERNS = [
    "phase2/views/north_elev/lineart.png",
    "phase2/views/north_elev/clay.png",
    "phase2/elevation_N_canny.png",  # Current Phase 2 output
    "phase2/elevation_N_clay.png",
]

SECTION_PATTERNS = [
    "phase2/views/section_a/lineart.png",
    "phase2/views/section_a/clay.png",
    "phase2/section_AA_canny.png",  # Current Phase 2 output
    "phase2/section_AA_clay.png",
]

FLOOR_PLAN_PATTERNS = [
    "plan.svg",
    "plan.dxf",
]


def load_image(path: Path) -> Optional[Tuple["Image.Image", int, int]]:
    """
    Load an image from disk.

    Args:
        path: Path to image file

    Returns:
        Tuple of (PIL.Image, width_px, height_px) or None if load fails
    """
    if Image is None:
        raise ImportError("Pillow is required: pip install Pillow")

    try:
        img = Image.open(path)
        width, height = img.size
        return (img, width, height)
    except Exception as e:
        print(f"Warning: Could not load image {path}: {e}")
        return None


def compute_effective_dpi(width_px: int, physical_width_mm: float) -> float:
    """
    Calculate effective DPI when image is printed at specified physical size.

    Args:
        width_px: Image width in pixels
        physical_width_mm: Physical width when printed in mm

    Returns:
        Effective DPI
    """
    physical_inches = physical_width_mm / 25.4
    return width_px / physical_inches


def check_dpi(
    width_px: int,
    physical_width_mm: float,
    threshold: float = 200,
) -> Tuple[float, bool]:
    """
    Check if effective DPI is below threshold.

    Args:
        width_px: Image width in pixels
        physical_width_mm: Physical width when printed in mm
        threshold: Minimum acceptable DPI (default: 200)

    Returns:
        Tuple of (effective_dpi, is_below_threshold)
    """
    effective_dpi = compute_effective_dpi(width_px, physical_width_mm)
    return effective_dpi, effective_dpi < threshold


def hash_file(path: Path, algorithm: str = "sha256") -> str:
    """
    Compute hash of a file.

    Args:
        path: Path to file
        algorithm: Hash algorithm ('sha256', 'md5', etc.)

    Returns:
        Hash string prefixed with algorithm (e.g., 'sha256:abc123...')
    """
    hasher = hashlib.new(algorithm)
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            hasher.update(chunk)
    return f"{algorithm}:{hasher.hexdigest()}"


def find_asset(run_path: Path, patterns: List[str]) -> Optional[Path]:
    """
    Find first matching asset from a list of patterns.

    Args:
        run_path: Base run folder path
        patterns: List of relative path patterns to try

    Returns:
        Path to first existing file, or None if none found
    """
    for pattern in patterns:
        asset_path = run_path / pattern
        if asset_path.exists():
            return asset_path
    return None


def find_perspective_asset(run_path: Path) -> Optional[Path]:
    """Find perspective render asset."""
    return find_asset(run_path, PERSPECTIVE_PATTERNS)


def find_north_elevation_asset(run_path: Path) -> Optional[Path]:
    """Find north elevation asset."""
    return find_asset(run_path, NORTH_ELEV_PATTERNS)


def find_section_asset(run_path: Path) -> Optional[Path]:
    """Find section asset."""
    return find_asset(run_path, SECTION_PATTERNS)


def find_floor_plan_asset(run_path: Path) -> Optional[Path]:
    """Find floor plan asset (SVG or DXF)."""
    return find_asset(run_path, FLOOR_PLAN_PATTERNS)


def get_image_info(path: Path) -> Dict[str, Any]:
    """
    Get image metadata.

    Args:
        path: Path to image file

    Returns:
        Dict with width, height, format, mode, and hash
    """
    result = load_image(path)
    if result is None:
        return {"error": f"Could not load {path}"}

    img, width, height = result
    return {
        "path": str(path),
        "width_px": width,
        "height_px": height,
        "format": img.format,
        "mode": img.mode,
        "hash": hash_file(path),
    }


def prepare_image_for_pdf(
    img: "Image.Image",
    max_size: Optional[Tuple[int, int]] = None,
) -> "Image.Image":
    """
    Prepare image for PDF embedding.

    - Converts RGBA to RGB with white background
    - Optionally resizes to max_size

    Args:
        img: PIL Image
        max_size: Optional max (width, height) to resize to

    Returns:
        Prepared PIL Image
    """
    if Image is None:
        raise ImportError("Pillow is required: pip install Pillow")

    # Convert RGBA to RGB with white background
    if img.mode == "RGBA":
        background = Image.new("RGB", img.size, (255, 255, 255))
        background.paste(img, mask=img.split()[3])
        img = background
    elif img.mode != "RGB":
        img = img.convert("RGB")

    # Resize if needed
    if max_size:
        img.thumbnail(max_size, Image.Resampling.LANCZOS)

    return img
