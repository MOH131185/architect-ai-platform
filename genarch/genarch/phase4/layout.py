"""
A1 Layout Template and Panel Math

Provides page dimensions, margin calculations, and panel positioning
for professional architectural sheet assembly.

Page Size: A1 landscape = 841mm x 594mm (2384 x 1684 points)
"""

from dataclasses import dataclass
from typing import Dict, Tuple, Optional, List

# Conversion constants
MM_PER_INCH = 25.4
POINTS_PER_INCH = 72


def mm_to_points(mm: float) -> float:
    """Convert millimeters to ReportLab points."""
    return mm * POINTS_PER_INCH / MM_PER_INCH


def points_to_mm(points: float) -> float:
    """Convert ReportLab points to millimeters."""
    return points * MM_PER_INCH / POINTS_PER_INCH


# A1 paper dimensions in mm
A1_WIDTH_MM = 841
A1_HEIGHT_MM = 594

# A1 in points
A1_LANDSCAPE = (mm_to_points(A1_WIDTH_MM), mm_to_points(A1_HEIGHT_MM))
A1_PORTRAIT = (mm_to_points(A1_HEIGHT_MM), mm_to_points(A1_WIDTH_MM))

# Standard architectural scales
ARCHITECTURAL_SCALES = [50, 75, 100, 150, 200]  # 1:N


@dataclass
class PanelRect:
    """Rectangle defining a panel position and size in points."""
    x: float
    y: float
    width: float
    height: float

    @property
    def x_mm(self) -> float:
        return points_to_mm(self.x)

    @property
    def y_mm(self) -> float:
        return points_to_mm(self.y)

    @property
    def width_mm(self) -> float:
        return points_to_mm(self.width)

    @property
    def height_mm(self) -> float:
        return points_to_mm(self.height)

    def to_dict(self) -> Dict:
        return {
            "x_pt": self.x,
            "y_pt": self.y,
            "width_pt": self.width,
            "height_pt": self.height,
            "x_mm": self.x_mm,
            "y_mm": self.y_mm,
            "width_mm": self.width_mm,
            "height_mm": self.height_mm,
        }


class A1Layout:
    """
    A1 Sheet Layout Manager.

    Standard template layout:
    +------------------------------------------------------------------+
    |  15mm margin                                                       |
    |  +----------------------------+  +-----------------------------+  |
    |  |                            |  |   PERSPECTIVE RENDER        |  |
    |  |                            |  |   ~340mm x 200mm            |  |
    |  |      FLOOR PLAN            |  +-----------------------------+  |
    |  |      (vector, largest)     |  +-----------------------------+  |
    |  |      ~460mm x 480mm        |  |   NORTH ELEVATION           |  |
    |  |                            |  |   ~340mm x 140mm            |  |
    |  |   + North arrow            |  +-----------------------------+  |
    |  |   + Scale bar              |  +-----------------------------+  |
    |  |   + Room schedule          |  |   SECTION A-A               |  |
    |  +----------------------------+  |   ~340mm x 140mm            |  |
    |                                  +-----------------------------+  |
    |  +---------------------------------------------------------------+|
    |  |   TITLE BLOCK: Project | Client | Scale | Date | Seed | Area  ||
    |  +---------------------------------------------------------------+|
    +------------------------------------------------------------------+
    """

    # Default margins and gutters in mm
    MARGIN_MM = 15
    GUTTER_MM = 8
    TITLE_BLOCK_HEIGHT_MM = 40

    # Panel dimensions in mm for standard template
    STANDARD_PANELS = {
        "floor_plan": {"width": 460, "height": 480},
        "perspective": {"width": 340, "height": 200},
        "north_elevation": {"width": 340, "height": 140},
        "section": {"width": 340, "height": 140},
    }

    def __init__(
        self,
        orientation: str = "landscape",
        template: str = "standard",
        margin_mm: float = None,
        gutter_mm: float = None,
    ):
        """
        Initialize A1 layout.

        Args:
            orientation: 'landscape' (841x594) or 'portrait' (594x841)
            template: Layout template name ('standard' only for now)
            margin_mm: Page margin in mm (default: 15)
            gutter_mm: Gutter between panels in mm (default: 8)
        """
        self.orientation = orientation
        self.template = template
        self.margin_mm = margin_mm if margin_mm is not None else self.MARGIN_MM
        self.gutter_mm = gutter_mm if gutter_mm is not None else self.GUTTER_MM

        # Set page size based on orientation
        if orientation == "landscape":
            self.page_width_mm = A1_WIDTH_MM
            self.page_height_mm = A1_HEIGHT_MM
        else:
            self.page_width_mm = A1_HEIGHT_MM
            self.page_height_mm = A1_WIDTH_MM

        self.page_width_pt = mm_to_points(self.page_width_mm)
        self.page_height_pt = mm_to_points(self.page_height_mm)
        self.pagesize = (self.page_width_pt, self.page_height_pt)

    def get_drawable_area(self) -> Tuple[float, float, float, float]:
        """
        Get drawable area (inside margins) in points.

        Returns:
            Tuple of (x, y, width, height) in points
        """
        margin_pt = mm_to_points(self.margin_mm)
        x = margin_pt
        y = margin_pt + mm_to_points(self.TITLE_BLOCK_HEIGHT_MM)  # Above title block
        width = self.page_width_pt - 2 * margin_pt
        height = self.page_height_pt - 2 * margin_pt - mm_to_points(self.TITLE_BLOCK_HEIGHT_MM)
        return (x, y, width, height)

    def compute_panel_rects(self) -> Dict[str, PanelRect]:
        """
        Compute panel rectangles for the current template.

        Returns:
            Dict mapping panel names to PanelRect objects
        """
        if self.template == "standard":
            return self._compute_standard_panels()
        else:
            raise ValueError(f"Unknown template: {self.template}")

    def _compute_standard_panels(self) -> Dict[str, PanelRect]:
        """Compute panel positions for standard template."""
        margin_pt = mm_to_points(self.margin_mm)
        gutter_pt = mm_to_points(self.gutter_mm)
        title_height_pt = mm_to_points(self.TITLE_BLOCK_HEIGHT_MM)

        panels = {}

        # Floor plan: left side, full height (minus title block)
        floor_plan = self.STANDARD_PANELS["floor_plan"]
        floor_plan_width_pt = mm_to_points(floor_plan["width"])
        floor_plan_height_pt = mm_to_points(floor_plan["height"])
        panels["floor_plan"] = PanelRect(
            x=margin_pt,
            y=margin_pt + title_height_pt + gutter_pt,
            width=floor_plan_width_pt,
            height=floor_plan_height_pt,
        )

        # Right column starts after floor plan + gutter
        right_x = margin_pt + floor_plan_width_pt + gutter_pt
        right_width_pt = mm_to_points(self.STANDARD_PANELS["perspective"]["width"])

        # Section: bottom right (above title block)
        section = self.STANDARD_PANELS["section"]
        section_height_pt = mm_to_points(section["height"])
        panels["section"] = PanelRect(
            x=right_x,
            y=margin_pt + title_height_pt + gutter_pt,
            width=right_width_pt,
            height=section_height_pt,
        )

        # North elevation: middle right
        elev = self.STANDARD_PANELS["north_elevation"]
        elev_height_pt = mm_to_points(elev["height"])
        panels["north_elevation"] = PanelRect(
            x=right_x,
            y=panels["section"].y + section_height_pt + gutter_pt,
            width=right_width_pt,
            height=elev_height_pt,
        )

        # Perspective: top right
        persp = self.STANDARD_PANELS["perspective"]
        persp_height_pt = mm_to_points(persp["height"])
        panels["perspective"] = PanelRect(
            x=right_x,
            y=panels["north_elevation"].y + elev_height_pt + gutter_pt,
            width=right_width_pt,
            height=persp_height_pt,
        )

        # Title block: bottom, full width
        panels["title_block"] = PanelRect(
            x=margin_pt,
            y=margin_pt,
            width=self.page_width_pt - 2 * margin_pt,
            height=title_height_pt,
        )

        return panels

    def get_title_block_rect(self) -> PanelRect:
        """Get the title block rectangle."""
        margin_pt = mm_to_points(self.margin_mm)
        title_height_pt = mm_to_points(self.TITLE_BLOCK_HEIGHT_MM)
        return PanelRect(
            x=margin_pt,
            y=margin_pt,
            width=self.page_width_pt - 2 * margin_pt,
            height=title_height_pt,
        )

    def to_dict(self) -> Dict:
        """Export layout configuration as dictionary."""
        panels = self.compute_panel_rects()
        return {
            "page": {
                "format": "A1",
                "orientation": self.orientation,
                "width_mm": self.page_width_mm,
                "height_mm": self.page_height_mm,
                "width_pt": self.page_width_pt,
                "height_pt": self.page_height_pt,
            },
            "margins": {
                "margin_mm": self.margin_mm,
                "gutter_mm": self.gutter_mm,
            },
            "panels": {name: rect.to_dict() for name, rect in panels.items()},
        }


def choose_best_scale(
    bbox_m: Tuple[float, float],
    panel_mm: Tuple[float, float],
    margin_mm: float = 10,
) -> int:
    """
    Choose the smallest architectural scale that fits the plan in the panel.

    Args:
        bbox_m: Bounding box of plan in meters (width, height)
        panel_mm: Panel size in mm (width, height)
        margin_mm: Margin inside panel in mm (default: 10)

    Returns:
        Best scale factor (e.g., 100 for 1:100)
    """
    available_mm = (panel_mm[0] - 2 * margin_mm, panel_mm[1] - 2 * margin_mm)
    bbox_mm = (bbox_m[0] * 1000, bbox_m[1] * 1000)  # meters to mm

    for scale in ARCHITECTURAL_SCALES:
        scaled_w = bbox_mm[0] / scale
        scaled_h = bbox_mm[1] / scale
        if scaled_w <= available_mm[0] and scaled_h <= available_mm[1]:
            return scale

    return ARCHITECTURAL_SCALES[-1]  # 1:200 as fallback


def format_scale(scale: int) -> str:
    """Format scale as string (e.g., '1:100')."""
    return f"1:{scale}"


def parse_scale(scale_str: str) -> Optional[int]:
    """
    Parse scale string to integer.

    Args:
        scale_str: Scale string like '1:100' or '100'

    Returns:
        Scale integer (e.g., 100) or None if invalid
    """
    if scale_str is None:
        return None

    if scale_str.startswith("1:"):
        try:
            return int(scale_str[2:])
        except ValueError:
            return None

    try:
        return int(scale_str)
    except ValueError:
        return None
