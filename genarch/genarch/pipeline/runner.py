"""
Pipeline Runner - Orchestrates all genarch phases.

Runs Phase 1 → 2 → 3 → 4 with caching and manifest tracking.
"""

import json
import os
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any

from .cache import PipelineCache


@dataclass
class PipelineConfig:
    """Configuration for pipeline run."""

    # Input
    prompt: Optional[str] = None
    constraints_path: Optional[Path] = None

    # Output
    output_path: Path = field(default_factory=lambda: Path("runs/run_001"))

    # Generation parameters
    seed: int = 42
    wall_height: float = 3.0

    # Phase control
    skip_phase2: bool = False  # Skip Blender rendering
    skip_phase3: bool = True   # Skip AI perspective (not implemented yet)
    skip_phase4: bool = False  # Skip PDF assembly

    # Caching
    force: bool = False  # Force re-run all phases
    cache_enabled: bool = True

    # Execution
    verbose: bool = False
    strict: bool = False

    # External tools
    blender_path: Optional[str] = None
    python_path: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert config to dictionary."""
        return {
            "prompt": self.prompt,
            "constraints_path": str(self.constraints_path) if self.constraints_path else None,
            "output_path": str(self.output_path),
            "seed": self.seed,
            "wall_height": self.wall_height,
            "skip_phase2": self.skip_phase2,
            "skip_phase3": self.skip_phase3,
            "skip_phase4": self.skip_phase4,
            "force": self.force,
            "verbose": self.verbose,
            "strict": self.strict,
        }


class PipelineRunner:
    """
    Orchestrates the complete genarch pipeline.

    Phase 1: Generate floor plan + 3D mesh from constraints
    Phase 2: Render ControlNet snapshots via Blender
    Phase 3: Generate AI perspective render (future)
    Phase 4: Assemble A1 PDF sheet
    """

    # Phase 1 outputs
    PHASE1_OUTPUTS = ["plan.json", "plan.dxf", "model.glb", "model.obj", "run.json"]

    # Phase 2 outputs (key files)
    PHASE2_OUTPUTS = [
        "phase2/manifest.json",
        "phase2/cameras.json",
        "phase2/elevation_N_clay.png",
        "phase2/section_AA_clay.png",
        "phase2/hero_perspective_clay.png",
    ]

    # Phase 3 outputs
    PHASE3_OUTPUTS = ["phase3/perspective_final.png"]

    # Phase 4 outputs
    PHASE4_OUTPUTS = ["phase4/A1_sheet.pdf", "phase4/sheet_manifest.json"]

    def __init__(self, config: PipelineConfig):
        """
        Initialize pipeline runner.

        Args:
            config: Pipeline configuration
        """
        self.config = config
        self.run_path = Path(config.output_path)
        self.cache = PipelineCache(self.run_path) if config.cache_enabled else None

        # Track results
        self.results: Dict[str, Any] = {
            "phases": {},
            "errors": [],
            "warnings": [],
        }

    def _log(self, message: str, phase: Optional[str] = None) -> None:
        """Log message if verbose."""
        if self.config.verbose:
            prefix = f"[Phase {phase}]" if phase else "[Pipeline]"
            print(f"{prefix} {message}")

    def _error(self, message: str, phase: Optional[str] = None) -> None:
        """Log error."""
        prefix = f"[Phase {phase}]" if phase else "[Pipeline]"
        print(f"{prefix} ERROR: {message}")
        self.results["errors"].append({"phase": phase, "message": message})

    def _warn(self, message: str, phase: Optional[str] = None) -> None:
        """Log warning."""
        if self.config.verbose:
            prefix = f"[Phase {phase}]" if phase else "[Pipeline]"
            print(f"{prefix} WARNING: {message}")
        self.results["warnings"].append({"phase": phase, "message": message})

    def run(self) -> bool:
        """
        Run the complete pipeline.

        Returns:
            True if all phases succeeded, False otherwise
        """
        start_time = datetime.now()
        self._log(f"Starting pipeline run to {self.run_path}")

        # Create output directory
        self.run_path.mkdir(parents=True, exist_ok=True)

        # Invalidate cache if force mode
        if self.config.force and self.cache:
            self._log("Force mode: invalidating cache")
            self.cache.invalidate_all()

        # Generate or validate constraints
        constraints_path = self._prepare_constraints()
        if constraints_path is None:
            return False

        # Run phases
        success = True

        # Phase 1: Floor plan generation
        if not self._run_phase1(constraints_path):
            success = False
            if self.config.strict:
                return False

        # Phase 2: Blender rendering
        if not self.config.skip_phase2:
            if not self._run_phase2():
                success = False
                self._warn("Phase 2 failed, continuing without Blender renders", "2")

        # Phase 3: AI perspective (future)
        if not self.config.skip_phase3:
            if not self._run_phase3():
                success = False
                self._warn("Phase 3 failed, continuing without AI perspective", "3")

        # Phase 4: A1 PDF assembly
        if not self.config.skip_phase4:
            if not self._run_phase4():
                success = False
                self._warn("Phase 4 failed", "4")

        # Write pipeline manifest
        self._write_manifest(start_time)

        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()
        self._log(f"Pipeline complete in {duration:.1f}s")

        return success

    def _prepare_constraints(self) -> Optional[Path]:
        """
        Prepare constraints file from prompt or path.

        Returns:
            Path to constraints file, or None if failed
        """
        if self.config.constraints_path:
            # Use existing constraints file
            path = Path(self.config.constraints_path)
            if not path.exists():
                self._error(f"Constraints file not found: {path}")
                return None
            return path

        if self.config.prompt:
            # Generate constraints from prompt (simplified)
            self._log("Generating constraints from prompt...")
            return self._generate_constraints_from_prompt(self.config.prompt)

        self._error("Either --prompt or --constraints must be provided")
        return None

    def _generate_constraints_from_prompt(self, prompt: str) -> Optional[Path]:
        """
        Generate constraints JSON from natural language prompt.

        This is a simplified implementation that creates basic constraints.
        A full implementation would use an LLM to parse the prompt.

        Args:
            prompt: Natural language description

        Returns:
            Path to generated constraints file
        """
        # Parse simple patterns from prompt
        prompt_lower = prompt.lower()

        # Extract area (e.g., "200sqm", "200 sqm", "200 m2")
        import re
        area_match = re.search(r"(\d+)\s*(?:sqm|sq\.?m|m2|m²)", prompt_lower)
        total_area = int(area_match.group(1)) if area_match else 150

        # Detect building type
        if any(w in prompt_lower for w in ["villa", "house", "home", "residential"]):
            building_type = "residential"
        elif any(w in prompt_lower for w in ["office", "commercial"]):
            building_type = "commercial"
        elif any(w in prompt_lower for w in ["clinic", "medical"]):
            building_type = "medical"
        else:
            building_type = "residential"

        # Calculate envelope (simple rectangle)
        # Assume roughly square proportions
        side = (total_area ** 0.5) * 1.1  # Add 10% for walls
        envelope = [
            {"x": 0, "y": 0},
            {"x": round(side, 1), "y": 0},
            {"x": round(side, 1), "y": round(side, 1)},
            {"x": 0, "y": round(side, 1)},
        ]

        # Generate rooms based on building type
        if building_type == "residential":
            rooms = self._generate_residential_rooms(total_area)
        else:
            rooms = self._generate_generic_rooms(total_area)

        # Build constraints
        constraints = {
            "$schema": "https://genarch.dev/schemas/constraints-v1.json",
            "name": prompt[:50] if len(prompt) > 50 else prompt,
            "description": prompt,
            "envelope": envelope,
            "total_area_m2": total_area,
            "building_type": building_type,
            "floor_count": 1,
            "floor_height_m": 3.0,
            "external_wall_thickness_m": 0.35,
            "internal_wall_thickness_m": 0.1,
            "entrance_facade": "south",
            "rooms": rooms,
            "openings": {
                "main_entrance": {"type": "entrance", "width_m": 1.0, "height_m": 2.1, "sill_height_m": 0},
                "default_window": {"type": "window", "width_m": 1.2, "height_m": 1.2, "sill_height_m": 0.9},
                "default_door": {"type": "door", "width_m": 0.9, "height_m": 2.1, "sill_height_m": 0},
            },
            "coordinate_system": {
                "x_direction": "East",
                "y_direction": "North",
                "z_direction": "Up",
                "origin": "Southwest corner of envelope",
                "units": "meters",
            },
        }

        # Write to run folder
        constraints_path = self.run_path / "constraints.json"
        with open(constraints_path, "w", encoding="utf-8") as f:
            json.dump(constraints, f, indent=2)

        self._log(f"Generated constraints: {constraints_path}")
        return constraints_path

    def _generate_residential_rooms(self, total_area: float) -> List[Dict]:
        """Generate room list for residential building."""
        # Distribute area across typical residential rooms
        rooms = [
            {"name": "Living/Kitchen", "area_m2": round(total_area * 0.25), "adjacency": ["Entrance", "Hallway"], "exterior_wall_preference": True, "min_width_m": 4.0},
            {"name": "Master Bedroom", "area_m2": round(total_area * 0.12), "adjacency": ["Bathroom 1", "Hallway"], "exterior_wall_preference": True, "min_width_m": 3.5},
            {"name": "Bedroom 2", "area_m2": round(total_area * 0.10), "adjacency": ["Hallway"], "exterior_wall_preference": True, "min_width_m": 3.0},
            {"name": "Bathroom 1", "area_m2": round(total_area * 0.04), "adjacency": ["Master Bedroom", "Hallway"], "exterior_wall_preference": False, "min_width_m": 2.0},
            {"name": "Bathroom 2", "area_m2": round(total_area * 0.03), "adjacency": ["Hallway"], "exterior_wall_preference": False, "min_width_m": 1.8},
            {"name": "Hallway", "area_m2": round(total_area * 0.10), "adjacency": ["Entrance", "Living/Kitchen", "Master Bedroom", "Bedroom 2", "Bathroom 1", "Bathroom 2", "Storage"], "exterior_wall_preference": False, "min_width_m": 1.2},
            {"name": "Storage", "area_m2": round(total_area * 0.04), "adjacency": ["Hallway"], "exterior_wall_preference": False, "min_width_m": 1.5},
            {"name": "Entrance", "area_m2": round(total_area * 0.05), "adjacency": ["Hallway", "Living/Kitchen"], "exterior_wall_preference": True, "min_width_m": 2.0},
        ]
        return rooms

    def _generate_generic_rooms(self, total_area: float) -> List[Dict]:
        """Generate room list for generic building."""
        rooms = [
            {"name": "Main Space", "area_m2": round(total_area * 0.50), "adjacency": ["Entrance", "Corridor"], "exterior_wall_preference": True, "min_width_m": 5.0},
            {"name": "Office 1", "area_m2": round(total_area * 0.15), "adjacency": ["Corridor"], "exterior_wall_preference": True, "min_width_m": 3.0},
            {"name": "Office 2", "area_m2": round(total_area * 0.12), "adjacency": ["Corridor"], "exterior_wall_preference": True, "min_width_m": 3.0},
            {"name": "WC", "area_m2": round(total_area * 0.04), "adjacency": ["Corridor"], "exterior_wall_preference": False, "min_width_m": 1.8},
            {"name": "Corridor", "area_m2": round(total_area * 0.10), "adjacency": ["Entrance", "Main Space", "Office 1", "Office 2", "WC"], "exterior_wall_preference": False, "min_width_m": 1.5},
            {"name": "Entrance", "area_m2": round(total_area * 0.06), "adjacency": ["Corridor", "Main Space"], "exterior_wall_preference": True, "min_width_m": 2.0},
        ]
        return rooms

    def _run_phase1(self, constraints_path: Path) -> bool:
        """
        Run Phase 1: Floor plan generation.

        Args:
            constraints_path: Path to constraints JSON

        Returns:
            True if successful
        """
        self._log("Starting Phase 1: Floor plan generation", "1")

        # Check cache
        if self.cache:
            input_hash = self.cache.hash_file(constraints_path)
            if self.cache.is_phase_cached("1", input_hash, self.PHASE1_OUTPUTS):
                self._log("Phase 1 cached, skipping", "1")
                self.results["phases"]["1"] = {"status": "cached", "outputs": self.PHASE1_OUTPUTS}
                return True

        # Run genarch
        cmd = [
            sys.executable, "-m", "genarch",
            "--constraints", str(constraints_path),
            "--out", str(self.run_path),
            "--seed", str(self.config.seed),
            "--wall-height", str(self.config.wall_height),
        ]
        if self.config.verbose:
            cmd.append("--verbose")
        if self.config.strict:
            cmd.append("--strict")

        self._log(f"Running: {' '.join(cmd)}", "1")

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120,
            )

            if self.config.verbose and result.stdout:
                print(result.stdout)

            if result.returncode != 0:
                self._error(f"Phase 1 failed: {result.stderr}", "1")
                return False

            # Update cache
            if self.cache:
                self.cache.set_phase_cache(
                    "1",
                    input_hash,
                    self.PHASE1_OUTPUTS,
                    {"seed": self.config.seed},
                )

            self.results["phases"]["1"] = {"status": "success", "outputs": self.PHASE1_OUTPUTS}
            self._log("Phase 1 complete", "1")
            return True

        except subprocess.TimeoutExpired:
            self._error("Phase 1 timed out", "1")
            return False
        except Exception as e:
            self._error(f"Phase 1 error: {e}", "1")
            return False

    def _run_phase2(self) -> bool:
        """
        Run Phase 2: Blender ControlNet rendering.

        Returns:
            True if successful
        """
        self._log("Starting Phase 2: Blender rendering", "2")

        # Check prerequisites
        model_path = self.run_path / "model.glb"
        if not model_path.exists():
            self._error("model.glb not found, skipping Phase 2", "2")
            return False

        # Check cache
        if self.cache:
            input_hash = self.cache.hash_file(model_path)
            if self.cache.is_phase_cached("2", input_hash, self.PHASE2_OUTPUTS[:3]):
                self._log("Phase 2 cached, skipping", "2")
                self.results["phases"]["2"] = {"status": "cached", "outputs": self.PHASE2_OUTPUTS}
                return True

        # Find Blender
        blender_path = self.config.blender_path or os.environ.get("BLENDER_PATH", "blender")

        # Check if Blender is available
        try:
            result = subprocess.run(
                [blender_path, "--version"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode != 0:
                self._warn("Blender not available", "2")
                return False
        except (subprocess.TimeoutExpired, FileNotFoundError):
            self._warn("Blender not found", "2")
            return False

        # Create phase2 output directory
        phase2_dir = self.run_path / "phase2"
        phase2_dir.mkdir(parents=True, exist_ok=True)

        # Find scripts
        script_dir = Path(__file__).parent.parent.parent / "blender_scripts"
        controlnet_script = script_dir / "controlnet_rendering.py"
        config_path = script_dir / "phase2_config.json"

        if not controlnet_script.exists():
            self._error(f"ControlNet script not found: {controlnet_script}", "2")
            return False

        # Run Blender
        cmd = [
            blender_path, "-b",
            "-P", str(controlnet_script),
            "--",
            "--in", str(model_path),
            "--config", str(config_path),
            "--out", str(phase2_dir),
        ]

        self._log(f"Running: {' '.join(cmd)}", "2")

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300,  # 5 minutes
            )

            if self.config.verbose and result.stdout:
                # Print last 50 lines
                lines = result.stdout.strip().split("\n")
                for line in lines[-50:]:
                    print(line)

            # Check for manifest (success indicator)
            manifest_path = phase2_dir / "manifest.json"
            if not manifest_path.exists():
                self._error("Phase 2 did not produce manifest", "2")
                return False

            # Run postprocess (optional)
            self._run_postprocess(phase2_dir)

            # Update cache
            if self.cache:
                outputs = [str(p.relative_to(self.run_path)) for p in phase2_dir.glob("*.png")]
                outputs.extend(["phase2/manifest.json", "phase2/cameras.json"])
                self.cache.set_phase_cache("2", input_hash, outputs)

            self.results["phases"]["2"] = {"status": "success", "outputs": self.PHASE2_OUTPUTS}
            self._log("Phase 2 complete", "2")
            return True

        except subprocess.TimeoutExpired:
            self._error("Phase 2 timed out", "2")
            return False
        except Exception as e:
            self._error(f"Phase 2 error: {e}", "2")
            return False

    def _run_postprocess(self, phase2_dir: Path) -> None:
        """Run postprocess.py for canny edge detection."""
        script_dir = Path(__file__).parent.parent.parent / "blender_scripts"
        postprocess_script = script_dir / "postprocess.py"

        if not postprocess_script.exists():
            return

        python_cmd = self.config.python_path or sys.executable

        try:
            subprocess.run(
                [python_cmd, str(postprocess_script),
                 "--input", str(phase2_dir),
                 "--output", str(phase2_dir)],
                capture_output=True,
                timeout=60,
            )
        except Exception:
            pass  # Postprocessing is optional

    def _run_phase3(self) -> bool:
        """
        Run Phase 3: AI perspective generation.

        Note: This is a placeholder for future implementation.
        Would call ComfyUI or similar to generate perspective_final.png.

        Returns:
            True if successful (always False for now)
        """
        self._log("Phase 3 not implemented yet (AI perspective generation)", "3")
        self.results["phases"]["3"] = {"status": "skipped", "reason": "not_implemented"}
        return False

    def _run_phase4(self) -> bool:
        """
        Run Phase 4: A1 PDF assembly.

        Returns:
            True if successful
        """
        self._log("Starting Phase 4: A1 sheet assembly", "4")

        # Check prerequisites
        plan_json = self.run_path / "plan.json"
        if not plan_json.exists():
            self._error("plan.json not found, skipping Phase 4", "4")
            return False

        # Check cache
        if self.cache:
            # Hash key inputs
            input_files = ["plan.json", "run.json"]
            phase2_manifest = self.run_path / "phase2" / "manifest.json"
            if phase2_manifest.exists():
                input_files.append("phase2/manifest.json")

            combined_hash = ""
            for f in input_files:
                file_path = self.run_path / f
                if file_path.exists():
                    combined_hash += self.cache.hash_file(file_path) or ""

            input_hash = self.cache.hash_string(combined_hash)

            if self.cache.is_phase_cached("4", input_hash, self.PHASE4_OUTPUTS):
                self._log("Phase 4 cached, skipping", "4")
                self.results["phases"]["4"] = {"status": "cached", "outputs": self.PHASE4_OUTPUTS}
                return True

        # Run Phase 4
        cmd = [
            sys.executable, "-m", "genarch.phase4",
            "--run", str(self.run_path),
        ]
        if self.config.verbose:
            cmd.append("--verbose")

        self._log(f"Running: {' '.join(cmd)}", "4")

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120,
            )

            if self.config.verbose and result.stdout:
                print(result.stdout)

            if result.returncode != 0:
                self._error(f"Phase 4 failed: {result.stderr}", "4")
                return False

            # Verify output
            pdf_path = self.run_path / "phase4" / "A1_sheet.pdf"
            if not pdf_path.exists():
                self._error("A1_sheet.pdf not created", "4")
                return False

            # Update cache
            if self.cache:
                self.cache.set_phase_cache("4", input_hash, self.PHASE4_OUTPUTS)

            self.results["phases"]["4"] = {"status": "success", "outputs": self.PHASE4_OUTPUTS}
            self._log("Phase 4 complete", "4")
            return True

        except subprocess.TimeoutExpired:
            self._error("Phase 4 timed out", "4")
            return False
        except Exception as e:
            self._error(f"Phase 4 error: {e}", "4")
            return False

    def _write_manifest(self, start_time: datetime) -> None:
        """Write pipeline manifest."""
        end_time = datetime.now()

        manifest = {
            "version": "1.0.0",
            "pipeline": "genarch",
            "run_id": self.run_path.name,
            "started_at": start_time.isoformat(),
            "completed_at": end_time.isoformat(),
            "duration_seconds": (end_time - start_time).total_seconds(),
            "config": self.config.to_dict(),
            "phases": self.results["phases"],
            "errors": self.results["errors"],
            "warnings": self.results["warnings"],
            "outputs": {
                "plan_json": "plan.json",
                "plan_dxf": "plan.dxf",
                "model_glb": "model.glb",
                "phase2_manifest": "phase2/manifest.json" if (self.run_path / "phase2" / "manifest.json").exists() else None,
                "a1_sheet": "phase4/A1_sheet.pdf" if (self.run_path / "phase4" / "A1_sheet.pdf").exists() else None,
            },
        }

        manifest_path = self.run_path / "pipeline_manifest.json"
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)

        self._log(f"Pipeline manifest written: {manifest_path}")
