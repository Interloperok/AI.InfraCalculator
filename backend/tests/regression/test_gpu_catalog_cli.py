"""Exercise catalog commands through real parsing and local JSON outputs."""

from __future__ import annotations

import json
from pathlib import Path
import runpy
import sys
from types import SimpleNamespace

import pytest

from scripts import gpu_catalog_pipeline as cli
from services.gpu_catalog_pipeline import scraper


@pytest.fixture
def offline_catalog(monkeypatch: pytest.MonkeyPatch) -> None:
    html = """
    <table>
      <tr><th>Model</th><th>Launch</th><th>Memory Size (GB)</th></tr>
      <tr><td>Fixture Eight</td><td>2024</td><td>8 GB</td></tr>
      <tr><td>Fixture Sixteen</td><td>2024</td><td>16 GB</td></tr>
    </table>
    """

    def get_fixture(url: str, *, timeout: int, headers: dict[str, str]) -> SimpleNamespace:
        assert url == "https://example.test/catalog"
        return SimpleNamespace(text=html, raise_for_status=lambda: None)

    monkeypatch.setattr(scraper, "data", {"NVIDIA": {"url": "https://example.test/catalog"}})
    monkeypatch.setattr(scraper.requests, "get", get_fixture)
    monkeypatch.setattr(scraper.time, "sleep", lambda seconds: None)


@pytest.mark.parametrize("command", ["scrape", "normalize", "refresh"])
@pytest.mark.parametrize("explicit_paths", [False, True])
def test_catalog_commands_write_requested_files_and_preserve_raw_inputs(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    offline_catalog: None,
    command: str,
    explicit_paths: bool,
) -> None:
    monkeypatch.setattr(cli, "BACKEND_DIR", tmp_path)
    raw_path = tmp_path / ("chosen-raw.json" if explicit_paths else "gpu_data_raw.json")
    output_path = tmp_path / ("chosen-output.json" if explicit_paths else "gpu_data.json")
    if command == "normalize":
        raw_path.write_text(
            '{"fixture":{"Vendor":"AMD","Model":"Offline Eight","Memory Size (MiB)":"8192"}}',
            encoding="utf-8",
        )
    original = raw_path.read_bytes() if raw_path.exists() else None
    args = ["gpu_catalog_pipeline.py", command]
    if explicit_paths:
        args += ["--raw-input" if command == "normalize" else "--raw-output", str(raw_path)]
        if command != "scrape":
            args += ["--output", str(output_path)]
    monkeypatch.setattr(sys, "argv", args)

    assert cli.main() == 0

    if command == "normalize":
        assert raw_path.read_bytes() == original
        output = json.loads(output_path.read_text(encoding="utf-8"))
        assert [(row["model_name"], row["memory_gb"]) for row in output] == [("Offline Eight", 8)]
    else:
        raw = json.loads(raw_path.read_text(encoding="utf-8"))
        assert {row["Model"] for row in raw.values()} == {"Fixture Eight", "Fixture Sixteen"}
        if command == "refresh":
            output = json.loads(output_path.read_text(encoding="utf-8"))
            assert [(row["model_name"], row["memory_gb"]) for row in output] == [
                ("Fixture Eight", 8),
                ("Fixture Sixteen", 16),
            ]
        else:
            assert not output_path.exists()


def test_standalone_script_can_bootstrap_backend_imports_and_write_normalized_output(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    raw_path = tmp_path / "raw.json"
    out_path = tmp_path / "normalized.json"
    raw_path.write_text('{"gpu":{"Model":"Standalone","Memory Size (GB)":"4"}}', encoding="utf-8")
    monkeypatch.setattr(sys, "path", [item for item in sys.path if item != str(cli.BACKEND_DIR)])
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "gpu_catalog_pipeline.py",
            "normalize",
            "--raw-input",
            str(raw_path),
            "--output",
            str(out_path),
        ],
    )

    with pytest.raises(SystemExit) as exited:
        runpy.run_path(str(Path(cli.__file__)), run_name="__main__")

    assert exited.value.code == 0
    assert json.loads(out_path.read_text(encoding="utf-8"))[0]["memory_gb"] == 4


@pytest.mark.parametrize("arguments", [[], ["unknown"]])
def test_invalid_command_does_not_create_catalog_files(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, arguments: list[str]
) -> None:
    monkeypatch.setattr(cli, "BACKEND_DIR", tmp_path)
    monkeypatch.setattr(sys, "argv", ["gpu_catalog_pipeline.py", *arguments])

    with pytest.raises(SystemExit) as exited:
        cli.main()

    assert exited.value.code == 2
    assert list(tmp_path.iterdir()) == []
