#!/usr/bin/env python3
"""
genarch Environment Checker

Validates that all required dependencies and environment variables are configured
for running the genarch pipeline.

Usage:
    python scripts/genarch/check_env.py
    python scripts/genarch/check_env.py --phase2   # Include Blender check
    python scripts/genarch/check_env.py --phase3   # Include ComfyUI check
    python scripts/genarch/check_env.py --all      # Check everything

Exit codes:
    0 - All checks passed
    1 - One or more checks failed
"""

import argparse
import importlib
import os
import shutil
import subprocess
import sys
from pathlib import Path


# ANSI colors and Unicode support
USE_UNICODE = sys.stdout.encoding and sys.stdout.encoding.lower() in ("utf-8", "utf8")

try:
    import colorama
    colorama.init()
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    RESET = "\033[0m"
    BOLD = "\033[1m"
except ImportError:
    if sys.platform == "win32":
        GREEN = YELLOW = RED = RESET = BOLD = ""
    else:
        GREEN = "\033[92m"
        YELLOW = "\033[93m"
        RED = "\033[91m"
        RESET = "\033[0m"
        BOLD = "\033[1m"


def check_mark(ok: bool) -> str:
    """Return colored check or X mark."""
    if USE_UNICODE:
        return f"{GREEN}✓{RESET}" if ok else f"{RED}✗{RESET}"
    else:
        return f"{GREEN}[OK]{RESET}" if ok else f"{RED}[FAIL]{RESET}"


def warn_mark() -> str:
    """Return colored warning mark."""
    if USE_UNICODE:
        return f"{YELLOW}⚠{RESET}"
    else:
        return f"{YELLOW}[WARN]{RESET}"


class EnvironmentChecker:
    """Check genarch environment configuration."""

    def __init__(self, verbose: bool = False):
        self.verbose = verbose
        self.errors = []
        self.warnings = []

    def log(self, msg: str, indent: int = 0) -> None:
        """Print message with optional indent."""
        prefix = "  " * indent
        print(f"{prefix}{msg}")

    def check_python_version(self) -> bool:
        """Check Python version is 3.10+."""
        version = sys.version_info
        ok = version >= (3, 10)
        self.log(f"{check_mark(ok)} Python {version.major}.{version.minor}.{version.micro}")
        if not ok:
            self.errors.append("Python 3.10+ required")
        return ok

    def check_module(self, name: str, package: str = None, optional: bool = False) -> bool:
        """Check if a Python module is importable."""
        try:
            mod = importlib.import_module(name)
            version = getattr(mod, "__version__", "unknown")
            self.log(f"{check_mark(True)} {package or name} ({version})")
            return True
        except ImportError as e:
            if optional:
                self.log(f"{warn_mark()} {package or name} (not installed - optional)")
                self.warnings.append(f"{package or name} not installed")
            else:
                self.log(f"{check_mark(False)} {package or name} (not found)")
                self.errors.append(f"{package or name} not installed: {e}")
            return False

    def check_core_dependencies(self) -> bool:
        """Check core Python dependencies."""
        self.log(f"\n{BOLD}Core Dependencies:{RESET}")

        ok = True
        ok &= self.check_module("ezdxf")
        ok &= self.check_module("trimesh")
        ok &= self.check_module("numpy")
        ok &= self.check_module("shapely")
        ok &= self.check_module("networkx")

        return ok

    def check_phase4_dependencies(self) -> bool:
        """Check Phase 4 (PDF assembly) dependencies."""
        self.log(f"\n{BOLD}Phase 4 Dependencies (A1 PDF):{RESET}")

        ok = True
        ok &= self.check_module("reportlab")
        ok &= self.check_module("svglib")
        ok &= self.check_module("PIL", "Pillow")

        return ok

    def check_validation_dependencies(self) -> bool:
        """Check validation dependencies."""
        self.log(f"\n{BOLD}Validation Dependencies:{RESET}")

        ok = True
        ok &= self.check_module("cv2", "opencv-python", optional=True)

        return ok

    def check_genarch_installation(self) -> bool:
        """Check genarch package is installed."""
        self.log(f"\n{BOLD}genarch Package:{RESET}")

        try:
            import genarch
            version = getattr(genarch, "__version__", "0.1.0")
            self.log(f"{check_mark(True)} genarch ({version})")

            # Check submodules
            try:
                from genarch.pipeline import PipelineRunner
                self.log(f"{check_mark(True)} genarch.pipeline")
            except ImportError:
                self.log(f"{check_mark(False)} genarch.pipeline (not found)")
                self.errors.append("genarch.pipeline not importable")
                return False

            try:
                from genarch.validation import DriftChecker
                self.log(f"{check_mark(True)} genarch.validation")
            except ImportError:
                self.log(f"{warn_mark()} genarch.validation (optional)")

            try:
                from genarch.phase4 import A1SheetAssembler
                self.log(f"{check_mark(True)} genarch.phase4")
            except ImportError:
                self.log(f"{warn_mark()} genarch.phase4 (install with pip install -e '.[phase4]')")

            return True

        except ImportError:
            self.log(f"{check_mark(False)} genarch (not installed)")
            self.errors.append("genarch not installed - run: pip install -e .")
            return False

    def check_blender(self) -> bool:
        """Check Blender installation."""
        self.log(f"\n{BOLD}Blender (Phase 2):{RESET}")

        blender_path = os.environ.get("BLENDER_PATH", "blender")

        # Try to find Blender
        blender_exe = shutil.which(blender_path)
        if not blender_exe and blender_path != "blender":
            blender_exe = blender_path if Path(blender_path).exists() else None

        if not blender_exe:
            self.log(f"{check_mark(False)} Blender not found")
            self.log(f"  BLENDER_PATH={blender_path}")
            self.errors.append("Blender not found - set BLENDER_PATH environment variable")
            return False

        # Get version
        try:
            result = subprocess.run(
                [blender_exe, "--version"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            version_line = result.stdout.split("\n")[0] if result.stdout else "unknown"
            self.log(f"{check_mark(True)} {version_line}")
            self.log(f"  Path: {blender_exe}")
            return True
        except Exception as e:
            self.log(f"{check_mark(False)} Blender error: {e}")
            self.errors.append(f"Blender error: {e}")
            return False

    def check_comfyui(self) -> bool:
        """Check ComfyUI availability."""
        self.log(f"\n{BOLD}ComfyUI (Phase 3 - Experimental):{RESET}")

        comfyui_url = os.environ.get("COMFYUI_URL", "http://localhost:8188")
        self.log(f"  COMFYUI_URL={comfyui_url}")

        try:
            import urllib.request
            req = urllib.request.Request(f"{comfyui_url}/system_stats", method="GET")
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.status == 200:
                    self.log(f"{check_mark(True)} ComfyUI API responding")
                    return True
        except Exception as e:
            self.log(f"{warn_mark()} ComfyUI not reachable: {e}")
            self.warnings.append(f"ComfyUI not reachable at {comfyui_url}")

        return False

    def check_environment_variables(self) -> None:
        """Check relevant environment variables."""
        self.log(f"\n{BOLD}Environment Variables:{RESET}")

        vars_to_check = [
            ("BLENDER_PATH", "blender", "Path to Blender executable"),
            ("COMFYUI_URL", "http://localhost:8188", "ComfyUI API endpoint"),
            ("GENARCH_RUNS_DIR", "./runs", "Output directory for runs"),
            ("GENARCH_CACHE_DIR", None, "Cache directory"),
            ("GENARCH_DRIFT_THRESHOLD", "0.65", "Drift validation threshold"),
        ]

        for var, default, desc in vars_to_check:
            value = os.environ.get(var)
            if value:
                self.log(f"{check_mark(True)} {var}={value}")
            elif default:
                self.log(f"{warn_mark()} {var} (using default: {default})")
            else:
                self.log(f"  {var} (not set)")

    def run_all_checks(
        self,
        check_phase2: bool = False,
        check_phase3: bool = False,
    ) -> bool:
        """Run all environment checks."""
        print(f"\n{BOLD}{'='*60}{RESET}")
        print(f"{BOLD}genarch Environment Check{RESET}")
        print(f"{BOLD}{'='*60}{RESET}")

        all_ok = True

        # Core checks (always run)
        all_ok &= self.check_python_version()
        all_ok &= self.check_core_dependencies()
        all_ok &= self.check_phase4_dependencies()
        all_ok &= self.check_validation_dependencies()
        all_ok &= self.check_genarch_installation()

        # Optional Phase 2 check
        if check_phase2:
            all_ok &= self.check_blender()

        # Optional Phase 3 check
        if check_phase3:
            self.check_comfyui()  # Don't fail on ComfyUI

        # Environment variables (informational)
        self.check_environment_variables()

        # Summary
        print(f"\n{BOLD}{'='*60}{RESET}")
        err_mark = "[X]" if not USE_UNICODE else "✗"
        wrn_mark = "[!]" if not USE_UNICODE else "⚠"

        if self.errors:
            print(f"{RED}ERRORS ({len(self.errors)}):{RESET}")
            for err in self.errors:
                print(f"  {RED}{err_mark}{RESET} {err}")

        if self.warnings:
            print(f"{YELLOW}WARNINGS ({len(self.warnings)}):{RESET}")
            for warn in self.warnings:
                print(f"  {YELLOW}{wrn_mark}{RESET} {warn}")

        if all_ok and not self.errors:
            print(f"\n{GREEN}All required checks passed!{RESET}")
        else:
            print(f"\n{RED}Some checks failed. Please fix the errors above.{RESET}")

        print(f"{BOLD}{'='*60}{RESET}\n")

        return len(self.errors) == 0


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Check genarch environment configuration",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scripts/genarch/check_env.py           # Basic checks
  python scripts/genarch/check_env.py --phase2  # Include Blender
  python scripts/genarch/check_env.py --all     # All checks
""",
    )
    parser.add_argument(
        "--phase2",
        action="store_true",
        help="Check Blender installation",
    )
    parser.add_argument(
        "--phase3",
        action="store_true",
        help="Check ComfyUI availability",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Run all checks (--phase2 --phase3)",
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Verbose output",
    )

    args = parser.parse_args()

    checker = EnvironmentChecker(verbose=args.verbose)
    success = checker.run_all_checks(
        check_phase2=args.phase2 or args.all,
        check_phase3=args.phase3 or args.all,
    )

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
