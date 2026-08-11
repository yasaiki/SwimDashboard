#!/usr/bin/env python3
"""Read Sofia and Noah ReachForTheWall PDF exports and embed them in the HTML dashboard.

Default files (put in the same folder as this script):
  Swimmer Stats – Sofia.pdf
  Swimmer Stats – Noah.pdf
  swimmerProgressDashboard.html

Usage:
  py reachforthewall_pdf_sync.py

Optional paths:
  py reachforthewall_pdf_sync.py --sofia-pdf "C:\\path\\Swimmer Stats – Sofia.pdf" \\
      --noah-pdf "C:\\path\\Swimmer Stats – Noah.pdf" \\
      --html "C:\\path\\swimmerProgressDashboard.html"

The script extracts text directly from the PDFs with pdfplumber, parses timed swims,
updates swimmer_dashboard_data.json, and replaces the RFTW_DATA block already present
in swimmerProgressDashboard.html.
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime
from pathlib import Path

import pdfplumber

SCRIPT_VERSION = "2026.08.11-pdf-two-swimmer-sync-v1"

DEFAULT_SOFIA_PDF = "Swimmer Stats – Sofia.pdf"
DEFAULT_NOAH_PDF = "Swimmer Stats – Noah.pdf"
DEFAULT_HTML = "swimmerProgressDashboard.html"
DEFAULT_JSON = "swimmer_dashboard_data.json"

START_MARKER = "// RFTW_DATA_START"
END_MARKER = "// RFTW_DATA_END"

SWIMMERS = {
    "sofia": {
        "name": "Sofia Li",
        "sourceUrl": "https://reachforthewall.org/swimmer-stats/?sid=Li,Sofia381062500",
    },
    "noah": {
        "name": "Noah Lau",
        "sourceUrl": "https://reachforthewall.org/swimmer-stats/?sid=Lau,NoahM349335000",
    },
}

# Example row:
# 25 Back Meters 6 34.13 30.75 Division O Championship Summer MCSL Eldwick 07/18/26
ROW_RE = re.compile(
    r"^\s*"
    r"(?P<distance>\d+)\s+"
    r"(?P<stroke>Back|Backstroke|Breast|Breaststroke|Fly|Butterfly|Free|Freestyle|IM|Individual Medley)\s+"
    r"(?P<course>Meters|Meter|Metres|Metre|Yards|Yard)\s+"
    r"(?P<age>\d+)\s+"
    r"(?P<time>\d{1,2}:\d{1,2}(?:\.\d+)?|\d{1,3}(?:\.\d+)?)\s+"
    r"(?P<converted>\d{1,2}:\d{1,2}(?:\.\d+)?|\d{1,3}(?:\.\d+)?)\s+"
    r"(?P<meet>.*?)\s+"
    r"(?P<season>Summer|Winter|Spring|Fall|Autumn)\s+"
    r"(?P<league>\S+)\s+"
    r"(?P<team>.*?)\s+"
    r"(?P<date>\d{1,2}/\d{1,2}/\d{2,4})\s*$",
    re.IGNORECASE,
)


def clean_text(value: str | None) -> str:
    if not value:
        return ""
    value = value.replace("\xa0", " ")
    return re.sub(r"\s+", " ", value).strip()


def seconds_from_time(value: str) -> float:
    value = clean_text(value)
    if ":" in value:
        minutes, seconds = value.split(":", 1)
        return round(float(minutes) * 60 + float(seconds), 2)
    return round(float(value), 2)


def normalize_stroke(raw: str) -> str:
    s = clean_text(raw).lower()
    if s in {"free", "freestyle"}:
        return "Freestyle"
    if s in {"back", "backstroke"}:
        return "Back Stroke"
    if s in {"breast", "breaststroke"}:
        return "Breast Stroke"
    if s in {"fly", "butterfly"}:
        return "Butterfly"
    if s in {"im", "individual medley"}:
        return "Individual Medley"
    raise ValueError(f"Unsupported stroke: {raw}")


def normalize_distance(distance: str, course: str) -> str:
    unit = "Y" if clean_text(course).lower().startswith("yard") else "M"
    return f"{int(distance)}{unit}"


def parse_date(raw: str) -> tuple[str, int]:
    for fmt in ("%m/%d/%y", "%m/%d/%Y"):
        try:
            dt = datetime.strptime(raw, fmt)
            return dt.strftime("%Y-%m-%d"), dt.year
        except ValueError:
            pass
    raise ValueError(f"Unsupported meet date: {raw}")


def extract_pdf_lines(pdf_path: Path) -> list[str]:
    lines: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            # This text mode has proven more stable for these ReachForTheWall PDFs
            # than reconstructing the table geometry manually.
            text = page.extract_text(x_tolerance=2, y_tolerance=3) or ""
            lines.extend(text.splitlines())
    return lines


def parse_pdf(pdf_path: Path, swimmer_key: str) -> list[dict]:
    lines = extract_pdf_lines(pdf_path)
    records: list[dict] = []

    for line in lines:
        line = clean_text(line)
        match = ROW_RE.match(line)
        if not match:
            continue

        groups = match.groupdict()
        date_iso, year = parse_date(groups["date"])

        records.append(
            {
                "date": date_iso,
                "year": year,
                "stroke": normalize_stroke(groups["stroke"]),
                "distance": normalize_distance(groups["distance"], groups["course"]),
                "time": seconds_from_time(groups["time"]),
                "meet": clean_text(groups["meet"]),
                "age": int(groups["age"]),
            }
        )

    # Remove exact duplicates that can occur in some PDF exports.
    unique: dict[tuple, dict] = {}
    for r in records:
        key = (r["date"], r["stroke"], r["distance"], r["time"], r["meet"], r["age"])
        unique[key] = r

    result = sorted(
        unique.values(),
        key=lambda r: (r["date"], r["stroke"], r["distance"], r["time"]),
    )

    if not result:
        # Give a useful diagnostic without requiring OCR.
        sample = "\n".join(lines[:80])
        raise RuntimeError(
            f"No timed swims were parsed from {pdf_path.name} for "
            f"{SWIMMERS[swimmer_key]['name']}.\n\n"
            f"Extracted-text sample:\n{sample}"
        )

    return result


def build_payload(sofia_pdf: Path, noah_pdf: Path) -> dict:
    payload = {}

    for key, pdf_path in (("sofia", sofia_pdf), ("noah", noah_pdf)):
        print(f"Reading {SWIMMERS[key]['name']} from: {pdf_path}")
        records = parse_pdf(pdf_path, key)
        payload[key] = {
            "name": SWIMMERS[key]["name"],
            "sourceUrl": SWIMMERS[key]["sourceUrl"],
            "sourcePdf": pdf_path.name,
            "records": records,
        }
        print(f"  Parsed {len(records)} timed swims.")

    return payload


def embed_payload(html_path: Path, payload: dict) -> None:
    text = html_path.read_text(encoding="utf-8")

    if START_MARKER not in text or END_MARKER not in text:
        raise RuntimeError(
            f"{html_path.name} does not contain the required "
            f"{START_MARKER} / {END_MARKER} markers."
        )

    replacement = (
        f"{START_MARKER}\n"
        f"const swimmerData = {json.dumps(payload, ensure_ascii=False, indent=2)};\n"
        f"const dataLastSynced = {json.dumps(datetime.now().strftime('%Y-%m-%d %H:%M:%S'))};\n"
        f"{END_MARKER}"
    )

    pattern = re.compile(
        re.escape(START_MARKER) + r".*?" + re.escape(END_MARKER),
        re.DOTALL,
    )
    html_path.write_text(pattern.sub(replacement, text), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Read Sofia and Noah ReachForTheWall PDFs and embed the results into the swimmer dashboard."
    )
    parser.add_argument("--sofia-pdf", default=DEFAULT_SOFIA_PDF)
    parser.add_argument("--noah-pdf", default=DEFAULT_NOAH_PDF)
    parser.add_argument("--html", default=DEFAULT_HTML)
    parser.add_argument("--json", default=DEFAULT_JSON)
    args = parser.parse_args()

    print(f"Script version: {SCRIPT_VERSION}")

    sofia_pdf = Path(args.sofia_pdf).resolve()
    noah_pdf = Path(args.noah_pdf).resolve()
    html_path = Path(args.html).resolve()
    json_path = Path(args.json).resolve()

    for required in (sofia_pdf, noah_pdf, html_path):
        if not required.exists():
            raise FileNotFoundError(f"Required file not found: {required}")

    payload = build_payload(sofia_pdf, noah_pdf)

    embed_payload(html_path, payload)
    json_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("")
    print(f"Updated HTML: {html_path}")
    print(f"Updated JSON: {json_path}")
    for key in ("sofia", "noah"):
        print(f"{payload[key]['name']}: {len(payload[key]['records'])} records embedded")


if __name__ == "__main__":
    main()
