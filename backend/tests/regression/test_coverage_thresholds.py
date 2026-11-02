"""Protect the coverage gate's boundary, aggregation and failure contracts."""

from __future__ import annotations

import json
from pathlib import Path
import runpy
import sys

import pytest

from scripts import check_coverage_thresholds as checker


@pytest.fixture
def coverage_report(tmp_path: Path) -> Path:
    report = tmp_path / "coverage.json"
    report.write_text(
        json.dumps(
            {
                "totals": {
                    "covered_lines": 85,
                    "num_statements": 100,
                    "covered_branches": 80,
                    "num_branches": 100,
                },
                "files": {
                    "core\\sizing_math.py": {
                        "summary": {
                            "covered_lines": 95,
                            "num_statements": 100,
                            "covered_branches": 90,
                            "num_branches": 100,
                        }
                    },
                    "core/workload.py": {
                        "summary": {
                            "covered_lines": 5,
                            "num_statements": 10,
                            "covered_branches": 0,
                            "num_branches": 0,
                        }
                    },
                },
            }
        ),
        encoding="utf-8",
    )
    return report


def gate_args(report: Path, thresholds: tuple[float, float, float, float]) -> list[str]:
    return [
        "check_coverage_thresholds.py",
        "--coverage-json",
        str(report),
        "--overall-line",
        str(thresholds[0]),
        "--overall-branch",
        str(thresholds[1]),
        "--core-line",
        str(thresholds[2]),
        "--core-branch",
        str(thresholds[3]),
    ]


def test_gate_accepts_exact_thresholds_and_windows_report_paths(
    coverage_report: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(sys, "argv", gate_args(coverage_report, (85, 80, 95, 90)))

    assert checker.main() == 0

    output = capsys.readouterr().out
    assert "Coverage thresholds satisfied." in output
    assert "FAIL:" not in output


@pytest.mark.parametrize(
    ("thresholds", "failed_scopes"),
    [
        ((85.01, 80, 95, 90), ["overall line"]),
        ((85, 80.01, 95, 90), ["overall branch"]),
        ((85, 80, 95.01, 90), ["core line"]),
        ((85, 80, 95, 90.01), ["core branch"]),
        ((86, 81, 96, 91), ["overall line", "overall branch", "core line", "core branch"]),
    ],
)
def test_gate_rejects_each_failing_scope_and_reports_all_failures(
    coverage_report: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    thresholds: tuple[float, float, float, float],
    failed_scopes: list[str],
) -> None:
    monkeypatch.setattr(sys, "argv", gate_args(coverage_report, thresholds))

    assert checker.main() == 1

    failures = [line for line in capsys.readouterr().out.splitlines() if line.startswith("FAIL:")]
    assert len(failures) == len(failed_scopes)
    for failure, scope in zip(failures, failed_scopes, strict=True):
        assert failure.startswith(f"FAIL: {scope} coverage ")
        assert "% < required " in failure


def test_extra_core_paths_are_weighted_and_duplicates_are_counted_once(
    coverage_report: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    args = gate_args(coverage_report, (85, 80, 90.9, 90))
    args += ["--core-path", "core\\workload.py", "--core-path", "core/workload.py"]
    monkeypatch.setattr(sys, "argv", args)

    assert checker.main() == 0
    assert "Core line coverage:      90.91%" in capsys.readouterr().out


def test_gate_names_missing_core_paths(
    coverage_report: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    args = gate_args(coverage_report, (85, 80, 95, 90))
    args += ["--core-path", "core/missing.py"]
    monkeypatch.setattr(sys, "argv", args)

    with pytest.raises(SystemExit, match=r"Core coverage paths not found.*core/missing\.py"):
        checker.main()


def test_empty_scopes_have_no_uncovered_work(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    report = tmp_path / "empty.json"
    report.write_text('{"files":{"core/sizing_math.py":{"summary":{}}}}', encoding="utf-8")
    monkeypatch.setattr(sys, "argv", gate_args(report, (100, 100, 100, 100)))

    assert checker.main() == 0
    assert checker._aggregate_core({}, []) == (0, 0, 0, 0)


def test_script_entry_propagates_failure_exit_status(
    coverage_report: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(sys, "argv", gate_args(coverage_report, (86, 80, 95, 90)))

    with pytest.raises(SystemExit) as exited:
        runpy.run_path(str(Path(checker.__file__)), run_name="__main__")

    assert exited.value.code == 1
