#!/usr/bin/env python3
"""CLI for GPU catalog scraping/normalization pipeline."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def _default_raw_path() -> Path:
    return BACKEND_DIR / "gpu_data_raw.json"


def _default_output_path() -> Path:
    return BACKEND_DIR / "gpu_data.json"


def main() -> int:
    from services.gpu_catalog_pipeline.normalizer import normalize
    from services.gpu_catalog_pipeline.scraper import scrape_gpu_catalog_raw

    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    scrape_cmd = subparsers.add_parser("scrape", help="Scrape raw GPU catalog")
    scrape_cmd.add_argument(
        "--raw-output",
        default=str(_default_raw_path()),
        help="Output path for raw catalog JSON",
    )

    normalize_cmd = subparsers.add_parser("normalize", help="Normalize raw GPU catalog")
    normalize_cmd.add_argument(
        "--raw-input",
        default=str(_default_raw_path()),
        help="Input path for raw catalog JSON",
    )
    normalize_cmd.add_argument(
        "--output",
        default=str(_default_output_path()),
        help="Output path for normalized catalog JSON",
    )

    refresh_cmd = subparsers.add_parser("refresh", help="Run scrape + normalize")
    refresh_cmd.add_argument(
        "--raw-output",
        default=str(_default_raw_path()),
        help="Output path for raw catalog JSON",
    )
    refresh_cmd.add_argument(
        "--output",
        default=str(_default_output_path()),
        help="Output path for normalized catalog JSON",
    )

    args = parser.parse_args()

    if args.command == "scrape":
        scrape_gpu_catalog_raw(args.raw_output)
        return 0

    if args.command == "normalize":
        normalize(args.raw_input, args.output)
        return 0

    if args.command == "refresh":
        scrape_gpu_catalog_raw(args.raw_output)
        normalize(args.raw_output, args.output)
        return 0

    parser.error(f"Unsupported command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
