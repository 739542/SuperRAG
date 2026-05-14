from __future__ import annotations

import csv
import json
import zipfile
from xml.etree import ElementTree
from pathlib import Path

from app.core.text_utils import clean_text

try:
    from bs4 import BeautifulSoup
except ImportError:  # pragma: no cover
    BeautifulSoup = None


SUPPORTED_EXTENSIONS = {".txt", ".md", ".markdown", ".csv", ".json", ".html", ".htm", ".docx", ".pptx"}


def load_document(path: Path) -> str:
    extension = path.suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file type: {extension or 'unknown'}. "
            "This slim build currently supports txt, md, csv, json, html, docx and pptx."
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

    if extension == ".docx":
        return _load_docx(path)

    if extension == ".pptx":
        return _load_pptx(path)

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


def _load_docx(path: Path) -> str:
    texts: list[str] = []
    try:
        with zipfile.ZipFile(path) as archive:
            document_xml = _read_zip_text(archive, "word/document.xml")
            if not document_xml:
                raise ValueError("Invalid docx file: word/document.xml is missing.")
            texts.extend(_extract_xml_text(document_xml))
            for name in sorted(archive.namelist()):
                if name.startswith("word/header") or name.startswith("word/footer"):
                    texts.extend(_extract_xml_text(_read_zip_text(archive, name)))
    except zipfile.BadZipFile as exc:
        raise ValueError("Invalid docx file. Please upload a real .docx file, not an old .doc file or a renamed file.") from exc
    return clean_text("\n".join(texts))


def _load_pptx(path: Path) -> str:
    slides: list[str] = []
    try:
        with zipfile.ZipFile(path) as archive:
            slide_names = sorted(
                name for name in archive.namelist() if name.startswith("ppt/slides/slide") and name.endswith(".xml")
            )
            if not slide_names:
                raise ValueError("Invalid pptx file: slides are missing.")
            for index, name in enumerate(slide_names, start=1):
                slide_text = "\n".join(_extract_xml_text(_read_zip_text(archive, name)))
                if slide_text.strip():
                    slides.append(f"Slide {index}\n{slide_text}")
    except zipfile.BadZipFile as exc:
        raise ValueError("Invalid pptx file. Please upload a real .pptx file, not an old .ppt file or a renamed file.") from exc
    return clean_text("\n\n".join(slides))


def _read_zip_text(archive: zipfile.ZipFile, name: str) -> str:
    try:
        return archive.read(name).decode("utf-8", errors="ignore")
    except KeyError:
        return ""


def _extract_xml_text(xml_text: str) -> list[str]:
    if not xml_text.strip():
        return []
    try:
        root = ElementTree.fromstring(xml_text)
    except ElementTree.ParseError:
        return []
    texts = [node.text.strip() for node in root.iter() if node.text and node.text.strip()]
    return texts
