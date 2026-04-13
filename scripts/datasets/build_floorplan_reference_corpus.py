#!/usr/bin/env python3
"""Build a compact floor-plan reference corpus for prompt conditioning.

This script distills the local HouseExpo archive into a small JS module that can
be imported by the React app. It also carries lightweight Roboflow dataset
metadata so the prompt layer can reference floor-plan symbol vocabularies
without bundling raw images or annotations.
"""

from __future__ import annotations

import argparse
import json
import statistics
import subprocess
import tarfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_HOUSEEXPO_ARCHIVE = (
    REPO_ROOT / "data" / "external" / "HouseExpo" / "HouseExpo" / "json.tar.gz"
)
DEFAULT_OUTPUT = REPO_ROOT / "src" / "data" / "floorPlanReferenceCorpus.js"

CATEGORY_ALIASES = {
    "living_room": "living_room",
    "dining_room": "dining_room",
    "bedroom": "bedroom",
    "child_room": "bedroom",
    "master_bedroom": "bedroom",
    "kitchen": "kitchen",
    "bathroom": "bathroom",
    "toilet": "wc",
    "hallway": "hallway",
    "hall": "hallway",
    "lobby": "hallway",
    "room": "flex_room",
    "storage": "storage",
    "loggia": "balcony",
    "balcony": "balcony",
    "terrace": "terrace",
    "office": "office",
    "wardrobe": "wardrobe",
    "garage": "garage",
    "gym": "gym",
}

ROBOFLOW_PROFILES = [
    {
        "id": "floor_plan_objects",
        "title": "Floor_Plan_Objects",
        "datasetUrl": "https://universe.roboflow.com/floor-plan-rendering/floor_plan_objects",
        "task": "object-detection",
        "license": "CC BY 4.0",
        "intendedUse": "technical floor-plan symbol priors and object vocabulary",
        "symbolFamilies": [
            "doors",
            "windows",
            "stairs",
            "toilets",
            "sinks",
            "showers",
            "kitchen_appliances",
            "beds",
            "sofas",
            "wardrobes",
            "study_tables",
        ],
        "note": (
            "Symbol families are distilled from public floor-plan object datasets. "
            "If you export a local Roboflow snapshot, enrich this profile with exact class names."
        ),
    },
    {
        "id": "door_object_detection",
        "title": "Door Object Detection",
        "datasetUrl": "https://universe.roboflow.com/architecture-plan/door-object-detection",
        "task": "object-detection",
        "license": "CC BY 4.0",
        "intendedUse": "door-placement and opening-symbol priors",
        "symbolFamilies": ["doors"],
        "note": "Small focused dataset for opening detection in architectural plans.",
    },
]


def normalize_category(raw_category: str) -> str:
    key = raw_category.strip().lower().replace(" ", "_")
    return CATEGORY_ALIASES.get(key, key)


def iter_houseexpo_members(archive_path: Path, max_plans: int | None) -> Iterable[dict]:
    with tarfile.open(archive_path, "r:gz") as archive:
        processed = 0
        for member in archive:
            if not member.isfile() or not member.name.endswith(".json"):
                continue
            handle = archive.extractfile(member)
            if handle is None:
                continue
            yield json.load(handle)
            processed += 1
            if max_plans and processed >= max_plans:
                break


def safe_bbox_area(box: list[float]) -> float:
    if not isinstance(box, list) or len(box) != 4:
        return 0.0
    x1, y1, x2, y2 = box
    return max(0.0, float(x2) - float(x1)) * max(0.0, float(y2) - float(y1))


def format_examples(plans: list[dict]) -> list[dict]:
    if not plans:
        return []

    targets = [4, 6, 8, 10, 12]
    chosen_ids: set[str] = set()
    examples: list[dict] = []

    def plan_score(plan: dict, target: int) -> tuple[float, float]:
        return (
            abs(plan["roomCount"] - target),
            abs(plan["bboxMeters"]["width"] - plan["bboxMeters"]["depth"]),
        )

    for target in targets:
        candidates = [
            plan for plan in plans if plan["id"] not in chosen_ids and plan["roomCount"] >= 3
        ]
        if not candidates:
            continue
        selected = min(candidates, key=lambda plan: plan_score(plan, target))
        chosen_ids.add(selected["id"])
        examples.append(selected)

    if len(examples) >= 6:
        return examples

    for plan in sorted(plans, key=lambda item: (item["roomCount"], item["id"])):
        if plan["id"] in chosen_ids:
            continue
        chosen_ids.add(plan["id"])
        examples.append(plan)
        if len(examples) >= 6:
            break

    return examples


def get_houseexpo_commit(archive_path: Path) -> str | None:
    repo_root = archive_path.parents[1]
    git_dir = repo_root / ".git"
    if not git_dir.exists():
        return None

    try:
        result = subprocess.run(
            ["git", "-C", str(repo_root), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        )
        return result.stdout.strip()
    except Exception:
        return None


def build_summary(archive_path: Path, max_plans: int | None = None) -> dict:
    room_counts: list[int] = []
    bbox_widths: list[float] = []
    bbox_depths: list[float] = []
    category_instance_counts: Counter[str] = Counter()
    category_plan_counts: Counter[str] = Counter()
    category_area_samples: dict[str, list[float]] = defaultdict(list)
    example_candidates: list[dict] = []

    for plan in iter_houseexpo_members(archive_path, max_plans):
        bbox = plan.get("bbox") or {}
        bbox_min = bbox.get("min") or [0, 0]
        bbox_max = bbox.get("max") or [0, 0]
        width = round(max(0.0, float(bbox_max[0]) - float(bbox_min[0])), 2)
        depth = round(max(0.0, float(bbox_max[1]) - float(bbox_min[1])), 2)
        room_count = int(plan.get("room_num") or 0)
        room_counts.append(room_count)
        bbox_widths.append(width)
        bbox_depths.append(depth)

        plan_categories: dict[str, int] = {}
        raw_categories = plan.get("room_category") or {}
        for raw_category, boxes in raw_categories.items():
            normalized = normalize_category(raw_category)
            box_list = boxes if isinstance(boxes, list) else []
            category_instance_counts[normalized] += len(box_list)
            plan_categories[normalized] = plan_categories.get(normalized, 0) + len(box_list)
            if box_list:
                category_area_samples[normalized].append(
                    round(sum(safe_bbox_area(box) for box in box_list), 2)
                )

        for category in plan_categories:
            category_plan_counts[category] += 1

        example_candidates.append(
            {
                "id": plan.get("id"),
                "roomCount": room_count,
                "bboxMeters": {"width": width, "depth": depth},
                "categories": [
                    {"category": category, "count": count}
                    for category, count in sorted(
                        plan_categories.items(), key=lambda item: (-item[1], item[0])
                    )
                ],
            }
        )

    sorted_counts = sorted(room_counts)
    plan_count = len(room_counts)
    if plan_count == 0:
        raise RuntimeError(f"No HouseExpo plans found in {archive_path}")

    def percentile(ratio: float) -> int:
        index = min(plan_count - 1, max(0, int(round((plan_count - 1) * ratio))))
        return sorted_counts[index]

    top_categories = []
    for category, instances in category_instance_counts.most_common(12):
        top_categories.append(
            {
                "category": category,
                "instanceCount": instances,
                "planCount": category_plan_counts[category],
                "planShare": round(category_plan_counts[category] / plan_count, 4),
                "meanApproxAreaM2": round(
                    statistics.mean(category_area_samples[category]), 2
                )
                if category_area_samples[category]
                else 0,
            }
        )

    summary = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "houseExpo": {
            "source": {
                "repoUrl": "https://github.com/TeaganLi/HouseExpo",
                "archivePath": str(archive_path.relative_to(REPO_ROOT)).replace("\\", "/"),
                "repositoryCommit": get_houseexpo_commit(archive_path),
                "license": "MIT",
            },
            "stats": {
                "planCount": plan_count,
                "roomCount": {
                    "mean": round(statistics.mean(room_counts), 2),
                    "median": statistics.median(room_counts),
                    "p10": percentile(0.10),
                    "p90": percentile(0.90),
                },
                "bboxMeters": {
                    "meanWidth": round(statistics.mean(bbox_widths), 2),
                    "meanDepth": round(statistics.mean(bbox_depths), 2),
                },
                "topCategories": top_categories,
            },
            "referenceExamples": format_examples(example_candidates),
        },
        "roboflowProfiles": ROBOFLOW_PROFILES,
    }
    return summary


def write_js_module(output_path: Path, payload: dict) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(payload, indent=2, sort_keys=False)
    output_path.write_text(
        "export const floorPlanReferenceCorpus = "
        + body
        + ";\n\nexport default floorPlanReferenceCorpus;\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--houseexpo-tar",
        type=Path,
        default=DEFAULT_HOUSEEXPO_ARCHIVE,
        help="Path to HouseExpo json.tar.gz archive",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Target JS module path",
    )
    parser.add_argument(
        "--max-plans",
        type=int,
        default=None,
        help="Optional limit for faster local iteration",
    )
    args = parser.parse_args()

    summary = build_summary(args.houseexpo_tar, max_plans=args.max_plans)
    write_js_module(args.output, summary)

    print(
        f"Wrote floor-plan reference corpus with "
        f"{summary['houseExpo']['stats']['planCount']} plans to {args.output}"
    )


if __name__ == "__main__":
    main()
