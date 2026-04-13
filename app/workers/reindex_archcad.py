from __future__ import annotations

from app.core.settings import get_settings
from app.services.archcad_indexer import ArchCADIndexer


def main() -> None:
    """CLI helper to rebuild the ArchCAD index."""
    settings = get_settings()
    result = ArchCADIndexer(settings).build_index(force_reindex=True)
    print(result)


if __name__ == "__main__":
    main()
