"""
Run metadata for tracking generation parameters.

Records the seed, units, timestamp, and other metadata for reproducibility.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, Any


@dataclass
class RunMetadata:
    """
    Metadata for a generation run.

    Attributes:
        seed: Random seed used for deterministic generation
        units: Input/output units (default: meters)
        north_direction: Degrees from Y-axis to north (0 = Y is north)
        generation_timestamp: ISO 8601 timestamp of generation
        version: genarch package version
        validation_results: Dictionary of validation pass/fail status
        statistics: Dictionary of generation statistics
    """
    seed: int
    units: str = "meters"
    north_direction: float = 0.0
    generation_timestamp: str = field(
        default_factory=lambda: datetime.utcnow().isoformat() + "Z"
    )
    version: str = "0.1.0"
    validation_results: Dict[str, bool] = field(default_factory=dict)
    statistics: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict) -> RunMetadata:
        return cls(
            seed=data["seed"],
            units=data.get("units", "meters"),
            north_direction=data.get("north_direction", 0.0),
            generation_timestamp=data.get(
                "generation_timestamp",
                datetime.utcnow().isoformat() + "Z"
            ),
            version=data.get("version", "0.1.0"),
            validation_results=data.get("validation_results", {}),
            statistics=data.get("statistics", {}),
        )

    @classmethod
    def from_json(cls, path: Path | str) -> RunMetadata:
        """Load metadata from JSON file."""
        with open(path, "r") as f:
            data = json.load(f)
        return cls.from_dict(data)

    def to_dict(self) -> dict:
        return {
            "seed": self.seed,
            "units": self.units,
            "north_direction": self.north_direction,
            "generation_timestamp": self.generation_timestamp,
            "version": self.version,
            "validation_results": self.validation_results,
            "statistics": self.statistics,
        }

    def to_json(self, path: Path | str) -> None:
        """Save metadata to JSON file."""
        with open(path, "w") as f:
            json.dump(self.to_dict(), f, indent=2)

    def add_validation_result(self, name: str, passed: bool) -> None:
        """Add a validation result."""
        self.validation_results[name] = passed

    def add_statistic(self, name: str, value: Any) -> None:
        """Add a statistic."""
        self.statistics[name] = value

    @property
    def all_validations_passed(self) -> bool:
        """Check if all validations passed."""
        return all(self.validation_results.values()) if self.validation_results else True
