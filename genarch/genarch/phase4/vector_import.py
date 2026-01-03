"""
Vector Import Module

Handles SVG and DXF loading, conversion, and scaling for vector floor plan
embedding in A1 PDF sheets.

Fallback chain:
1. plan.svg -> embed directly
2. plan.dxf -> convert to SVG using ezdxf
3. Last resort: rasterize DXF to high-res PNG
"""

import tempfile
from pathlib import Path
from typing import Optional, Tuple, Any

try:
    from svglib.svglib import svg2rlg
    from reportlab.graphics import renderPDF
    from reportlab.graphics.shapes import Drawing
except ImportError:
    svg2rlg = None
    renderPDF = None
    Drawing = None

try:
    import ezdxf
    from ezdxf.addons.drawing import Frontend, RenderContext
    from ezdxf.addons.drawing.matplotlib import MatplotlibBackend
except ImportError:
    ezdxf = None


def load_svg(path: Path) -> Optional[Any]:
    """
    Load SVG file using svglib.

    Args:
        path: Path to SVG file

    Returns:
        ReportLab Drawing object or None if load fails
    """
    if svg2rlg is None:
        raise ImportError("svglib is required: pip install svglib")

    try:
        drawing = svg2rlg(str(path))
        return drawing
    except Exception as e:
        print(f"Warning: Could not load SVG {path}: {e}")
        return None


def get_svg_bbox(drawing: Any) -> Tuple[float, float, float, float]:
    """
    Get bounding box of SVG drawing.

    Args:
        drawing: ReportLab Drawing object

    Returns:
        Tuple of (min_x, min_y, width, height) in SVG units
    """
    if drawing is None:
        return (0, 0, 0, 0)

    # ReportLab Drawing has width and height attributes
    return (0, 0, drawing.width, drawing.height)


def convert_dxf_to_svg(
    dxf_path: Path,
    svg_path: Optional[Path] = None,
    bg_color: str = "#FFFFFF",
) -> Optional[Path]:
    """
    Convert DXF file to SVG using ezdxf.

    Args:
        dxf_path: Path to DXF file
        svg_path: Output SVG path (default: temp file)
        bg_color: Background color (default: white)

    Returns:
        Path to SVG file or None if conversion fails
    """
    if ezdxf is None:
        raise ImportError("ezdxf is required: pip install ezdxf[draw]")

    try:
        # Read DXF file
        doc = ezdxf.readfile(str(dxf_path))
        msp = doc.modelspace()

        # Create render context
        ctx = RenderContext(doc)

        # Determine output path
        if svg_path is None:
            fd, svg_path = tempfile.mkstemp(suffix=".svg")
            svg_path = Path(svg_path)

        # Use matplotlib backend to render to SVG
        try:
            import matplotlib
            matplotlib.use("Agg")  # Non-interactive backend
            import matplotlib.pyplot as plt

            fig = plt.figure()
            ax = fig.add_axes([0, 0, 1, 1])
            ax.set_aspect("equal")

            backend = MatplotlibBackend(ax)
            Frontend(ctx, backend).draw_layout(msp)

            fig.savefig(str(svg_path), format="svg")
            plt.close(fig)

            return svg_path

        except ImportError:
            print("Warning: matplotlib not available for DXF->SVG conversion")
            return None

    except Exception as e:
        print(f"Warning: Could not convert DXF {dxf_path}: {e}")
        return None


def scale_drawing_to_panel(
    drawing: Any,
    bbox_m: Tuple[float, float],
    scale: int,
    panel_width_pt: float,
    panel_height_pt: float,
    margin_pt: float = 10,
) -> Any:
    """
    Scale and transform SVG drawing to fit panel.

    Args:
        drawing: ReportLab Drawing object
        bbox_m: Bounding box in meters (width, height)
        scale: Architectural scale (e.g., 100 for 1:100)
        panel_width_pt: Panel width in points
        panel_height_pt: Panel height in points
        margin_pt: Margin inside panel in points

    Returns:
        Transformed Drawing object
    """
    if drawing is None:
        return None

    # Get original drawing dimensions
    orig_width = drawing.width
    orig_height = drawing.height

    if orig_width == 0 or orig_height == 0:
        return drawing

    # Calculate available panel space
    available_width = panel_width_pt - 2 * margin_pt
    available_height = panel_height_pt - 2 * margin_pt

    # Calculate scaled dimensions in mm, then convert to points
    # At scale 1:N, 1 meter becomes 1000/N mm
    mm_per_m = 1000 / scale
    scaled_width_mm = bbox_m[0] * mm_per_m
    scaled_height_mm = bbox_m[1] * mm_per_m

    # Convert to points (mm * 72 / 25.4)
    scaled_width_pt = scaled_width_mm * 72 / 25.4
    scaled_height_pt = scaled_height_mm * 72 / 25.4

    # Calculate scale factor to fit in panel
    scale_x = min(available_width / scaled_width_pt, 1.0) if scaled_width_pt > 0 else 1.0
    scale_y = min(available_height / scaled_height_pt, 1.0) if scaled_height_pt > 0 else 1.0
    fit_scale = min(scale_x, scale_y)

    # Also scale from SVG units to target points
    svg_to_pt_scale_x = scaled_width_pt / orig_width if orig_width > 0 else 1.0
    svg_to_pt_scale_y = scaled_height_pt / orig_height if orig_height > 0 else 1.0
    svg_to_pt_scale = min(svg_to_pt_scale_x, svg_to_pt_scale_y)

    total_scale = svg_to_pt_scale * fit_scale

    # Apply transformation
    drawing.scale(total_scale, total_scale)

    # Center in panel
    new_width = orig_width * total_scale
    new_height = orig_height * total_scale
    offset_x = margin_pt + (available_width - new_width) / 2
    offset_y = margin_pt + (available_height - new_height) / 2

    drawing.translate(offset_x, offset_y)

    return drawing


def render_drawing_to_pdf(
    canvas: Any,
    drawing: Any,
    x: float,
    y: float,
) -> bool:
    """
    Render ReportLab Drawing to PDF canvas.

    Args:
        canvas: ReportLab Canvas object
        drawing: ReportLab Drawing object
        x: X position on canvas in points
        y: Y position on canvas in points

    Returns:
        True if successful, False otherwise
    """
    if renderPDF is None:
        raise ImportError("reportlab is required: pip install reportlab")

    if drawing is None:
        return False

    try:
        renderPDF.draw(drawing, canvas, x, y)
        return True
    except Exception as e:
        print(f"Warning: Could not render drawing: {e}")
        return False


def rasterize_dxf_to_png(
    dxf_path: Path,
    png_path: Optional[Path] = None,
    dpi: int = 300,
    width_px: int = 4000,
) -> Optional[Path]:
    """
    Rasterize DXF to high-resolution PNG as last resort.

    Args:
        dxf_path: Path to DXF file
        png_path: Output PNG path (default: temp file)
        dpi: Resolution for rasterization
        width_px: Target width in pixels

    Returns:
        Path to PNG file or None if rasterization fails
    """
    if ezdxf is None:
        raise ImportError("ezdxf is required: pip install ezdxf[draw]")

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        # Read DXF file
        doc = ezdxf.readfile(str(dxf_path))
        msp = doc.modelspace()

        # Create render context
        ctx = RenderContext(doc)

        # Determine output path
        if png_path is None:
            fd, png_path = tempfile.mkstemp(suffix=".png")
            png_path = Path(png_path)

        # Create figure
        fig = plt.figure(dpi=dpi)
        ax = fig.add_axes([0, 0, 1, 1])
        ax.set_aspect("equal")

        backend = MatplotlibBackend(ax)
        Frontend(ctx, backend).draw_layout(msp)

        fig.savefig(str(png_path), format="png", dpi=dpi, bbox_inches="tight")
        plt.close(fig)

        return png_path

    except Exception as e:
        print(f"Warning: Could not rasterize DXF {dxf_path}: {e}")
        return None


def get_plan_bbox_meters(plan_data: dict) -> Tuple[float, float]:
    """
    Calculate bounding box of floor plan in meters from plan.json data.

    Args:
        plan_data: Parsed plan.json data

    Returns:
        Tuple of (width_m, height_m)
    """
    envelope = plan_data.get("envelope", [])
    if not envelope:
        # Fallback to statistics
        stats = plan_data.get("statistics", {})
        area_m2 = stats.get("total_area_m2", 100)
        # Assume square-ish
        side = area_m2 ** 0.5
        return (side, side)

    # Find min/max from envelope
    xs = [p.get("x", 0) for p in envelope]
    ys = [p.get("y", 0) for p in envelope]

    if not xs or not ys:
        return (10, 10)  # Default fallback

    width = max(xs) - min(xs)
    height = max(ys) - min(ys)

    return (width, height)
