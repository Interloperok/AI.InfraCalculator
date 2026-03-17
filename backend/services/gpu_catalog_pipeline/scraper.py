import json
import re
import time
from io import StringIO
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
import requests

# ---------------------------------------------
#  Configuration
# ---------------------------------------------

data: Dict[str, Dict[str, str]] = {
    "NVIDIA": {
        "url": "https://en.wikipedia.org/wiki/List_of_Nvidia_graphics_processing_units",
    },
    "AMD": {
        "url": "https://en.wikipedia.org/wiki/List_of_AMD_graphics_processing_units",
    },
    "Intel": {
        "url": "https://en.wikipedia.org/wiki/List_of_Intel_graphics_processing_units",
    },
}

REFERENCES_AT_END = r"(?:\s*\[\d+\])+(?:\d+,)?(?:\d+)?$"
BACKEND_DIR = Path(__file__).resolve().parents[2]

# ---------------------------------------------
#  Utilities
# ---------------------------------------------


def clean_html(html: str) -> str:
    """Remove tags & anomalies so that pandas.read_html behaves."""
    # Standardise rowspan/colspan attributes & strip garbage characters
    html = re.sub(
        r"""(colspan|rowspan)=(?:"|')?(\d+)[^>]*?""",
        lambda m: f'{m.group(1)}="{m.group(2)}"',
        html,
        flags=re.I,
    )

    # Remove <style>...</style> blocks completely (vertical‑header CSS etc.)
    html = re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.DOTALL)

    # Remove citation superscripts & hidden spans
    html = re.sub(r"<sup[^>]*>.*?</sup>", "", html, flags=re.DOTALL)
    html = re.sub(r"<span [^>]*style=\"display:none[^>]*>([^<]+)</span>", "", html)

    # Simplify remaining markup
    html = re.sub(r"<br\s*/?>", " ", html)
    html = re.sub(r"<th([^>]*)>", lambda m: "<th" + m.group(1) + ">", html)
    html = re.sub(r"<span[^>]*>([^<]+)</span>", r"\1", html)

    # Misc entities / whitespace
    html = html.replace('\\"', '"')
    html = re.sub(r"(\d)&?#160;?(\d)", r"\1\2", html)
    html = re.sub(r"&thinsp;|&#8201;|&nbsp;|&#160;|\xa0", " ", html)
    html = re.sub(r"<small>.*?</small>", "", html, flags=re.DOTALL)
    translation_table: Dict[str, str | int | None] = {
        "\u2012": "-",
        "\u2013": "-",
        "\u2014": "",
    }
    html = html.translate(str.maketrans(translation_table))
    html = (
        html.replace("mm<sup>2</sup>", "mm2")
        .replace("\u00d710<sup>6</sup>", "×10⁶")
        .replace("\u00d710<sup>9</sup>", "×10⁹")
    )
    html = re.sub(r"<sup>\d+</sup>", "", html)
    return html


def normalize_columns(cols) -> List[str]:
    """Flatten possible MultiIndex and clean duplicates."""
    if isinstance(cols, pd.MultiIndex):
        flat = [
            " ".join(
                str(x).strip() for x in tup if str(x) != "nan" and not str(x).startswith("Unnamed")
            )
            for tup in cols.values
        ]
    else:
        flat = [str(c).strip() for c in cols]

    cleaned: List[str] = []
    for col in flat:
        col = re.sub(r"\s+", " ", col).strip()
        # Collapse exact duplicate half (e.g., "Launch Launch")
        parts = col.split()
        if len(parts) % 2 == 0 and parts[: len(parts) // 2] == parts[len(parts) // 2 :]:
            parts = parts[: len(parts) // 2]
        # Remove consecutive duplicate words
        dedup: List[str] = []
        for w in parts:
            if not dedup or w != dedup[-1]:
                dedup.append(w)
        col = " ".join(dedup)
        cleaned.append(col)
    return cleaned


def standardise_column_names(df: pd.DataFrame) -> pd.DataFrame:
    mapping = {}
    for col in list(df.columns):
        cname = col.lower()
        if cname.startswith("gpu die") or cname == "code name":
            mapping[col] = "Code name"
        elif cname.startswith("model") and "name" not in cname:
            mapping[col] = "Model"
        elif cname.startswith("geforce rtx") or cname.startswith("radeon rx"):
            mapping[col] = "Model name"
    if mapping:
        df = df.rename(columns=mapping)
    return df


def extract_memory_gb(text: str) -> Optional[float]:
    """Extract memory in GB from text like '8 GB', '8192 MB', '8GB'"""
    if pd.isna(text) or text == "nan":
        return None

    text = str(text).upper()

    # Look for GB patterns
    gb_match = re.search(r"(\d+(?:\.\d+)?)\s*GB", text)
    if gb_match:
        return float(gb_match.group(1))

    # Look for MB patterns and convert to GB
    mb_match = re.search(r"(\d+(?:\.\d+)?)\s*MB", text)
    if mb_match:
        return float(mb_match.group(1)) / 1024

    return None


def extract_cores(text: str) -> Optional[int]:
    """Extract core count from text"""
    if pd.isna(text) or text == "nan":
        return None

    text = str(text)
    match = re.search(r"(\d+)\s*(?:cores?|cuda|stream)", text, re.I)
    if match:
        return int(match.group(1))
    return None


def extract_memory_type(text: str) -> Optional[str]:
    """Extract memory type from text"""
    if pd.isna(text) or text == "nan":
        return None

    text = str(text).upper()
    memory_types = ["GDDR6X", "GDDR6", "GDDR5X", "GDDR5", "HBM2E", "HBM2", "HBM", "DDR4", "DDR5"]

    for mem_type in memory_types:
        if mem_type in text:
            return mem_type

    return None


def process_dataframe(df: pd.DataFrame, vendor: str) -> pd.DataFrame:
    df.columns = normalize_columns(df.columns)
    df = standardise_column_names(df)

    # General header cleanup patterns
    df.columns = [re.sub(r" Arc \w+$", "", c) for c in df.columns]
    df.columns = [re.sub(r"(?:\[[A-Za-z0-9]+\])+", "", c) for c in df.columns]
    df.columns = [c.replace("- ", "").replace("/ ", "/").strip() for c in df.columns]

    df["Vendor"] = vendor

    # Launch / Release Date extraction
    launch_cols = [c for c in df.columns if re.search(r"launch|release date", c, re.I)]
    if launch_cols:
        col = launch_cols[0]
        df[col] = (
            df[col]
            .astype(str)
            .str.replace(REFERENCES_AT_END, "", regex=True)
            .str.extract(r"([A-Za-z]+\s*\d{1,2},?\s*\d{4}|\d{4})", expand=False)
        )
        df["Launch"] = pd.to_datetime(df[col], errors="coerce")
    else:
        df["Launch"] = pd.NaT

    # Extract memory information
    memory_cols = [c for c in df.columns if re.search(r"memory|vram|gddr", c, re.I)]
    if memory_cols:
        col = memory_cols[0]
        df["Memory_GB"] = df[col].apply(extract_memory_gb)
        df["Memory_Type"] = df[col].apply(extract_memory_type)
    else:
        df["Memory_GB"] = None
        df["Memory_Type"] = None

    # Extract core information
    core_cols = [c for c in df.columns if re.search(r"cores?|cuda|stream|compute", c, re.I)]
    if core_cols:
        col = core_cols[0]
        df["Cores"] = df[col].apply(extract_cores)
    else:
        df["Cores"] = None

    # Drop completely duplicated column titles
    df = df.loc[:, ~pd.Index(df.columns).duplicated(keep="first")]
    return df


def remove_bracketed_references(df: pd.DataFrame, cols: List[str]) -> pd.DataFrame:
    for c in cols:
        if c in df.columns:
            df[c] = df[c].astype(str).str.replace(r"\[\d+\]", "", regex=True).str.strip()
    return df


def fetch_vendor_tables(vendor: str, url: str) -> List[pd.DataFrame]:
    print(f"Fetching {vendor} → {url}")
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        response = requests.get(url, timeout=45, headers=headers)
        response.raise_for_status()
        html = clean_html(response.text)

        # Попробуем разные паттерны для поиска таблиц
        patterns = [
            r"Launch|Release Date",
            r"Model.*Launch",
            r"GPU.*Launch",
            r"Release.*Date",
            r"Launch.*Date",
        ]

        dfs = []
        for pattern in patterns:
            try:
                found_dfs = pd.read_html(StringIO(html), match=re.compile(pattern, re.I))
                dfs.extend(found_dfs)
                if found_dfs:
                    print(f"  ✅ Found {len(found_dfs)} tables with pattern: {pattern}")
                    break
            except Exception as e:
                print(f"  ⚠️  Pattern {pattern} failed: {e}")
                continue

        # Специальная обработка для NVIDIA
        if vendor == "NVIDIA" and not dfs:
            try:
                for df_t in pd.read_html(StringIO(html), match=re.compile(r"Release date", re.I)):
                    t = df_t.T.reset_index()
                    cols = pd.MultiIndex.from_arrays([t.iloc[0].astype(str), t.iloc[1].astype(str)])
                    tidy = pd.DataFrame(t.iloc[2:].values, columns=cols).reset_index(drop=True)
                    tidy.columns = normalize_columns(tidy.columns)
                    tidy = tidy.rename(columns={"Release date": "Launch"})
                    tidy = standardise_column_names(tidy)
                    dfs.append(tidy)
                    print("  ✅ Found NVIDIA transposed table")
            except Exception as e:
                print(f"  ⚠️  NVIDIA transposed table failed: {e}")

        return dfs

    except requests.RequestException as e:
        print(f"  ❌ Network error for {vendor}: {e}")
        return []
    except Exception as e:
        print(f"  ❌ Parsing error for {vendor}: {e}")
        return []


def record_key(row: Dict[str, Any]) -> str:
    vendor = row.get("Vendor", "UNKNOWN").strip()
    code = str(row.get("Code name", "")).strip()
    if code and code.lower() not in {"nan", ""}:
        return f"{vendor}_{code}"

    model = str(row.get("Model name", row.get("Model", "UnknownModel"))).strip()
    model = re.sub(r"[^A-Za-z0-9]+", "_", model) or "UnknownModel"
    return f"{vendor}_{model}"


def scrape_gpu_catalog_raw(raw_output_path: str | Path | None = None) -> Dict[str, Dict[str, Any]]:
    """Scrape GPU data from Wikipedia and merge into gpu_data_raw.json."""
    raw_path = (
        Path(raw_output_path) if raw_output_path is not None else BACKEND_DIR / "gpu_data_raw.json"
    )
    frames: List[pd.DataFrame] = []
    successful_vendors = []

    for vendor, info in data.items():
        try:
            print(f"Processing {vendor}...")
            # Добавляем задержку между запросами
            time.sleep(2)
            vendor_frames = []
            for raw in fetch_vendor_tables(vendor, info["url"]):
                if raw.shape[0] >= 2 and raw.shape[1] >= 3:
                    processed = process_dataframe(raw, vendor)
                    vendor_frames.append(processed)
                    print(f"  ✅ Processed table with {raw.shape[0]} rows")

            if vendor_frames:
                frames.extend(vendor_frames)
                successful_vendors.append(vendor)
                print(f"  ✅ {vendor}: {len(vendor_frames)} tables processed")
            else:
                print(f"  ⚠️  {vendor}: No valid tables found")

        except Exception as e:
            print(f"  ❌ Error processing {vendor}: {e}")
            continue

    if not frames:
        print("❌ No GPU tables parsed from any vendor. Wiki markup may have changed.")
        # Создаем минимальный набор данных для тестирования
        fallback_data: Dict[str, Dict[str, Any]] = {
            "NVIDIA_RTX_4090": {
                "Vendor": "NVIDIA",
                "Model": "GeForce RTX 4090",
                "Model name": "GeForce RTX 4090",
                "Memory_GB": 24.0,
                "Cores": 16384,
                "Launch": "2022-10-12",
                "Memory_Type": "GDDR6X",
                "Memory Size (MiB)": "24576",  # 24GB в MiB
                "TDP (Watts)": "450",
            },
            "NVIDIA_RTX_4080": {
                "Vendor": "NVIDIA",
                "Model": "GeForce RTX 4080",
                "Model name": "GeForce RTX 4080",
                "Memory_GB": 16.0,
                "Cores": 9728,
                "Launch": "2022-11-16",
                "Memory_Type": "GDDR6X",
                "Memory Size (MiB)": "16384",  # 16GB в MiB
                "TDP (Watts)": "320",
            },
            "NVIDIA_RTX_4070": {
                "Vendor": "NVIDIA",
                "Model": "GeForce RTX 4070",
                "Model name": "GeForce RTX 4070",
                "Memory_GB": 12.0,
                "Cores": 5888,
                "Launch": "2023-04-13",
                "Memory_Type": "GDDR6X",
                "Memory Size (MiB)": "12288",  # 12GB в MiB
                "TDP (Watts)": "200",
            },
            "AMD_RX_7900_XTX": {
                "Vendor": "AMD",
                "Model": "Radeon RX 7900 XTX",
                "Model name": "Radeon RX 7900 XTX",
                "Memory_GB": 24.0,
                "Cores": 6144,
                "Launch": "2022-12-13",
                "Memory_Type": "GDDR6",
                "Memory Size (MiB)": "24576",  # 24GB в MiB
                "TDP (Watts)": "355",
            },
        }

        # Merge fallback into existing data (don't overwrite)
        existing_fb: Dict[str, Dict[str, Any]] = {}
        if raw_path.exists():
            try:
                with raw_path.open("r", encoding="utf-8-sig") as f:
                    existing_fb = json.load(f)
            except Exception:
                existing_fb = {}
        for k, v in fallback_data.items():
            if k not in existing_fb:
                existing_fb[k] = v
        with raw_path.open("w", encoding="utf-8") as fp:
            json.dump(existing_fb, fp, indent=2, ensure_ascii=False, default=str)
        print(f"Merged fallback data -> {len(existing_fb)} GPUs in {raw_path.name}")
        return existing_fb

    print(
        f"✅ Successfully processed {len(successful_vendors)} vendors: {', '.join(successful_vendors)}"
    )

    df = pd.concat(frames, ignore_index=True, sort=False)
    df = remove_bracketed_references(
        df,
        [
            "Model",
            "Model name",
            "Model (Codename)",
            "Model (Code name)",
            "Die size",
            "Die size (mm2)",
            "Code name",
        ],
    )

    # Фильтрация GPU: оставляем только те, у которых Launch дата после 2013 года
    if "Launch" in df.columns:
        # Преобразуем даты в формат datetime, если это возможно
        df["Launch"] = pd.to_datetime(df["Launch"], errors="coerce")
        # Фильтруем только GPU с датой запуска после 2013 года
        df = df[df["Launch"].dt.year > 2013] if not df["Launch"].isna().all() else df
        print(f"✅ Filtered GPUs: kept {len(df)} out of original count based on Launch date > 2013")
    else:
        print("⚠️  Launch date column not found, skipping year filter")

    scraped: Dict[str, Dict[str, Any]] = {}
    for record in df.to_dict(orient="records"):
        compact = {k: v for k, v in record.items() if pd.notna(v)}
        key = record_key(compact)
        if key in scraped:
            i = 2
            while f"{key}_{i}" in scraped:
                i += 1
            key = f"{key}_{i}"
        scraped[key] = compact

    # Merge strategy: load existing data, then overlay scraped entries.
    # Existing entries NOT present in scraped data are preserved (not deleted).
    existing: Dict[str, Dict[str, Any]] = {}
    if raw_path.exists():
        try:
            with raw_path.open("r", encoding="utf-8-sig") as f:
                existing = json.load(f)
        except Exception:
            existing = {}

    old_count = len(existing)
    added = 0
    updated = 0
    for key, value in scraped.items():
        if key not in existing:
            added += 1
        else:
            updated += 1
        existing[key] = value

    with raw_path.open("w", encoding="utf-8") as fp:
        json.dump(existing, fp, indent=2, ensure_ascii=False, default=str)

    print(
        f"[OK] Merge: {old_count} existing + {added} added + {updated} updated "
        f"= {len(existing)} total -> {raw_path.name}"
    )
    return existing


def main() -> Dict[str, Dict[str, Any]]:
    """CLI entrypoint compatible with `python -m ...` usage."""
    return scrape_gpu_catalog_raw()


if __name__ == "__main__":
    main()
