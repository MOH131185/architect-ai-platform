"""
Pipeline Cache - Skip phases if outputs exist and inputs unchanged.

Uses file hashes to detect changes and determine if a phase needs to re-run.
"""

import hashlib
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any


class PipelineCache:
    """
    Manages caching for pipeline phases.

    Tracks input hashes and output file existence to skip phases
    when inputs haven't changed.
    """

    CACHE_FILE = ".pipeline_cache.json"

    def __init__(self, run_path: Path):
        """
        Initialize cache for a run folder.

        Args:
            run_path: Path to run folder
        """
        self.run_path = Path(run_path)
        self.cache_path = self.run_path / self.CACHE_FILE
        self.cache_data = self._load_cache()

    def _load_cache(self) -> Dict[str, Any]:
        """Load cache from disk."""
        if self.cache_path.exists():
            try:
                with open(self.cache_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError):
                return {}
        return {}

    def _save_cache(self) -> None:
        """Save cache to disk."""
        self.run_path.mkdir(parents=True, exist_ok=True)
        with open(self.cache_path, "w", encoding="utf-8") as f:
            json.dump(self.cache_data, f, indent=2)

    @staticmethod
    def hash_file(path: Path) -> Optional[str]:
        """
        Compute SHA256 hash of a file.

        Args:
            path: Path to file

        Returns:
            Hash string or None if file doesn't exist
        """
        if not path.exists():
            return None

        hasher = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                hasher.update(chunk)
        return hasher.hexdigest()

    @staticmethod
    def hash_string(s: str) -> str:
        """Compute SHA256 hash of a string."""
        return hashlib.sha256(s.encode("utf-8")).hexdigest()

    @staticmethod
    def hash_dict(d: Dict) -> str:
        """Compute SHA256 hash of a dictionary (JSON-serialized)."""
        json_str = json.dumps(d, sort_keys=True, default=str)
        return PipelineCache.hash_string(json_str)

    def get_phase_cache(self, phase: str) -> Optional[Dict]:
        """Get cached data for a phase."""
        return self.cache_data.get(f"phase_{phase}")

    def set_phase_cache(
        self,
        phase: str,
        input_hash: str,
        outputs: List[str],
        metadata: Optional[Dict] = None,
    ) -> None:
        """
        Record successful phase completion.

        Args:
            phase: Phase name (1, 2, 3, 4)
            input_hash: Hash of phase inputs
            outputs: List of output file paths (relative to run_path)
            metadata: Optional metadata to store
        """
        self.cache_data[f"phase_{phase}"] = {
            "input_hash": input_hash,
            "outputs": outputs,
            "output_hashes": {
                out: self.hash_file(self.run_path / out)
                for out in outputs
            },
            "completed_at": datetime.now().isoformat(),
            "metadata": metadata or {},
        }
        self._save_cache()

    def is_phase_cached(
        self,
        phase: str,
        input_hash: str,
        required_outputs: List[str],
    ) -> bool:
        """
        Check if a phase can be skipped.

        Args:
            phase: Phase name
            input_hash: Current hash of phase inputs
            required_outputs: List of output files that must exist

        Returns:
            True if phase can be skipped (inputs unchanged, outputs exist)
        """
        cached = self.get_phase_cache(phase)
        if not cached:
            return False

        # Check input hash matches
        if cached.get("input_hash") != input_hash:
            return False

        # Check all required outputs exist
        for output in required_outputs:
            output_path = self.run_path / output
            if not output_path.exists():
                return False

        return True

    def invalidate_phase(self, phase: str) -> None:
        """Invalidate cache for a phase."""
        key = f"phase_{phase}"
        if key in self.cache_data:
            del self.cache_data[key]
            self._save_cache()

    def invalidate_all(self) -> None:
        """Invalidate all cached phases."""
        self.cache_data = {}
        if self.cache_path.exists():
            self.cache_path.unlink()

    def get_run_id(self) -> Optional[str]:
        """Get cached run ID."""
        return self.cache_data.get("run_id")

    def set_run_id(self, run_id: str) -> None:
        """Set run ID."""
        self.cache_data["run_id"] = run_id
        self._save_cache()

    def get_summary(self) -> Dict[str, Any]:
        """Get cache summary."""
        summary = {
            "run_path": str(self.run_path),
            "run_id": self.get_run_id(),
            "phases": {},
        }

        for phase in ["1", "2", "3", "4"]:
            cached = self.get_phase_cache(phase)
            if cached:
                summary["phases"][phase] = {
                    "completed_at": cached.get("completed_at"),
                    "outputs": cached.get("outputs", []),
                }
            else:
                summary["phases"][phase] = None

        return summary
