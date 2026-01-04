"""
A1 Sheet Assembler

Main class for composing print-ready A1 PDF from Phase 1-3 outputs.
Assembles vector floor plans, raster renders, and title block into
a professional architectural sheet.
"""

import json
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple

try:
    from reportlab.pdfgen import canvas
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.graphics import renderPDF
except ImportError:
    canvas = None
    colors = None
    mm = None
    renderPDF = None

try:
    from PIL import Image
except ImportError:
    Image = None

from .layout import (
    A1Layout,
    PanelRect,
    mm_to_points,
    points_to_mm,
    choose_best_scale,
    format_scale,
    parse_scale,
    ARCHITECTURAL_SCALES,
)
from .assets import (
    load_image,
    hash_file,
    find_asset,
    find_perspective_asset,
    find_north_elevation_asset,
    find_section_asset,
    find_floor_plan_asset,
    check_dpi,
    prepare_image_for_pdf,
)
from .vector_import import (
    load_svg,
    convert_dxf_to_svg,
    scale_drawing_to_panel,
    render_drawing_to_pdf,
    get_plan_bbox_meters,
)
from .svg_generator import generate_svg_from_plan, load_plan_json


class A1SheetAssembler:
    """
    Assembles A1 architectural sheet from Phase 1-3 outputs.

    Usage:
        assembler = A1SheetAssembler(run_path, output_path)
        success = assembler.assemble()
    """

    def __init__(
        self,
        run_path: Path,
        output_path: Path,
        orientation: str = "landscape",
        template: str = "standard",
        scale: Optional[str] = None,
        title: Optional[str] = None,
        client: str = "",
        project_number: str = "",
        dpi_threshold: int = 300,
        strict: bool = False,
        verbose: bool = False,
    ):
        """
        Initialize A1 sheet assembler.

        Args:
            run_path: Path to run folder containing Phase 1-3 outputs
            output_path: Path for output PDF file
            orientation: 'landscape' or 'portrait'
            template: Layout template name
            scale: Explicit scale (e.g., '1:100') or None for auto
            title: Project title (default: from run.json)
            client: Client name for title block
            project_number: Project number for title block
            dpi_threshold: Minimum DPI for raster quality (default: 300)
            strict: If True, error on missing assets; if False, use placeholders
            verbose: Enable verbose logging
        """
        self.run_path = Path(run_path)
        self.output_path = Path(output_path)
        self.orientation = orientation
        self.template = template
        self.explicit_scale = parse_scale(scale)
        self.title = title
        self.client = client
        self.project_number = project_number
        self.dpi_threshold = dpi_threshold
        self.strict = strict
        self.verbose = verbose

        # State
        self.warnings: List[str] = []
        self.manifest: Dict[str, Any] = {}
        self.plan_data: Optional[Dict] = None
        self.run_data: Optional[Dict] = None
        self.chosen_scale: int = 100  # Default 1:100

        # Layout
        self.layout = A1Layout(orientation=orientation, template=template)
        self.panels = self.layout.compute_panel_rects()

    def assemble(self) -> bool:
        """
        Main assembly pipeline.

        Returns:
            True if successful (or non-strict mode with warnings),
            False if failed or strict mode with missing assets
        """
        if canvas is None:
            raise ImportError("reportlab is required: pip install reportlab")

        self._log("Starting A1 sheet assembly...")
        self._log(f"Run folder: {self.run_path}")
        self._log(f"Output: {self.output_path}")

        # 1. Load metadata
        self._log("Loading metadata...")
        self.plan_data = self._load_plan_json()
        self.run_data = self._load_run_json()

        if self.plan_data is None and self.strict:
            self._error("plan.json not found")
            return False

        # 2. Determine scale
        self._determine_scale()

        # 3. Create PDF canvas
        self._log(f"Creating PDF canvas ({self.orientation})...")
        self.output_path.parent.mkdir(parents=True, exist_ok=True)
        c = canvas.Canvas(str(self.output_path), pagesize=self.layout.pagesize)

        # 4. Draw border
        self._draw_border(c)

        # 5. Place floor plan (vector)
        self._log("Placing floor plan...")
        self._place_floor_plan(c)

        # 6. Place raster images
        self._log("Placing perspective render...")
        self._place_perspective(c)

        self._log("Placing north elevation...")
        self._place_north_elevation(c)

        self._log("Placing section...")
        self._place_section(c)

        # 7. Draw title block
        self._log("Drawing title block...")
        self._draw_title_block(c)

        # 8. Add annotations
        self._log("Adding annotations...")
        self._draw_north_arrow(c)
        self._draw_scale_bar(c)

        # 9. Save PDF
        self._log("Saving PDF...")
        c.save()

        # 10. Write manifest
        self._write_manifest()

        # Report result
        if self.warnings:
            self._log(f"Completed with {len(self.warnings)} warnings:")
            for w in self.warnings:
                self._log(f"  - {w}")
        else:
            self._log("Completed successfully!")

        return len(self.warnings) == 0 or not self.strict

    def _log(self, message: str) -> None:
        """Log message if verbose."""
        if self.verbose:
            print(f"[Phase4] {message}")

    def _error(self, message: str) -> None:
        """Log error and add to warnings."""
        print(f"[Phase4] ERROR: {message}")
        self.warnings.append(message)

    def _warn(self, message: str) -> None:
        """Log warning and add to warnings."""
        if self.verbose:
            print(f"[Phase4] WARNING: {message}")
        self.warnings.append(message)

    def _load_plan_json(self) -> Optional[Dict]:
        """Load plan.json from run folder."""
        plan_path = self.run_path / "plan.json"
        if not plan_path.exists():
            self._warn("plan.json not found")
            return None

        try:
            return load_plan_json(plan_path)
        except Exception as e:
            self._warn(f"Could not load plan.json: {e}")
            return None

    def _load_run_json(self) -> Optional[Dict]:
        """Load run.json from run folder."""
        run_path = self.run_path / "run.json"
        if not run_path.exists():
            self._warn("run.json not found")
            return None

        try:
            with open(run_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            self._warn(f"Could not load run.json: {e}")
            return None

    def _determine_scale(self) -> None:
        """Determine scale to use (explicit or auto-fit)."""
        if self.explicit_scale is not None:
            self.chosen_scale = self.explicit_scale
            self._log(f"Using explicit scale: 1:{self.chosen_scale}")
            return

        # Auto-fit based on plan bbox and floor plan panel size
        if self.plan_data is None:
            self.chosen_scale = 100  # Default
            return

        bbox_m = get_plan_bbox_meters(self.plan_data)
        panel = self.panels["floor_plan"]
        panel_mm = (panel.width_mm, panel.height_mm)

        self.chosen_scale = choose_best_scale(bbox_m, panel_mm)
        self._log(f"Auto-selected scale: 1:{self.chosen_scale}")

    def _draw_border(self, c: Any) -> None:
        """Draw page border."""
        margin_pt = mm_to_points(self.layout.margin_mm)
        c.setStrokeColor(colors.black)
        c.setLineWidth(1)
        c.rect(
            margin_pt,
            margin_pt,
            self.layout.page_width_pt - 2 * margin_pt,
            self.layout.page_height_pt - 2 * margin_pt,
        )

    def _place_floor_plan(self, c: Any) -> None:
        """Place floor plan in PDF (vector preferred)."""
        panel = self.panels["floor_plan"]

        # Try to find vector source
        floor_plan_asset = find_floor_plan_asset(self.run_path)

        if floor_plan_asset is None:
            # Generate SVG from plan.json if available
            if self.plan_data:
                self._log("Generating SVG from plan.json...")
                svg_content = generate_svg_from_plan(self.plan_data)
                temp_svg = Path(tempfile.mktemp(suffix=".svg"))
                temp_svg.write_text(svg_content, encoding="utf-8")
                floor_plan_asset = temp_svg
                self.manifest["floor_plan_generated"] = True
            else:
                self._draw_placeholder(c, panel, "Floor Plan")
                return

        # Load and place SVG or convert DXF
        if floor_plan_asset.suffix.lower() == ".svg":
            drawing = load_svg(floor_plan_asset)
        elif floor_plan_asset.suffix.lower() == ".dxf":
            svg_path = convert_dxf_to_svg(floor_plan_asset)
            if svg_path:
                drawing = load_svg(svg_path)
            else:
                self._draw_placeholder(c, panel, "Floor Plan (DXF conversion failed)")
                return
        else:
            self._draw_placeholder(c, panel, "Floor Plan (unsupported format)")
            return

        if drawing is None:
            self._draw_placeholder(c, panel, "Floor Plan (load failed)")
            return

        # Get bbox and scale
        bbox_m = get_plan_bbox_meters(self.plan_data) if self.plan_data else (10, 10)

        # Scale drawing to fit panel
        scale_drawing_to_panel(
            drawing,
            bbox_m,
            self.chosen_scale,
            panel.width,
            panel.height,
        )

        # Render to PDF
        render_drawing_to_pdf(c, drawing, panel.x, panel.y)

        # Update manifest
        self.manifest["panels"] = self.manifest.get("panels", {})
        self.manifest["panels"]["floor_plan"] = {
            "rect_mm": [panel.x_mm, panel.y_mm, panel.width_mm, panel.height_mm],
            "source": str(floor_plan_asset.relative_to(self.run_path))
                      if floor_plan_asset.is_relative_to(self.run_path)
                      else str(floor_plan_asset),
            "source_hash": hash_file(floor_plan_asset) if floor_plan_asset.exists() else None,
            "vector": True,
            "scale": format_scale(self.chosen_scale),
        }

    def _place_raster_image(
        self,
        c: Any,
        panel: PanelRect,
        asset_path: Optional[Path],
        panel_name: str,
    ) -> None:
        """Place a raster image in a panel."""
        if asset_path is None:
            self._draw_placeholder(c, panel, panel_name)
            self._warn(f"Missing asset: {panel_name}")
            return

        result = load_image(asset_path)
        if result is None:
            self._draw_placeholder(c, panel, panel_name)
            self._warn(f"Could not load: {asset_path}")
            return

        img, width_px, height_px = result

        # Prepare image for PDF
        img = prepare_image_for_pdf(img)

        # Check DPI
        effective_dpi, dpi_warning = check_dpi(width_px, panel.width_mm, self.dpi_threshold)
        if dpi_warning:
            self._warn(f"Low DPI ({effective_dpi:.0f}) for {panel_name}")

        # Save temp image for embedding
        temp_path = Path(tempfile.mktemp(suffix=".png"))
        img.save(str(temp_path), "PNG")

        # Calculate aspect-fit dimensions
        img_aspect = width_px / height_px
        panel_aspect = panel.width / panel.height

        if img_aspect > panel_aspect:
            # Image wider - fit to width
            draw_width = panel.width
            draw_height = panel.width / img_aspect
        else:
            # Image taller - fit to height
            draw_height = panel.height
            draw_width = panel.height * img_aspect

        # Center in panel
        x = panel.x + (panel.width - draw_width) / 2
        y = panel.y + (panel.height - draw_height) / 2

        # Draw image
        c.drawImage(str(temp_path), x, y, draw_width, draw_height)

        # Cleanup
        temp_path.unlink()

        # Update manifest
        self.manifest["panels"] = self.manifest.get("panels", {})
        self.manifest["panels"][panel_name.lower().replace(" ", "_")] = {
            "rect_mm": [panel.x_mm, panel.y_mm, panel.width_mm, panel.height_mm],
            "source": str(asset_path.relative_to(self.run_path))
                      if asset_path.is_relative_to(self.run_path)
                      else str(asset_path),
            "source_hash": hash_file(asset_path),
            "effective_dpi": round(effective_dpi, 1),
            "dpi_warning": dpi_warning,
        }

    def _place_perspective(self, c: Any) -> None:
        """Place perspective render."""
        panel = self.panels["perspective"]
        asset = find_perspective_asset(self.run_path)
        self._place_raster_image(c, panel, asset, "Perspective")

    def _place_north_elevation(self, c: Any) -> None:
        """Place north elevation."""
        panel = self.panels["north_elevation"]
        asset = find_north_elevation_asset(self.run_path)
        self._place_raster_image(c, panel, asset, "North Elevation")

    def _place_section(self, c: Any) -> None:
        """Place section."""
        panel = self.panels["section"]
        asset = find_section_asset(self.run_path)
        self._place_raster_image(c, panel, asset, "Section")

    def _draw_placeholder(self, c: Any, rect: PanelRect, label: str) -> None:
        """Draw a placeholder rectangle with label."""
        c.saveState()
        c.setStrokeColor(colors.red)
        c.setFillColor(colors.lightgrey)
        c.rect(rect.x, rect.y, rect.width, rect.height, fill=1, stroke=1)

        c.setFillColor(colors.red)
        c.setFont("Helvetica-Bold", 12)
        c.drawCentredString(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
            f"MISSING: {label}",
        )
        c.restoreState()

    def _draw_title_block(self, c: Any) -> None:
        """Draw title block at bottom of sheet."""
        panel = self.panels["title_block"]

        # Background
        c.setFillColor(colors.white)
        c.setStrokeColor(colors.black)
        c.setLineWidth(1)
        c.rect(panel.x, panel.y, panel.width, panel.height, fill=1, stroke=1)

        # Title
        title = self.title
        if not title and self.run_data:
            title = self.run_data.get("project_name", "Untitled Project")
        if not title:
            title = "Architectural Design"

        c.setFont("Helvetica-Bold", 16)
        c.setFillColor(colors.black)
        c.drawString(panel.x + 10, panel.y + panel.height - 25, title)

        # Metadata row
        c.setFont("Helvetica", 9)
        y = panel.y + 10

        # Client
        if self.client:
            c.drawString(panel.x + 10, y, f"Client: {self.client}")

        # Project number
        if self.project_number:
            c.drawString(panel.x + 200, y, f"Project: {self.project_number}")

        # Scale
        c.drawString(panel.x + 400, y, f"Scale: {format_scale(self.chosen_scale)}")

        # Date
        date_str = datetime.now().strftime("%Y-%m-%d")
        c.drawString(panel.x + 500, y, f"Date: {date_str}")

        # Total area
        if self.plan_data:
            stats = self.plan_data.get("statistics", {})
            area = stats.get("total_area_m2", 0)
            if area > 0:
                c.drawString(panel.x + 620, y, f"Area: {area:.1f} m²")

        # Seed
        if self.run_data:
            seed = self.run_data.get("seed")
            if seed:
                c.drawString(panel.x + 720, y, f"Seed: {seed}")

    def _draw_north_arrow(self, c: Any) -> None:
        """Draw north arrow on floor plan panel."""
        panel = self.panels["floor_plan"]

        # Position in top-right of floor plan panel
        x = panel.x + panel.width - 30
        y = panel.y + panel.height - 30

        # Get north direction from metadata
        north_dir = 0
        if self.plan_data:
            metadata = self.plan_data.get("metadata", {})
            north_dir = metadata.get("north_direction", 0)

        c.saveState()
        c.translate(x, y)
        c.rotate(north_dir)

        # Draw arrow
        c.setFillColor(colors.black)
        c.setStrokeColor(colors.black)
        c.setLineWidth(1)

        # Arrow body
        path = c.beginPath()
        path.moveTo(0, -15)
        path.lineTo(5, 10)
        path.lineTo(0, 5)
        path.lineTo(-5, 10)
        path.close()
        c.drawPath(path, fill=1)

        # N label
        c.setFont("Helvetica-Bold", 10)
        c.drawCentredString(0, -25, "N")

        c.restoreState()

    def _draw_scale_bar(self, c: Any) -> None:
        """Draw scale bar on floor plan panel."""
        panel = self.panels["floor_plan"]

        # Position at bottom of floor plan panel
        x = panel.x + 20
        y = panel.y + 20

        # Calculate bar length for 1 meter at current scale
        # At 1:100, 1m = 10mm on paper
        bar_length_mm = 1000 / self.chosen_scale
        bar_length_pt = mm_to_points(bar_length_mm)

        c.saveState()
        c.setStrokeColor(colors.black)
        c.setFillColor(colors.black)
        c.setLineWidth(2)

        # Main bar
        c.line(x, y, x + bar_length_pt, y)

        # End ticks
        c.setLineWidth(1)
        c.line(x, y - 5, x, y + 5)
        c.line(x + bar_length_pt, y - 5, x + bar_length_pt, y + 5)

        # Label
        c.setFont("Helvetica", 8)
        c.drawCentredString(x + bar_length_pt / 2, y - 12, "1m")
        c.drawCentredString(x + bar_length_pt / 2, y + 8, format_scale(self.chosen_scale))

        c.restoreState()

    def _write_manifest(self) -> None:
        """Write sheet_manifest.json."""
        manifest_path = self.output_path.parent / "sheet_manifest.json"

        self.manifest.update({
            "version": "4.0.0",
            "phase": "a1_assembler",
            "generated_at": datetime.now().isoformat(),
            "page": {
                "format": "A1",
                "orientation": self.orientation,
                "width_mm": self.layout.page_width_mm,
                "height_mm": self.layout.page_height_mm,
                "width_pt": self.layout.page_width_pt,
                "height_pt": self.layout.page_height_pt,
            },
            "scale": {
                "chosen": format_scale(self.chosen_scale),
                "auto_selected": self.explicit_scale is None,
                "available": [format_scale(s) for s in ARCHITECTURAL_SCALES],
            },
            "title_block": {
                "title": self.title or "Untitled",
                "client": self.client,
                "project_number": self.project_number,
                "total_area_m2": self.plan_data.get("statistics", {}).get("total_area_m2", 0)
                                 if self.plan_data else 0,
                "scale": format_scale(self.chosen_scale),
                "date": datetime.now().strftime("%Y-%m-%d"),
                "seed": self.run_data.get("seed") if self.run_data else None,
            },
            "warnings": self.warnings,
            "inputs": {
                "plan_json": {
                    "path": "plan.json",
                    "exists": (self.run_path / "plan.json").exists(),
                    "hash": hash_file(self.run_path / "plan.json")
                            if (self.run_path / "plan.json").exists() else None,
                },
                "run_json": {
                    "path": "run.json",
                    "exists": (self.run_path / "run.json").exists(),
                    "hash": hash_file(self.run_path / "run.json")
                            if (self.run_path / "run.json").exists() else None,
                },
            },
        })

        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(self.manifest, f, indent=2)

        self._log(f"Manifest written: {manifest_path}")
