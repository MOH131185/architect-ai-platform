from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

from app.core.logging import get_logger
from app.schemas.archcad import (
    ArchCADBoundingBox,
    ArchCADElement,
    ArchCADManifestRecord,
    ArchCADModalityRefs,
    ArchCADPoint,
    ArchCADQA,
    ArchCADSample,
    ArchCADSampleStats,
)
from app.utils.file_refs import load_json, read_bytes, read_text

logger = get_logger(__name__)


def normalize_semantic(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = (
        str(value)
        .strip()
        .lower()
        .replace("-", "_")
        .replace(" ", "_")
    )
    return normalized or None


class ArchCADNormalizer:
    """Normalize ArchCAD raw modalities into a unified sample schema."""

    def normalize_sample(self, record: ArchCADManifestRecord) -> ArchCADSample:
        modalities = ArchCADModalityRefs(**record.file_paths)
        elements = self._parse_json_elements(record.file_paths.get("json"))
        if not elements:
            elements = self._parse_svg_elements(record.file_paths.get("svg"))

        qa_pairs = self._parse_qa_pairs(record.file_paths.get("qa"))
        pointcloud_metadata = self._parse_pointcloud_metadata(record.file_paths.get("pointcloud"))
        stats = self._build_stats(elements, qa_pairs)

        return ArchCADSample(
            sample_id=record.sample_id,
            split=record.split,
            modalities=modalities,
            elements=elements,
            qa_pairs=qa_pairs,
            stats=stats,
            validation_flags=record.validation_flags,
            metadata={
                "pointcloud": pointcloud_metadata,
                "source_files": record.file_paths,
            },
        )

    def _parse_json_elements(self, file_ref: str | None) -> list[ArchCADElement]:
        if not file_ref:
            return []
        payload = load_json(file_ref)
        raw_elements = []
        if isinstance(payload, list):
            raw_elements = payload
        elif isinstance(payload, dict):
            raw_elements = payload.get("elements") or payload.get("primitives") or payload.get("objects") or []

        elements: list[ArchCADElement] = []
        for raw in raw_elements:
            if not isinstance(raw, dict):
                continue
            elements.append(self._normalize_json_element(raw))
        return elements

    def _normalize_json_element(self, raw: dict[str, Any]) -> ArchCADElement:
        element_type = str(raw.get("type") or "UNKNOWN").upper()
        geometry: dict[str, Any]

        if element_type == "LINE":
            geometry = {
                "start": self._point_to_dict(raw.get("start")),
                "end": self._point_to_dict(raw.get("end")),
            }
        elif element_type == "CIRCLE":
            geometry = {
                "center": self._point_to_dict(raw.get("center")),
                "radius": raw.get("radius"),
            }
        elif element_type == "ARC":
            geometry = {
                "center": self._point_to_dict(raw.get("center")),
                "radius": raw.get("radius"),
                "start_angle": raw.get("start_angle") or raw.get("startAngle"),
                "end_angle": raw.get("end_angle") or raw.get("endAngle"),
            }
        elif element_type == "POLYLINE":
            geometry = {
                "points": [self._point_to_dict(point) for point in raw.get("points") or raw.get("vertices") or []],
            }
        else:
            geometry = {
                key: raw.get(key)
                for key in ("start", "end", "center", "radius", "points", "vertices", "path")
                if key in raw
            } or {"raw": raw}

        style = {
            key: raw.get(key)
            for key in ("linetype", "rgb", "layer", "color", "lineweight", "stroke_width")
            if key in raw
        }
        extra_keys = set(raw) - {
            "id",
            "handle",
            "type",
            "semantic",
            "instance",
            "start",
            "end",
            "center",
            "radius",
            "points",
            "vertices",
            "linetype",
            "rgb",
            "layer",
            "color",
            "lineweight",
            "stroke_width",
            "start_angle",
            "startAngle",
            "end_angle",
            "endAngle",
        }
        if extra_keys:
            style["raw"] = {key: raw[key] for key in sorted(extra_keys)}

        return ArchCADElement(
            element_id=str(raw.get("id") or raw.get("handle") or raw.get("instance") or ""),
            type=element_type,
            semantic=normalize_semantic(raw.get("semantic")),
            instance=normalize_semantic(raw.get("instance")),
            geometry=geometry,
            style=style,
            bounding_box=self._bbox_from_geometry(element_type, geometry),
            source_modality="json",
        )

    def _parse_svg_elements(self, file_ref: str | None) -> list[ArchCADElement]:
        if not file_ref:
            return []
        try:
            root = ElementTree.fromstring(read_text(file_ref))
        except ElementTree.ParseError as exc:
            logger.warning(
                "Failed to parse SVG modality",
                extra={"context": {"file_ref": file_ref, "error": str(exc)}},
            )
            return []

        elements: list[ArchCADElement] = []
        for node in root.iter():
            tag = node.tag.split("}")[-1].lower()
            if tag not in {"line", "polyline", "polygon", "circle", "ellipse", "rect", "path"}:
                continue

            semantic = normalize_semantic(
                node.attrib.get("semantic") or node.attrib.get("data-semantic") or node.attrib.get("class")
            )
            instance = normalize_semantic(
                node.attrib.get("instance") or node.attrib.get("data-instance") or node.attrib.get("id")
            )
            style = {
                key: value
                for key, value in node.attrib.items()
                if key in {"stroke", "fill", "stroke-width", "class"}
            }

            geometry: dict[str, Any]
            bbox: ArchCADBoundingBox | None
            if tag == "line":
                geometry = {
                    "start": {"x": self._safe_float(node.attrib.get("x1")), "y": self._safe_float(node.attrib.get("y1"))},
                    "end": {"x": self._safe_float(node.attrib.get("x2")), "y": self._safe_float(node.attrib.get("y2"))},
                }
                bbox = self._bbox_from_points([geometry["start"], geometry["end"]])
            elif tag in {"polyline", "polygon"}:
                points = self._parse_svg_points(node.attrib.get("points", ""))
                geometry = {"points": points}
                bbox = self._bbox_from_points(points)
            elif tag == "circle":
                geometry = {
                    "center": {"x": self._safe_float(node.attrib.get("cx")), "y": self._safe_float(node.attrib.get("cy"))},
                    "radius": self._safe_float(node.attrib.get("r")),
                }
                bbox = self._bbox_from_geometry("CIRCLE", geometry)
            elif tag == "rect":
                x = self._safe_float(node.attrib.get("x"))
                y = self._safe_float(node.attrib.get("y"))
                width = self._safe_float(node.attrib.get("width"))
                height = self._safe_float(node.attrib.get("height"))
                geometry = {"x": x, "y": y, "width": width, "height": height}
                bbox = ArchCADBoundingBox(min_x=x, min_y=y, max_x=x + width, max_y=y + height)
            else:
                geometry = {"d": node.attrib.get("d")}
                bbox = None

            elements.append(
                ArchCADElement(
                    element_id=node.attrib.get("id"),
                    type=tag.upper(),
                    semantic=semantic,
                    instance=instance,
                    geometry=geometry,
                    style=style,
                    bounding_box=bbox,
                    source_modality="svg",
                )
            )

        return elements

    def _parse_qa_pairs(self, file_ref: str | None) -> list[ArchCADQA]:
        if not file_ref:
            return []

        suffix = self._suffix(file_ref)
        if suffix == ".jsonl":
            qa_pairs = []
            for line in read_text(file_ref).splitlines():
                if not line.strip():
                    continue
                item = load_json_from_line(line)
                if not isinstance(item, dict):
                    continue
                question = item.get("question") or item.get("q")
                answer = item.get("answer") or item.get("a")
                if question and answer:
                    qa_pairs.append(
                        ArchCADQA(
                            question=str(question).strip(),
                            answer=str(answer).strip(),
                            metadata={
                                key: value
                                for key, value in item.items()
                                if key not in {"question", "q", "answer", "a"}
                            },
                        )
                    )
            return qa_pairs

        if suffix == ".json":
            payload = load_json(file_ref)
            if isinstance(payload, dict):
                candidates = payload.get("qa_pairs") or payload.get("qas") or payload.get("items") or []
            else:
                candidates = payload

            qa_pairs = []
            for item in candidates or []:
                if not isinstance(item, dict):
                    continue
                question = item.get("question") or item.get("q")
                answer = item.get("answer") or item.get("a")
                if not question or not answer:
                    continue
                qa_pairs.append(
                    ArchCADQA(
                        question=str(question).strip(),
                        answer=str(answer).strip(),
                        metadata={
                            key: value
                            for key, value in item.items()
                            if key not in {"question", "q", "answer", "a"}
                        },
                    )
                )
            return qa_pairs

        text = read_text(file_ref).replace("\\n", "\n")
        qa_pairs: list[ArchCADQA] = []
        current_question: str | None = None
        for raw_line in text.splitlines():
            line = raw_line.strip().lstrip("-").strip()
            if not line:
                continue
            lower = line.lower()
            if lower.startswith("question:") or lower.startswith("q:"):
                current_question = line.split(":", 1)[1].strip()
                continue
            if lower.startswith("answer:") or lower.startswith("a:"):
                answer = line.split(":", 1)[1].strip()
                if current_question:
                    qa_pairs.append(ArchCADQA(question=current_question, answer=answer))
                    current_question = None

        return qa_pairs

    def _parse_pointcloud_metadata(self, file_ref: str | None) -> dict[str, Any]:
        if not file_ref:
            return {}

        suffix = self._suffix(file_ref)
        payload = {"file_ref": file_ref, "format": suffix.lstrip(".")}

        if suffix == ".json":
            raw = load_json(file_ref)
            if isinstance(raw, dict):
                payload["keys"] = sorted(raw.keys())
                points = raw.get("points")
                if isinstance(points, list):
                    payload["point_count"] = len(points)
            elif isinstance(raw, list):
                payload["point_count"] = len(raw)
        elif suffix in {".txt", ".csv", ".pts"}:
            point_lines = [line for line in read_text(file_ref).splitlines() if line.strip()]
            payload["point_count"] = len(point_lines)
        else:
            payload["byte_size"] = len(read_bytes(file_ref))

        # TODO: Add native numpy/ply point loading for training and embedding pipelines.
        return payload

    def _build_stats(
        self,
        elements: list[ArchCADElement],
        qa_pairs: list[ArchCADQA],
    ) -> ArchCADSampleStats:
        semantic_counts = Counter(element.semantic for element in elements if element.semantic)
        instance_counts = Counter(element.instance for element in elements if element.instance)
        return ArchCADSampleStats(
            element_count=len(elements),
            semantic_counts=dict(semantic_counts),
            instance_counts=dict(instance_counts),
            qa_count=len(qa_pairs),
        )

    def _point_to_dict(self, value: Any) -> dict[str, float] | None:
        point = self._coerce_point(value)
        return point.model_dump() if point else None

    def _coerce_point(self, value: Any) -> ArchCADPoint | None:
        if value is None:
            return None
        if isinstance(value, (list, tuple)) and len(value) >= 2:
            return ArchCADPoint(
                x=float(value[0]),
                y=float(value[1]),
                z=float(value[2]) if len(value) > 2 else None,
            )
        if isinstance(value, dict) and {"x", "y"}.issubset(value):
            return ArchCADPoint(
                x=float(value["x"]),
                y=float(value["y"]),
                z=float(value["z"]) if value.get("z") is not None else None,
            )
        return None

    def _bbox_from_geometry(
        self,
        element_type: str,
        geometry: dict[str, Any],
    ) -> ArchCADBoundingBox | None:
        if element_type == "LINE":
            return self._bbox_from_points([geometry.get("start"), geometry.get("end")])
        if element_type == "CIRCLE":
            center = geometry.get("center")
            radius = geometry.get("radius")
            if center and radius is not None:
                return ArchCADBoundingBox(
                    min_x=float(center["x"]) - float(radius),
                    min_y=float(center["y"]) - float(radius),
                    max_x=float(center["x"]) + float(radius),
                    max_y=float(center["y"]) + float(radius),
                )
        if element_type == "ARC":
            center = geometry.get("center")
            radius = geometry.get("radius")
            if center and radius is not None:
                return ArchCADBoundingBox(
                    min_x=float(center["x"]) - float(radius),
                    min_y=float(center["y"]) - float(radius),
                    max_x=float(center["x"]) + float(radius),
                    max_y=float(center["y"]) + float(radius),
                )
        if element_type == "POLYLINE":
            return self._bbox_from_points(geometry.get("points") or [])
        return None

    def _bbox_from_points(self, points: list[dict[str, Any] | None]) -> ArchCADBoundingBox | None:
        normalized_points = [
            (float(point["x"]), float(point["y"]))
            for point in points
            if point and point.get("x") is not None and point.get("y") is not None
        ]
        if not normalized_points:
            return None
        xs = [point[0] for point in normalized_points]
        ys = [point[1] for point in normalized_points]
        return ArchCADBoundingBox(min_x=min(xs), min_y=min(ys), max_x=max(xs), max_y=max(ys))

    def _parse_svg_points(self, raw_points: str) -> list[dict[str, float]]:
        points: list[dict[str, float]] = []
        for pair in raw_points.strip().split():
            if "," not in pair:
                continue
            x, y = pair.split(",", 1)
            points.append({"x": self._safe_float(x), "y": self._safe_float(y)})
        return points

    def _safe_float(self, value: Any) -> float:
        if value is None:
            return 0.0
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    def _suffix(self, file_ref: str) -> str:
        if file_ref.startswith("zip://") and "::" in file_ref:
            return Path(file_ref.split("::", 1)[1]).suffix.lower()
        return Path(file_ref).suffix.lower()


def load_json_from_line(line: str) -> Any:
    return json.loads(line)
