from __future__ import annotations

import os
import shutil
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from app.core.exceptions import ArchCADDownloadError
from app.core.logging import get_logger
from app.core.settings import Settings
from app.utils.file_refs import count_files, ensure_within, write_json

logger = get_logger(__name__)


class ArchCADDownloader:
    """Download the gated ArchCAD dataset with token-based auth."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def download(self, *, force: bool = False, strategy: str = "auto") -> dict[str, Any]:
        self.settings.ensure_directories()
        local_dir = self.settings.archcad_local_dir.resolve()

        if self._dataset_exists(local_dir) and not force:
            manifest = self._build_manifest(
                local_dir=local_dir,
                strategy="cached",
                skipped=True,
            )
            write_json(self.settings.archcad_download_manifest_path, manifest)
            return manifest

        if force and local_dir.exists():
            self._clear_local_dir(local_dir)

        strategies = self._resolve_strategies(strategy)
        failures: list[dict[str, str]] = []

        for strategy_name, operation in strategies:
            try:
                logger.info(
                    "Attempting ArchCAD download",
                    extra={
                        "context": {
                            "strategy": strategy_name,
                            "dataset_id": self.settings.archcad_dataset_id,
                        }
                    },
                )
                operation(local_dir)
                manifest = self._build_manifest(
                    local_dir=local_dir,
                    strategy=strategy_name,
                    skipped=False,
                )
                write_json(self.settings.archcad_download_manifest_path, manifest)
                return manifest
            except Exception as exc:
                failures.append({"strategy": strategy_name, "message": str(exc)})
                logger.warning(
                    "ArchCAD download strategy failed",
                    extra={"context": {"strategy": strategy_name, "error": str(exc)}},
                )

        raise ArchCADDownloadError(
            "All ArchCAD download strategies failed",
            context={"failures": failures, "dataset_id": self.settings.archcad_dataset_id},
        )

    def _resolve_strategies(
        self,
        strategy: str,
    ) -> list[tuple[str, Callable[[Path], None]]]:
        operations: dict[str, Callable[[Path], None]] = {
            "snapshot": self._download_with_snapshot,
            "hf-cli": self._download_with_hf_cli,
            "git": self._download_with_git,
        }
        if strategy == "auto":
            return list(operations.items())
        if strategy not in operations:
            raise ArchCADDownloadError(
                f"Unsupported download strategy: {strategy}",
                context={"supported": list(operations)},
            )
        return [(strategy, operations[strategy])]

    def _download_with_snapshot(self, local_dir: Path) -> None:
        token = self._require_token()
        try:
            from huggingface_hub import snapshot_download
        except ImportError as exc:
            raise ArchCADDownloadError(
                "huggingface_hub is not installed. Install requirements.txt to use snapshot_download.",
            ) from exc

        def execute() -> None:
            snapshot_download(
                repo_id=self.settings.archcad_dataset_id,
                repo_type="dataset",
                token=token,
                local_dir=str(local_dir),
                max_workers=4,
            )

        self._run_with_retries("snapshot_download", execute)

    def _download_with_hf_cli(self, local_dir: Path) -> None:
        token = self._require_token()
        hf_binary = self._resolve_binary("hf")
        if not hf_binary:
            raise ArchCADDownloadError("hf CLI is not available on PATH")

        env = {**os.environ, "HF_TOKEN": token}
        command = [
            str(hf_binary),
            "download",
            self.settings.archcad_dataset_id,
            "--repo-type=dataset",
            "--local-dir",
            str(local_dir),
        ]
        self._run_with_retries(
            "hf download",
            lambda: subprocess.run(command, check=True, env=env, capture_output=True, text=True),
        )

    def _download_with_git(self, local_dir: Path) -> None:
        token = self._require_token()
        git_binary = self._resolve_binary("git")
        if not git_binary:
            raise ArchCADDownloadError("git is not available on PATH")

        repo_url = f"https://huggingface.co/datasets/{self.settings.archcad_dataset_id}"
        env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
        command = [
            str(git_binary),
            "-c",
            f"http.extraHeader=Authorization: Bearer {token}",
            "clone",
            repo_url,
            str(local_dir),
        ]
        self._run_with_retries(
            "git clone",
            lambda: subprocess.run(command, check=True, env=env, capture_output=True, text=True),
        )

    def _run_with_retries(self, label: str, operation: Callable[[], Any], attempts: int = 3) -> None:
        last_error: Exception | None = None
        for attempt in range(1, attempts + 1):
            try:
                operation()
                return
            except Exception as exc:
                last_error = exc
                logger.warning(
                    "Download attempt failed",
                    extra={"context": {"label": label, "attempt": attempt, "error": str(exc)}},
                )
                if attempt < attempts:
                    time.sleep(min(2**attempt, 8))
        raise ArchCADDownloadError(
            f"{label} failed after {attempts} attempts",
            context={"error": str(last_error) if last_error else "unknown"},
        )

    def _dataset_exists(self, local_dir: Path) -> bool:
        if not local_dir.exists():
            return False
        data_files = [
            path
            for path in local_dir.rglob("*")
            if path.is_file() and ".cache" not in path.parts and ".ipynb_checkpoints" not in path.parts
        ]
        if not data_files:
            return False
        archive_names = {path.name.lower() for path in data_files}
        expected_archives = {"caption.zip", "json.zip", "png.zip", "point.zip", "svg.zip"}
        return bool(archive_names & expected_archives)

    def _clear_local_dir(self, local_dir: Path) -> None:
        ensure_within(self.settings.archcad_root_dir, local_dir)
        shutil.rmtree(local_dir, ignore_errors=True)
        local_dir.mkdir(parents=True, exist_ok=True)

    def _build_manifest(self, *, local_dir: Path, strategy: str, skipped: bool) -> dict[str, Any]:
        return {
            "dataset_id": self.settings.archcad_dataset_id,
            "downloaded_at": datetime.now(timezone.utc).isoformat(),
            "file_count": count_files(local_dir),
            "local_path": str(local_dir),
            "skipped": skipped,
            "strategy": strategy,
        }

    def _require_token(self) -> str:
        token = self.settings.hf_token
        if not token:
            raise ArchCADDownloadError("HF_TOKEN is required for the gated ArchCAD dataset")
        return token

    def _resolve_binary(self, name: str) -> Path | None:
        system_binary = shutil.which(name)
        if system_binary:
            return Path(system_binary)

        home = Path.home()
        candidates = [
            home / ".local" / "bin" / f"{name}.exe",
            home / ".local" / "bin" / name,
        ]
        for candidate in candidates:
            if candidate.exists():
                return candidate
        return None
