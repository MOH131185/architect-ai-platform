"""
Drift Checker - Validates Phase 3 renders match Phase 2 geometry.

This module overlays Phase 2 edge maps (canny/lineart) onto Phase 3 AI renders
and computes an alignment score using precision/recall/F1 metrics.

Algorithm:
1. Load Phase 2 canny/lineart edge image (binary edges)
2. Load Phase 3 AI-generated render
3. Extract edges from Phase 3 render using Canny edge detection
4. Apply mask (if available) to both edge maps
5. Compute tolerant match using dilation:
   - precision = sum(render_edges & geom_dil) / sum(render_edges)
   - recall = sum(geom_edges & rend_dil) / sum(geom_edges)
   - f1 = 2 * precision * recall / (precision + recall)
6. Fail if F1 < threshold

Usage:
    from genarch.validation import DriftChecker

    checker = DriftChecker(threshold=0.65, tolerance_px=3)
    result = checker.check(
        phase2_edge_path="phase2/elevation_N_canny.png",
        phase3_render_path="phase3/elevation_N_render.png"
    )
    if not result.passed:
        print(f"Drift detected: F1={result.f1:.2%} (threshold: {result.threshold:.2%})")
"""

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Tuple, Dict, Any
import hashlib
import json


@dataclass
class DriftMetrics:
    """Detailed metrics from drift computation."""

    precision: float = 0.0
    recall: float = 0.0
    f1: float = 0.0
    geom_edge_count: int = 0
    render_edge_count: int = 0
    matched_geom: int = 0
    matched_render: int = 0


@dataclass
class DriftResult:
    """Result of drift validation for a single view."""

    view_name: str
    passed: bool
    f1: float  # F1 score (0.0 = no match, 1.0 = perfect match)
    threshold: float
    tolerance_px: int
    phase2_path: Optional[str] = None
    phase3_path: Optional[str] = None
    mask_path: Optional[str] = None
    metrics: Optional[DriftMetrics] = None
    details: dict = field(default_factory=dict)
    error: Optional[str] = None
    output_files: Dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "view_name": self.view_name,
            "passed": self.passed,
            "f1": self.f1,
            "threshold": self.threshold,
            "tolerance_px": self.tolerance_px,
            "phase2_path": self.phase2_path,
            "phase3_path": self.phase3_path,
            "mask_path": self.mask_path,
            "metrics": {
                "precision": self.metrics.precision if self.metrics else 0.0,
                "recall": self.metrics.recall if self.metrics else 0.0,
                "f1": self.metrics.f1 if self.metrics else 0.0,
                "geom_edge_count": self.metrics.geom_edge_count if self.metrics else 0,
                "render_edge_count": (
                    self.metrics.render_edge_count if self.metrics else 0
                ),
            },
            "details": self.details,
            "error": self.error,
            "output_files": self.output_files,
        }


@dataclass
class DriftCheckReport:
    """Complete drift check report for all views."""

    passed: bool
    results: List[DriftResult]
    summary: dict = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_dict(self) -> dict:
        return {
            "passed": self.passed,
            "timestamp": self.timestamp,
            "results": [r.to_dict() for r in self.results],
            "summary": self.summary,
        }

    def save(self, path: Path) -> None:
        """Save report to JSON file."""
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump(self.to_dict(), f, indent=2)


class DriftChecker:
    """
    Validates that Phase 3 AI renders match Phase 2 geometry edges.

    Uses precision/recall/F1 metrics with dilation tolerance to allow
    for small pixel-level misalignments while detecting structural drift.
    """

    # Default F1 threshold (0.65 = 65% edge alignment required)
    DEFAULT_THRESHOLD = 0.65

    # Default dilation tolerance in pixels
    DEFAULT_TOLERANCE_PX = 3

    # Default Canny edge detection thresholds
    DEFAULT_CANNY_LOW = 50
    DEFAULT_CANNY_HIGH = 150

    # View name to Phase 2 edge file patterns
    VIEW_PATTERNS = {
        "elevation_N": [
            "phase2/views/north_elev/canny.png",
            "phase2/views/north_elev/lineart.png",
            "phase2/elevation_N_canny.png",
            "phase2/elevation_N_lineart.png",
        ],
        "elevation_S": [
            "phase2/views/south_elev/canny.png",
            "phase2/views/south_elev/lineart.png",
            "phase2/elevation_S_canny.png",
            "phase2/elevation_S_lineart.png",
        ],
        "elevation_E": [
            "phase2/views/east_elev/canny.png",
            "phase2/views/east_elev/lineart.png",
            "phase2/elevation_E_canny.png",
            "phase2/elevation_E_lineart.png",
        ],
        "elevation_W": [
            "phase2/views/west_elev/canny.png",
            "phase2/views/west_elev/lineart.png",
            "phase2/elevation_W_canny.png",
            "phase2/elevation_W_lineart.png",
        ],
        "section_AA": [
            "phase2/views/section_a/canny.png",
            "phase2/views/section_a/lineart.png",
            "phase2/section_AA_canny.png",
            "phase2/section_AA_lineart.png",
        ],
        "section_BB": [
            "phase2/views/section_b/canny.png",
            "phase2/views/section_b/lineart.png",
            "phase2/section_BB_canny.png",
            "phase2/section_BB_lineart.png",
        ],
        "perspective": [
            "phase2/views/perspective/canny.png",
            "phase2/views/perspective/lineart.png",
            "phase2/hero_perspective_canny.png",
            "phase2/hero_perspective_lineart.png",
        ],
        "persp_main": [
            "phase2/views/perspective/canny.png",
            "phase2/views/perspective/lineart.png",
            "phase2/hero_perspective_canny.png",
            "phase2/hero_perspective_lineart.png",
        ],
    }

    # Mask file patterns (optional)
    MASK_PATTERNS = {
        "elevation_N": [
            "phase2/views/north_elev/mask.png",
            "phase2/elevation_N_mask.png",
        ],
        "elevation_S": [
            "phase2/views/south_elev/mask.png",
            "phase2/elevation_S_mask.png",
        ],
        "elevation_E": [
            "phase2/views/east_elev/mask.png",
            "phase2/elevation_E_mask.png",
        ],
        "elevation_W": [
            "phase2/views/west_elev/mask.png",
            "phase2/elevation_W_mask.png",
        ],
        "section_AA": [
            "phase2/views/section_a/mask.png",
            "phase2/section_AA_mask.png",
        ],
        "section_BB": [
            "phase2/views/section_b/mask.png",
            "phase2/section_BB_mask.png",
        ],
        "perspective": [
            "phase2/views/perspective/mask.png",
            "phase2/hero_perspective_mask.png",
        ],
        "persp_main": [
            "phase2/views/perspective/mask.png",
            "phase2/hero_perspective_mask.png",
        ],
    }

    # Phase 3 render patterns
    PHASE3_PATTERNS = {
        "elevation_N": [
            "phase3/views/north_elev/perspective_final.png",
            "phase3/views/north_elev/render.png",
            "phase3/elevation_N_render.png",
            "phase3/elevation_N.png",
        ],
        "elevation_S": [
            "phase3/views/south_elev/perspective_final.png",
            "phase3/views/south_elev/render.png",
            "phase3/elevation_S_render.png",
            "phase3/elevation_S.png",
        ],
        "elevation_E": [
            "phase3/views/east_elev/perspective_final.png",
            "phase3/views/east_elev/render.png",
            "phase3/elevation_E_render.png",
            "phase3/elevation_E.png",
        ],
        "elevation_W": [
            "phase3/views/west_elev/perspective_final.png",
            "phase3/views/west_elev/render.png",
            "phase3/elevation_W_render.png",
            "phase3/elevation_W.png",
        ],
        "section_AA": [
            "phase3/views/section_a/perspective_final.png",
            "phase3/views/section_a/render.png",
            "phase3/section_AA_render.png",
            "phase3/section_AA.png",
        ],
        "section_BB": [
            "phase3/views/section_b/perspective_final.png",
            "phase3/views/section_b/render.png",
            "phase3/section_BB_render.png",
            "phase3/section_BB.png",
        ],
        "perspective": [
            "phase3/views/perspective/perspective_final.png",
            "phase3/views/perspective/render.png",
            "phase3/perspective_render.png",
            "phase3/perspective.png",
        ],
        "persp_main": [
            "phase3/views/perspective/perspective_final.png",
            "phase3/views/perspective/render.png",
            "phase3/perspective_render.png",
            "phase3/perspective.png",
        ],
    }

    def __init__(
        self,
        threshold: float = DEFAULT_THRESHOLD,
        tolerance_px: int = DEFAULT_TOLERANCE_PX,
        canny_low: int = DEFAULT_CANNY_LOW,
        canny_high: int = DEFAULT_CANNY_HIGH,
        views: Optional[List[str]] = None,
        generate_debug: bool = True,
        verbose: bool = False,
    ):
        """
        Initialize drift checker.

        Args:
            threshold: Minimum F1 score required to pass (0.0-1.0). Default 0.65
            tolerance_px: Dilation radius in pixels for tolerant matching. Default 3
            canny_low: Low threshold for Canny edge detection. Default 50
            canny_high: High threshold for Canny edge detection. Default 150
            views: List of view names to check. Default: all views
            generate_debug: Generate debug overlay images. Default True
            verbose: Enable verbose logging
        """
        self.threshold = threshold
        self.tolerance_px = tolerance_px
        self.canny_low = canny_low
        self.canny_high = canny_high
        self.views = views or list(self.VIEW_PATTERNS.keys())
        self.generate_debug = generate_debug
        self.verbose = verbose
        self._numpy_available = None
        self._cv2_available = None

    def _check_dependencies(self) -> Tuple[bool, Optional[str]]:
        """Check if required dependencies are available."""
        try:
            import numpy as np

            self._numpy_available = True
        except ImportError:
            self._numpy_available = False
            return False, "numpy is required: pip install numpy"

        try:
            import cv2

            self._cv2_available = True
        except ImportError:
            self._cv2_available = False
            return False, "opencv-python is required: pip install opencv-python"

        return True, None

    def _find_file(self, run_path: Path, patterns: List[str]) -> Optional[Path]:
        """Find first existing file from pattern list."""
        for pattern in patterns:
            path = run_path / pattern
            if path.exists():
                return path
        return None

    def _hash_file(self, path: Path) -> str:
        """Compute SHA256 hash of file (first 16 chars)."""
        hasher = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                hasher.update(chunk)
        return f"sha256:{hasher.hexdigest()[:16]}"

    def _load_edge_image(self, path: Path) -> "np.ndarray":
        """Load edge image as binary mask."""
        import cv2
        import numpy as np

        img = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
        if img is None:
            raise ValueError(f"Failed to load image: {path}")

        # Threshold to binary
        _, binary = cv2.threshold(img, 127, 255, cv2.THRESH_BINARY)
        return binary

    def _load_mask(self, path: Path) -> Optional["np.ndarray"]:
        """Load mask image (white = foreground, black = background)."""
        import cv2

        img = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
        if img is None:
            return None

        # Threshold to binary
        _, binary = cv2.threshold(img, 127, 255, cv2.THRESH_BINARY)
        return binary

    def _extract_edges(
        self, path: Path, use_bilateral: bool = True
    ) -> "np.ndarray":
        """Extract edges from render image using Canny."""
        import cv2
        import numpy as np

        img = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
        if img is None:
            raise ValueError(f"Failed to load image: {path}")

        # Optional bilateral filter to reduce noise while preserving edges
        if use_bilateral:
            filtered = cv2.bilateralFilter(img, 9, 75, 75)
        else:
            filtered = cv2.GaussianBlur(img, (5, 5), 1.4)

        # Canny edge detection with configurable thresholds
        edges = cv2.Canny(filtered, self.canny_low, self.canny_high)

        return edges

    def _resize_to_match(
        self, img1: "np.ndarray", img2: "np.ndarray"
    ) -> Tuple["np.ndarray", "np.ndarray"]:
        """Resize render_edges to geom_edges size (exact pixels)."""
        import cv2

        h1, w1 = img1.shape[:2]
        h2, w2 = img2.shape[:2]

        if (h1, w1) == (h2, w2):
            return img1, img2

        # Resize img2 to match img1 (geom_edges is reference)
        img2 = cv2.resize(img2, (w1, h1), interpolation=cv2.INTER_AREA)

        return img1, img2

    def _apply_mask(
        self, edges: "np.ndarray", mask: Optional["np.ndarray"]
    ) -> "np.ndarray":
        """Apply mask to edge image."""
        import cv2
        import numpy as np

        if mask is None:
            return edges

        # Resize mask to match edges if needed
        if mask.shape != edges.shape:
            mask = cv2.resize(
                mask, (edges.shape[1], edges.shape[0]), interpolation=cv2.INTER_NEAREST
            )

        # Apply mask (keep edges only where mask is white)
        return cv2.bitwise_and(edges, mask)

    def _compute_f1_metrics(
        self,
        geom_edges: "np.ndarray",
        render_edges: "np.ndarray",
    ) -> DriftMetrics:
        """
        Compute precision, recall, and F1 using dilation tolerance.

        Algorithm:
        - geom_dil = dilate(geom_edges, radius=tolerance_px)
        - rend_dil = dilate(render_edges, radius=tolerance_px)
        - precision = sum(render_edges & geom_dil) / max(sum(render_edges), 1)
        - recall = sum(geom_edges & rend_dil) / max(sum(geom_edges), 1)
        - f1 = 2 * precision * recall / max(precision + recall, 1e-9)
        """
        import cv2
        import numpy as np

        # Create circular structuring element for dilation
        radius = self.tolerance_px
        kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (2 * radius + 1, 2 * radius + 1)
        )

        # Dilate both edge maps
        geom_dil = cv2.dilate(geom_edges, kernel, iterations=1)
        rend_dil = cv2.dilate(render_edges, kernel, iterations=1)

        # Count edge pixels
        geom_count = np.sum(geom_edges > 0)
        render_count = np.sum(render_edges > 0)

        # Compute matched pixels
        matched_render = np.sum((render_edges > 0) & (geom_dil > 0))
        matched_geom = np.sum((geom_edges > 0) & (rend_dil > 0))

        # Compute precision and recall
        precision = matched_render / max(render_count, 1)
        recall = matched_geom / max(geom_count, 1)

        # Compute F1
        if precision + recall > 0:
            f1 = 2 * precision * recall / (precision + recall)
        else:
            f1 = 0.0

        return DriftMetrics(
            precision=precision,
            recall=recall,
            f1=f1,
            geom_edge_count=int(geom_count),
            render_edge_count=int(render_count),
            matched_geom=int(matched_geom),
            matched_render=int(matched_render),
        )

    def _generate_overlay(
        self,
        phase3_render_path: Path,
        geom_edges: "np.ndarray",
        render_edges: "np.ndarray",
        output_dir: Path,
        view_name: str,
    ) -> Dict[str, str]:
        """
        Generate debug overlay images.

        Outputs:
        - drift_<view>_overlay.png: Phase3 render with edges overlaid
        - drift_<view>_edges_geom.png: Phase2 geometry edges
        - drift_<view>_edges_render.png: Phase3 render edges
        """
        import cv2
        import numpy as np

        output_files = {}
        output_dir.mkdir(parents=True, exist_ok=True)

        # Save geometry edges (Phase 2)
        geom_path = output_dir / f"drift_{view_name}_edges_geom.png"
        cv2.imwrite(str(geom_path), geom_edges)
        output_files["edges_geom"] = str(geom_path)

        # Save render edges (Phase 3)
        render_path = output_dir / f"drift_{view_name}_edges_render.png"
        cv2.imwrite(str(render_path), render_edges)
        output_files["edges_render"] = str(render_path)

        # Create overlay on Phase 3 render
        render_img = cv2.imread(str(phase3_render_path))
        if render_img is not None:
            # Resize render to match edge maps if needed
            if render_img.shape[:2] != geom_edges.shape:
                render_img = cv2.resize(
                    render_img,
                    (geom_edges.shape[1], geom_edges.shape[0]),
                    interpolation=cv2.INTER_AREA,
                )

            # Create overlay
            overlay = render_img.copy()

            # Draw geometry edges in RED
            overlay[geom_edges > 0] = [0, 0, 255]  # BGR: Red

            # Draw render edges in CYAN
            overlay[render_edges > 0] = [255, 255, 0]  # BGR: Cyan

            # Draw mismatches in YELLOW (geom edges not matched by render)
            radius = self.tolerance_px
            kernel = cv2.getStructuringElement(
                cv2.MORPH_ELLIPSE, (2 * radius + 1, 2 * radius + 1)
            )
            rend_dil = cv2.dilate(render_edges, kernel, iterations=1)
            mismatches = (geom_edges > 0) & (rend_dil == 0)
            overlay[mismatches] = [0, 255, 255]  # BGR: Yellow

            overlay_path = output_dir / f"drift_{view_name}_overlay.png"
            cv2.imwrite(str(overlay_path), overlay)
            output_files["overlay"] = str(overlay_path)

        return output_files

    def check_view(
        self,
        run_path: Path,
        view_name: str,
        output_dir: Optional[Path] = None,
    ) -> DriftResult:
        """
        Check drift for a single view.

        Args:
            run_path: Path to run folder
            view_name: Name of view to check (e.g., "elevation_N", "persp_main")
            output_dir: Directory for debug outputs (default: {run_path}/validation)

        Returns:
            DriftResult with pass/fail status and F1 score
        """
        run_path = Path(run_path)
        if output_dir is None:
            output_dir = run_path / "validation"

        # Check dependencies
        deps_ok, deps_error = self._check_dependencies()
        if not deps_ok:
            return DriftResult(
                view_name=view_name,
                passed=True,  # Skip if dependencies not available
                f1=0.0,
                threshold=self.threshold,
                tolerance_px=self.tolerance_px,
                error=f"Skipped: {deps_error}",
            )

        # Find Phase 2 edge file
        phase2_patterns = self.VIEW_PATTERNS.get(view_name, [])
        phase2_path = self._find_file(run_path, phase2_patterns)
        if not phase2_path:
            return DriftResult(
                view_name=view_name,
                passed=True,  # Skip if no Phase 2 edges
                f1=0.0,
                threshold=self.threshold,
                tolerance_px=self.tolerance_px,
                error=f"No Phase 2 edge file found for {view_name}",
            )

        # Find Phase 3 render file
        phase3_patterns = self.PHASE3_PATTERNS.get(view_name, [])
        phase3_path = self._find_file(run_path, phase3_patterns)
        if not phase3_path:
            return DriftResult(
                view_name=view_name,
                passed=True,  # Skip if no Phase 3 render
                f1=0.0,
                threshold=self.threshold,
                tolerance_px=self.tolerance_px,
                phase2_path=str(phase2_path),
                error=f"No Phase 3 render found for {view_name}",
            )

        # Find mask file (optional)
        mask_patterns = self.MASK_PATTERNS.get(view_name, [])
        mask_path = self._find_file(run_path, mask_patterns)

        try:
            # Load Phase 2 edges
            geom_edges = self._load_edge_image(phase2_path)

            # Load mask if available
            mask = self._load_mask(mask_path) if mask_path else None

            # Extract edges from Phase 3 render
            render_edges = self._extract_edges(phase3_path)

            # Resize render_edges to match geom_edges
            geom_edges, render_edges = self._resize_to_match(geom_edges, render_edges)

            # Apply mask to both edge maps
            if mask is not None:
                geom_edges = self._apply_mask(geom_edges, mask)
                render_edges = self._apply_mask(render_edges, mask)

            # Compute F1 metrics
            metrics = self._compute_f1_metrics(geom_edges, render_edges)

            # Determine pass/fail
            passed = metrics.f1 >= self.threshold

            # Generate debug outputs if enabled
            output_files = {}
            if self.generate_debug:
                output_files = self._generate_overlay(
                    phase3_path, geom_edges, render_edges, output_dir, view_name
                )

            if self.verbose:
                status = "PASS" if passed else "FAIL"
                print(
                    f"  [{status}] {view_name}: F1={metrics.f1:.3f} "
                    f"(P={metrics.precision:.3f}, R={metrics.recall:.3f})"
                )

            return DriftResult(
                view_name=view_name,
                passed=passed,
                f1=metrics.f1,
                threshold=self.threshold,
                tolerance_px=self.tolerance_px,
                phase2_path=str(phase2_path),
                phase3_path=str(phase3_path),
                mask_path=str(mask_path) if mask_path else None,
                metrics=metrics,
                details={
                    "phase2_hash": self._hash_file(phase2_path),
                    "phase3_hash": self._hash_file(phase3_path),
                    "mask_used": mask_path is not None,
                    "canny_low": self.canny_low,
                    "canny_high": self.canny_high,
                    "geom_size": list(geom_edges.shape),
                    "render_size": list(render_edges.shape),
                },
                output_files=output_files,
            )

        except Exception as e:
            return DriftResult(
                view_name=view_name,
                passed=False,
                f1=0.0,
                threshold=self.threshold,
                tolerance_px=self.tolerance_px,
                phase2_path=str(phase2_path),
                phase3_path=str(phase3_path) if phase3_path else None,
                mask_path=str(mask_path) if mask_path else None,
                error=str(e),
            )

    def check_all(
        self, run_path: Path, output_dir: Optional[Path] = None
    ) -> DriftCheckReport:
        """
        Check drift for all configured views.

        Args:
            run_path: Path to run folder
            output_dir: Directory for debug outputs (default: {run_path}/validation)

        Returns:
            DriftCheckReport with all results and summary
        """
        run_path = Path(run_path)
        if output_dir is None:
            output_dir = run_path / "validation"

        results = []

        if self.verbose:
            print(f"[DriftCheck] Checking {len(self.views)} views...")
            print(f"[DriftCheck] Threshold: F1 >= {self.threshold:.2f}")
            print(f"[DriftCheck] Tolerance: {self.tolerance_px}px")

        for view_name in self.views:
            result = self.check_view(run_path, view_name, output_dir)
            results.append(result)

            # Save individual result
            if result.error is None or "No Phase" not in result.error:
                result_path = output_dir / f"drift_{view_name}.json"
                result_path.parent.mkdir(parents=True, exist_ok=True)
                with open(result_path, "w") as f:
                    json.dump(result.to_dict(), f, indent=2)

        # Compute summary
        checked = [r for r in results if r.error is None or "No Phase" not in r.error]
        failed = [r for r in checked if not r.passed]
        skipped = [r for r in results if r.error and "No Phase" in r.error]

        all_passed = len(failed) == 0

        summary = {
            "total_views": len(self.views),
            "checked": len(checked),
            "passed": len(checked) - len(failed),
            "failed": len(failed),
            "skipped": len(skipped),
            "threshold": self.threshold,
            "tolerance_px": self.tolerance_px,
            "avg_f1": sum(r.f1 for r in checked) / len(checked) if checked else 0.0,
            "min_f1": min((r.f1 for r in checked), default=0.0),
            "max_f1": max((r.f1 for r in checked), default=0.0),
            "failed_views": [r.view_name for r in failed],
        }

        if self.verbose:
            print(f"[DriftCheck] Summary: {summary['passed']}/{summary['checked']} passed")
            if failed:
                print(f"[DriftCheck] Failed views: {[r.view_name for r in failed]}")

        return DriftCheckReport(passed=all_passed, results=results, summary=summary)


def main():
    """CLI entry point for drift checking."""
    import argparse
    import sys

    parser = argparse.ArgumentParser(
        description="Check Phase 2/3 drift for geometric consistency"
    )
    parser.add_argument("--run", "-r", required=True, help="Run folder path")
    parser.add_argument(
        "--view",
        help="Specific view to check (default: all views)",
    )
    parser.add_argument(
        "--threshold",
        "-t",
        type=float,
        default=DriftChecker.DEFAULT_THRESHOLD,
        help=f"F1 threshold (default: {DriftChecker.DEFAULT_THRESHOLD})",
    )
    parser.add_argument(
        "--tolerance-px",
        type=int,
        default=DriftChecker.DEFAULT_TOLERANCE_PX,
        help=f"Dilation tolerance in pixels (default: {DriftChecker.DEFAULT_TOLERANCE_PX})",
    )
    parser.add_argument(
        "--canny-low",
        type=int,
        default=DriftChecker.DEFAULT_CANNY_LOW,
        help=f"Canny low threshold (default: {DriftChecker.DEFAULT_CANNY_LOW})",
    )
    parser.add_argument(
        "--canny-high",
        type=int,
        default=DriftChecker.DEFAULT_CANNY_HIGH,
        help=f"Canny high threshold (default: {DriftChecker.DEFAULT_CANNY_HIGH})",
    )
    parser.add_argument(
        "--no-debug",
        action="store_true",
        help="Skip generating debug overlay images",
    )
    parser.add_argument("--verbose", "-v", action="store_true")
    parser.add_argument(
        "--output",
        "-o",
        help="Output directory (default: {run}/validation)",
    )

    args = parser.parse_args()

    run_path = Path(args.run)
    if not run_path.exists():
        print(f"Error: Run folder not found: {run_path}")
        sys.exit(1)

    output_dir = Path(args.output) if args.output else run_path / "validation"

    checker = DriftChecker(
        threshold=args.threshold,
        tolerance_px=args.tolerance_px,
        canny_low=args.canny_low,
        canny_high=args.canny_high,
        views=[args.view] if args.view else None,
        generate_debug=not args.no_debug,
        verbose=args.verbose,
    )

    if args.view:
        # Single view check
        result = checker.check_view(run_path, args.view, output_dir)
        result_path = output_dir / f"drift_{args.view}.json"
        result_path.parent.mkdir(parents=True, exist_ok=True)
        with open(result_path, "w") as f:
            json.dump(result.to_dict(), f, indent=2)
        print(f"Result saved: {result_path}")

        if result.passed:
            print(f"Drift check PASSED: F1={result.f1:.3f} >= {result.threshold:.3f}")
            sys.exit(0)
        else:
            print(f"Drift check FAILED: F1={result.f1:.3f} < {result.threshold:.3f}")
            sys.exit(1)
    else:
        # All views check
        report = checker.check_all(run_path, output_dir)

        # Save report
        report_path = output_dir / "drift_report.json"
        report.save(report_path)
        print(f"Report saved: {report_path}")

        # Exit with status
        if report.passed:
            print(f"Drift check PASSED: {report.summary['passed']}/{report.summary['checked']} views passed")
            sys.exit(0)
        else:
            print(f"Drift check FAILED: {report.summary['failed']} views failed")
            for view in report.summary.get("failed_views", []):
                print(f"  - {view}")
            sys.exit(1)


if __name__ == "__main__":
    main()
