from __future__ import annotations

import csv
import json
from pathlib import Path

from app.core.text_utils import clean_text

try:
    from bs4 import BeautifulSoup
except ImportError:  # pragma: no cover
    BeautifulSoup = None


SUPPORTED_EXTENSIONS = {".txt", ".md", ".markdown", ".csv", ".json", ".html", ".htm"}


def load_document(path: Path) -> str:
    extension = path.suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file type: {extension or 'unknown'}. "
            "This slim build currently supports txt, md, csv, json and html."
        )

    if extension in {".txt", ".md", ".markdown"}:
        return clean_text(path.read_text(encoding="utf-8", errors="ignore"))

    if extension == ".csv":
        return _load_csv(path)

    if extension == ".json":
        payload = json.loads(path.read_text(encoding="utf-8", errors="ignore"))
        return clean_text(json.dumps(payload, ensure_ascii=False, indent=2))

    if extension in {".html", ".htm"}:
        return _load_html(path)

    raise ValueError(f"Unsupported file type: {extension}")


def _load_csv(path: Path) -> str:
    rows: list[str] = []
    with path.open("r", encoding="utf-8", errors="ignore", newline="") as handle:
        reader = csv.reader(handle)
        for row in reader:
            rows.append(" | ".join(cell.strip() for cell in row))
    return clean_text("\n".join(rows))


def _load_html(path: Path) -> str:
    html = path.read_text(encoding="utf-8", errors="ignore")
    if BeautifulSoup is None:
        return clean_text(html)
    soup = BeautifulSoup(html, "html.parser")
    return clean_text(soup.get_text(separator="\n"))
