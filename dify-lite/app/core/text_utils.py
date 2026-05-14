from __future__ import annotations

import math
import re
from collections import Counter


WHITESPACE_RE = re.compile(r"\s+")
PARAGRAPH_BREAK_RE = re.compile(r"\n{2,}")
SENTENCE_BREAK_RE = re.compile(r"(?<=[\.\!\?。！？])\s+")
TOKEN_RE = re.compile(r"[A-Za-z0-9_\-\u4e00-\u9fff]+")


def clean_text(value: str) -> str:
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    paragraphs = [WHITESPACE_RE.sub(" ", paragraph).strip() for paragraph in PARAGRAPH_BREAK_RE.split(value)]
    paragraphs = [paragraph for paragraph in paragraphs if paragraph]
    return "\n\n".join(paragraphs)


def tokenize(value: str) -> list[str]:
    tokens: list[str] = []
    for token in TOKEN_RE.findall(value):
        normalized = token.lower()
        tokens.append(normalized)
        if _contains_cjk(normalized):
            cjk_text = "".join(char for char in normalized if "\u4e00" <= char <= "\u9fff")
            tokens.extend(_cjk_ngrams(cjk_text))
    return tokens


def token_count(value: str) -> int:
    return len(tokenize(value))


def lexical_score(query: str, content: str) -> float:
    query_tokens = tokenize(query)
    content_tokens = tokenize(content)
    if not query_tokens or not content_tokens:
        return 0.0
    query_counter = Counter(query_tokens)
    content_counter = Counter(content_tokens)
    overlap = 0.0
    for token, count in query_counter.items():
        overlap += min(count, content_counter.get(token, 0))
    norm = math.sqrt(sum(value * value for value in query_counter.values()))
    return overlap / max(norm, 1.0)


def _contains_cjk(value: str) -> bool:
    return any("\u4e00" <= char <= "\u9fff" for char in value)


def _cjk_ngrams(value: str) -> list[str]:
    if not value:
        return []
    grams: list[str] = []
    for size in (2, 3, 4, 5, 6):
        if len(value) < size:
            continue
        grams.extend(value[index : index + size] for index in range(0, len(value) - size + 1))
    return grams


def split_text(value: str, chunk_size: int, overlap: int) -> list[str]:
    if chunk_size <= 0:
        raise ValueError("chunk_size must be greater than 0")
    if overlap >= chunk_size:
        raise ValueError("chunk_overlap must be smaller than chunk_size")

    paragraphs = [paragraph.strip() for paragraph in PARAGRAPH_BREAK_RE.split(value) if paragraph.strip()]
    units: list[str] = []
    for paragraph in paragraphs:
        if len(paragraph) <= chunk_size:
            units.append(paragraph)
            continue
        sentences = [sentence.strip() for sentence in SENTENCE_BREAK_RE.split(paragraph) if sentence.strip()]
        if sentences:
            units.extend(sentences)
        else:
            units.extend(paragraph[index : index + chunk_size] for index in range(0, len(paragraph), chunk_size))

    chunks: list[str] = []
    current = ""
    for unit in units:
        candidate = unit if not current else f"{current}\n\n{unit}"
        if len(candidate) <= chunk_size:
            current = candidate
            continue

        if current:
            chunks.append(current)
            tail = current[-overlap:] if overlap > 0 else ""
            current = f"{tail}{unit}" if tail else unit
            if len(current) > chunk_size:
                chunks.extend(_hard_split(current, chunk_size, overlap))
                current = ""
        else:
            chunks.extend(_hard_split(unit, chunk_size, overlap))
            current = ""

    if current:
        chunks.append(current)
    return [chunk.strip() for chunk in chunks if chunk.strip()]


def _hard_split(value: str, chunk_size: int, overlap: int) -> list[str]:
    step = max(chunk_size - overlap, 1)
    return [value[index : index + chunk_size] for index in range(0, len(value), step)]
