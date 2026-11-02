"""Export methodology constants shared with the frontend.

Usage: python backend/scripts/export_methodology_constants.py
Writes frontend/src/data/quantization.json from core.methodology_constants.
tests/test_single_source_catalogs.py fails if the committed file is stale.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from core.methodology_constants import QUANTIZATION_FORMATS  # noqa: E402

TARGET = BACKEND.parent / "frontend" / "src" / "data" / "quantization.json"


def render() -> str:
    return json.dumps(list(QUANTIZATION_FORMATS), ensure_ascii=False, indent=2) + "\n"


if __name__ == "__main__":
    TARGET.write_text(render(), encoding="utf-8")
    print(f"wrote {TARGET}")
