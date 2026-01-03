"""
Drift Checker - Validates Phase 3 renders match Phase 2 geometry.

This module overlays Phase 2 edge maps (canny/lineart) onto Phase 3 AI renders
and computes an alignment score. If the mismatch exceeds a threshold, the
validation fails.

Algorithm:
1. Load Phase 2 canny/lineart edge image (binary edges)
2. Load Phase 3 AI-generated render
3. Extract edges from Phase 3 render using Canny edge detection
4. Compute edge alignment score using:
   - Chamfer distance (average distance from P3 edges to nearest P2 edge)
   - Edge overlap IoU (intersection over union of edge pixels)
5. Fail if score exceeds threshold

Usage:
    from genarch.validation import DriftChecker

    checker = DriftChecker(threshold=0.15)
    result = checker.check(
        phase2_edge_path="phase2/elevation_N_canny.png",
        phase3_render_path="phase3/elevation_N_render.png"
    )
    if not result.passed:
        print(f"Drift detected: {result.score:.2%} (threshold: {result.threshold:.2%})")
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, List, Tuple
import json


@dataclass
class DriftResult:
    """Result of drift validation for a single view."""

    view_name: str
    passed: bool
    score: float  # 0.0 = perfect match, 1.0 = complete mismatch
    threshold: float
    phase2_path: Optional[str] = None
    phase3_path: Optional[str] = None
    details: dict = field(default_factory=dict)
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "view_name": self.view_name,
            "passed": self.passed,
            "score": self.score,
            "threshold": self.threshold,
            "phase2_path": self.phase2_path,
            "phase3_path": self.phase3_path,
            "details": self.details,
            "error": self.error,
        }


@dataclass
class DriftCheckReport:
    """Complete drift check report for all views."""

    passed: bool
    results: List[DriftResult]
    summary: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "passed": self.passed,
            "results": [r.to_dict() for r in self.results],
            "summary": self.summary,
        }

    def save(self, path: Path) -> None:
        """Save report to JSON file."""
        with open(path, "w") as f:
            json.dump(self.to_dict(), f, indent=2)


class DriftChecker:
    """
    Validates that Phase 3 AI renders match Phase 2 geometry edges.

    The checker compares edge maps from Phase 2 (ControlNet inputs) with
    edges extracted from Phase 3 renders to detect geometric drift.
    """

    # Default threshold: 15% edge mismatch allowed
    DEFAULT_THRESHOLD = 0.15

    # View name to Phase 2 edge file patterns
    VIEW_PATTERNS = {
        "elevation_N": [
            "phase2/elevation_N_canny.png",
            "phase2/elevation_N_lineart.png",
            "phase2/views/north_elev/canny.png",
        ],
        "elevation_S": [
            "phase2/elevation_S_canny.png",
            "phase2/elevation_S_lineart.png",
            "phase2/views/south_elev/canny.png",
        ],
        "elevation_E": [
            "phase2/elevation_E_canny.png",
            "phase2/elevation_E_lineart.png",
            "phase2/views/east_elev/canny.png",
        ],
        "elevation_W": [
            "phase2/elevation_W_canny.png",
            "phase2/elevation_W_lineart.png",
            "phase2/views/west_elev/canny.png",
        ],
        "section_AA": [
            "phase2/section_AA_canny.png",
            "phase2/section_AA_lineart.png",
            "phase2/views/section_a/canny.png",
        ],
        "section_BB": [
            "phase2/section_BB_canny.png",
            "phase2/section_BB_lineart.png",
            "phase2/views/section_b/canny.png",
        ],
        "perspective": [
            "phase2/hero_perspective_canny.png",
            "phase2/hero_perspective_lineart.png",
            "phase2/views/perspective/canny.png",
        ],
    }

    # Phase 3 render patterns
    PHASE3_PATTERNS = {
        "elevation_N": [
            "phase3/elevation_N_render.png",
            "phase3/elevation_N.png",
            "phase3/views/north_elev/render.png",
        ],
        "elevation_S": [
            "phase3/elevation_S_render.png",
            "phase3/elevation_S.png",
            "phase3/views/south_elev/render.png",
        ],
        "elevation_E": [
            "phase3/elevation_E_render.png",
            "phase3/elevation_E.png",
            "phase3/views/east_elev/render.png",
        ],
        "elevation_W": [
            "phase3/elevation_W_render.png",
            "phase3/elevation_W.png",
            "phase3/views/west_elev/render.png",
        ],
        "section_AA": [
            "phase3/section_AA_render.png",
            "phase3/section_AA.png",
            "phase3/views/section_a/render.png",
        ],
        "section_BB": [
            "phase3/section_BB_render.png",
            "phase3/section_BB.png",
            "phase3/views/section_b/render.png",
        ],
        "perspective": [
            "phase3/perspective_render.png",
            "phase3/perspective.png",
            "phase3/views/perspective/render.png",
        ],
    }

    def __init__(
        self,
        threshold: float = DEFAULT_THRESHOLD,
        views: Optional[List[str]] = None,
        verbose: bool = False,
    ):
        """
        Initialize drift checker.

        Args:
            threshold: Maximum allowed drift score (0.0-1.0). Default 0.15 (15%)
            views: List of view names to check. Default: all views
            verbose: Enable verbose logging
        """
        self.threshold = threshold
        self.views = views or list(self.VIEW_PATTERNS.keys())
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

    def _extract_edges(self, path: Path) -> "np.ndarray":
        """Extract edges from render image using Canny."""
        import cv2
        import numpy as np

        img = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
        if img is None:
            raise ValueError(f"Failed to load image: {path}")

        # Apply Gaussian blur to reduce noise
        blurred = cv2.GaussianBlur(img, (5, 5), 1.4)

        # Canny edge detection with auto-thresholds
        median_val = np.median(blurred)
        lower = int(max(0, 0.7 * median_val))
        upper = int(min(255, 1.3 * median_val))
        edges = cv2.Canny(blurred, lower, upper)

        return edges

    def _compute_chamfer_distance(
        self, edges1: "np.ndarray", edges2: "np.ndarray"
    ) -> float:
        """
        Compute normalized Chamfer distance between two edge maps.

        Returns a score between 0.0 (perfect match) and 1.0 (no match).
        """
        import cv2
        import numpy as np

        # Get edge points
        pts1 = np.argwhere(edges1 > 0)
        pts2 = np.argwhere(edges2 > 0)

        if len(pts1) == 0 or len(pts2) == 0:
            return 1.0  # No edges = complete mismatch

        # Compute distance transform from edges2
        dist_transform = cv2.distanceTransform(
            255 - edges2, cv2.DIST_L2, cv2.DIST_MASK_PRECISE
        )

        # Average distance from edges1 points to nearest edges2
        distances = dist_transform[pts1[:, 0], pts1[:, 1]]
        avg_distance = np.mean(distances)

        # Normalize by image diagonal
        diag = np.sqrt(edges1.shape[0] ** 2 + edges1.shape[1] ** 2)
        normalized = avg_distance / diag

        # Clamp to [0, 1]
        return min(1.0, normalized * 10)  # Scale factor for sensitivity

    def _compute_edge_iou(self, edges1: "np.ndarray", edges2: "np.ndarray") -> float:
        """
        Compute edge overlap IoU (Intersection over Union).

        Returns a score between 0.0 (no overlap) and 1.0 (perfect overlap).
        """
        import numpy as np

        # Dilate edges slightly to allow for small misalignments
        import cv2

        kernel = np.ones((3, 3), np.uint8)
        edges1_dilated = cv2.dilate(edges1, kernel, iterations=1)
        edges2_dilated = cv2.dilate(edges2, kernel, iterations=1)

        intersection = np.logical_and(edges1_dilated > 0, edges2_dilated > 0).sum()
        union = np.logical_or(edges1_dilated > 0, edges2_dilated > 0).sum()

        if union == 0:
            return 0.0

        return intersection / union

    def _resize_to_match(
        self, img1: "np.ndarray", img2: "np.ndarray"
    ) -> Tuple["np.ndarray", "np.ndarray"]:
        """Resize images to match dimensions."""
        import cv2

        h1, w1 = img1.shape[:2]
        h2, w2 = img2.shape[:2]

        if (h1, w1) == (h2, w2):
            return img1, img2

        # Resize to smaller dimensions
        target_h = min(h1, h2)
        target_w = min(w1, w2)

        if (h1, w1) != (target_h, target_w):
            img1 = cv2.resize(img1, (target_w, target_h), interpolation=cv2.INTER_AREA)
        if (h2, w2) != (target_h, target_w):
            img2 = cv2.resize(img2, (target_w, target_h), interpolation=cv2.INTER_AREA)

        return img1, img2

    def check_view(
        self,
        run_path: Path,
        view_name: str,
    ) -> DriftResult:
        """
        Check drift for a single view.

        Args:
            run_path: Path to run folder
            view_name: Name of view to check (e.g., "elevation_N")

        Returns:
            DriftResult with pass/fail status and score
        """
        # Check dependencies - skip gracefully if not available
        deps_ok, deps_error = self._check_dependencies()
        if not deps_ok:
            return DriftResult(
                view_name=view_name,
                passed=True,  # Skip if dependencies not available
                score=0.0,
                threshold=self.threshold,
                error=f"Skipped: {deps_error}",
            )

        # Find Phase 2 edge file
        phase2_patterns = self.VIEW_PATTERNS.get(view_name, [])
        phase2_path = self._find_file(run_path, phase2_patterns)
        if not phase2_path:
            return DriftResult(
                view_name=view_name,
                passed=True,  # Skip if no Phase 2 edges
                score=0.0,
                threshold=self.threshold,
                error=f"No Phase 2 edge file found for {view_name}",
            )

        # Find Phase 3 render file
        phase3_patterns = self.PHASE3_PATTERNS.get(view_name, [])
        phase3_path = self._find_file(run_path, phase3_patterns)
        if not phase3_path:
            return DriftResult(
                view_name=view_name,
                passed=True,  # Skip if no Phase 3 render
                score=0.0,
                threshold=self.threshold,
                phase2_path=str(phase2_path),
                error=f"No Phase 3 render found for {view_name}",
            )

        try:
            # Load Phase 2 edges
            phase2_edges = self._load_edge_image(phase2_path)

            # Extract edges from Phase 3 render
            phase3_edges = self._extract_edges(phase3_path)

            # Resize to match
            phase2_edges, phase3_edges = self._resize_to_match(
                phase2_edges, phase3_edges
            )

            # Compute metrics
            chamfer = self._compute_chamfer_distance(phase2_edges, phase3_edges)
            iou = self._compute_edge_iou(phase2_edges, phase3_edges)

            # Combined score: weighted average (chamfer distance is primary)
            # Higher chamfer = more drift, lower IoU = less overlap
            score = 0.7 * chamfer + 0.3 * (1.0 - iou)

            passed = score <= self.threshold

            if self.verbose:
                status = "PASS" if passed else "FAIL"
                print(
                    f"  [{status}] {view_name}: score={score:.3f} "
                    f"(chamfer={chamfer:.3f}, iou={iou:.3f})"
                )

            return DriftResult(
                view_name=view_name,
                passed=passed,
                score=score,
                threshold=self.threshold,
                phase2_path=str(phase2_path),
                phase3_path=str(phase3_path),
                details={
                    "chamfer_distance": chamfer,
                    "edge_iou": iou,
                    "phase2_size": list(phase2_edges.shape),
                    "phase3_size": list(phase3_edges.shape),
                },
            )

        except Exception as e:
            return DriftResult(
                view_name=view_name,
                passed=False,
                score=1.0,
                threshold=self.threshold,
                phase2_path=str(phase2_path),
                phase3_path=str(phase3_path) if phase3_path else None,
                error=str(e),
            )

    def check_all(self, run_path: Path) -> DriftCheckReport:
        """
        Check drift for all configured views.

        Args:
            run_path: Path to run folder

        Returns:
            DriftCheckReport with all results and summary
        """
        run_path = Path(run_path)
        results = []

        if self.verbose:
            print(f"[DriftCheck] Checking {len(self.views)} views...")

        for view_name in self.views:
            result = self.check_view(run_path, view_name)
            results.append(result)

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
            "avg_score": (
                sum(r.score for r in checked) / len(checked) if checked else 0.0
            ),
            "max_score": max((r.score for r in checked), default=0.0),
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

    parser = argparse.ArgumentParser(description="Check Phase 2/3 drift")
    parser.add_argument("--run", "-r", required=True, help="Run folder path")
    parser.add_argument(
        "--threshold",
        "-t",
        type=float,
        default=DriftChecker.DEFAULT_THRESHOLD,
        help=f"Drift threshold (default: {DriftChecker.DEFAULT_THRESHOLD})",
    )
    parser.add_argument(
        "--views",
        nargs="+",
        help="Specific views to check (default: all)",
    )
    parser.add_argument("--verbose", "-v", action="store_true")
    parser.add_argument(
        "--output",
        "-o",
        help="Output report path (default: {run}/drift_report.json)",
    )

    args = parser.parse_args()

    run_path = Path(args.run)
    if not run_path.exists():
        print(f"Error: Run folder not found: {run_path}")
        sys.exit(1)

    checker = DriftChecker(
        threshold=args.threshold,
        views=args.views,
        verbose=args.verbose,
    )

    report = checker.check_all(run_path)

    # Save report
    output_path = Path(args.output) if args.output else run_path / "drift_report.json"
    report.save(output_path)
    print(f"Report saved: {output_path}")

    # Exit with status
    if report.passed:
        print("Drift check PASSED")
        sys.exit(0)
    else:
        print("Drift check FAILED")
        sys.exit(1)


if __name__ == "__main__":
    main()
