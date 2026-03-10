from __future__ import annotations

import json
from pathlib import Path

from services.gpu_catalog_pipeline.normalizer import SCHEMA_FIELDS, normalize


def _read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def test_normalizer_preserves_schema_and_regression_snapshot(tmp_path: Path) -> None:
    fixture_dir = Path(__file__).parent / "fixtures"
    raw_path = fixture_dir / "normalizer_raw" / "sample_raw.json"
    expected_path = fixture_dir / "normalizer_expected" / "sample_expected.json"
    output_path = tmp_path / "normalized.json"

    normalized = normalize(str(raw_path), str(output_path))
    assert output_path.exists()

    expected = _read_json(expected_path)
    assert normalized == expected

    expected_keys = {"id", *SCHEMA_FIELDS}
    for item in normalized:
        assert set(item.keys()) == expected_keys

    ids = [item["id"] for item in normalized]
    assert ids == [
        "nvidia-geforce-rtx-4090",
        "nvidia-geforce-rtx-4090-2",
        "amd-radeon-rx-7900-xtx",
    ]
