import shutil
import uuid
from pathlib import Path

import pytest


PYTEST_TMP_ROOT = Path(__file__).resolve().parent.parent / "tmp_test_runs"
PYTEST_TMP_ROOT.mkdir(parents=True, exist_ok=True)


@pytest.fixture
def tmp_path():
    """Use a repo-local temp directory to avoid Windows temp permission issues."""
    path = PYTEST_TMP_ROOT / f"tmp_{uuid.uuid4().hex}"
    path.mkdir(parents=True, exist_ok=True)
    try:
        yield path
    finally:
        shutil.rmtree(path, ignore_errors=True)
