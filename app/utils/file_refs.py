from __future__ import annotations

import json
import shutil
import zipfile
from pathlib import Path
from typing import Any, Iterator

ZIP_PREFIX = "zip://"
REF_SEPARATOR = "::"


def make_file_ref(path: Path, member: str | None = None) -> str:
    if member:
        return f"{ZIP_PREFIX}{path.resolve()}{REF_SEPARATOR}{member}"
    return str(path.resolve())


def parse_file_ref(file_ref: str) -> tuple[Path, str | None]:
    if file_ref.startswith(ZIP_PREFIX):
        payload = file_ref[len(ZIP_PREFIX) :]
        archive, member = payload.split(REF_SEPARATOR, 1)
        return Path(archive), member
    return Path(file_ref), None


def read_bytes(file_ref: str) -> bytes:
    path, member = parse_file_ref(file_ref)
    if member:
        with zipfile.ZipFile(path) as archive:
            return archive.read(member)
    return path.read_bytes()


def read_text(file_ref: str, encoding: str = "utf-8") -> str:
    raw = read_bytes(file_ref)
    for candidate in (encoding, "utf-8-sig", "latin-1"):
        try:
            return raw.decode(candidate)
        except UnicodeDecodeError:
            continue
    return raw.decode(encoding, errors="replace")


def load_json(file_ref: str) -> Any:
    return json.loads(read_text(file_ref))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def read_json_if_exists(path: Path) -> Any | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def iter_files(root: Path) -> Iterator[Path]:
    for path in root.rglob("*"):
        if path.is_file():
            yield path


def zip_member_paths(archive_path: Path) -> list[str]:
    with zipfile.ZipFile(archive_path) as archive:
        return [
            member.filename
            for member in archive.infolist()
            if not member.is_dir() and not Path(member.filename).name.startswith(".")
        ]


def count_files(root: Path) -> int:
    return sum(
        1
        for path in root.rglob("*")
        if path.is_file() and ".cache" not in path.parts and ".ipynb_checkpoints" not in path.parts
    )


def ensure_within(parent: Path, target: Path) -> None:
    target.resolve().relative_to(parent.resolve())


def clear_directory(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path, ignore_errors=True)
