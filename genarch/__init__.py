"""
Repository-root compatibility shim for the standalone ``genarch`` package.

When this monorepo is executed from the repository root, ``import genarch``
would otherwise resolve to this outer folder as a namespace package, which
breaks ``genarch.__version__`` and submodule imports in CI. Extend the package
search path to the inner installable package and re-export its public API.
"""

from pathlib import Path

_INNER_PACKAGE_DIR = Path(__file__).resolve().parent / "genarch"

if str(_INNER_PACKAGE_DIR) not in __path__:
    __path__.append(str(_INNER_PACKAGE_DIR))

from .genarch import *  # noqa: F401,F403
from .genarch import __all__ as _INNER_ALL

__all__ = list(_INNER_ALL)
