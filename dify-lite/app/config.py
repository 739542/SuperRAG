from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(slots=True)
class Settings:
    app_name: str
    host: str
    port: int
    debug: bool
    base_dir: Path
    data_dir: Path
    uploads_dir: Path
    db_path: Path
    weaviate_url: str
    weaviate_api_key: str
    weaviate_class_name: str
    embedding_engine: str
    embedding_dimension: int
    embedding_model_name: str
    model_base_url: str
    model_api_key: str
    model_name: str
    model_timeout_seconds: float
    default_chunk_size: int
    default_chunk_overlap: int
    max_context_chunks: int
    cors_allow_origin: str

    @classmethod
    def from_env(cls) -> "Settings":
        base_dir = Path(__file__).resolve().parents[1]
        _load_env_file(base_dir / ".env")
        data_dir = Path(os.getenv("DIFY_LITE_DATA_DIR", base_dir / "data")).resolve()
        uploads_dir = data_dir / "uploads"
        db_path = data_dir / "dify_lite.db"
        return cls(
            app_name=os.getenv("DIFY_LITE_APP_NAME", "Dify Lite"),
            host=os.getenv("DIFY_LITE_HOST", "127.0.0.1"),
            port=int(os.getenv("DIFY_LITE_PORT", "8088")),
            debug=os.getenv("DIFY_LITE_DEBUG", "false").lower() == "true",
            base_dir=base_dir,
            data_dir=data_dir,
            uploads_dir=uploads_dir,
            db_path=db_path,
            weaviate_url=os.getenv("DIFY_LITE_WEAVIATE_URL", "http://127.0.0.1:8080").rstrip("/"),
            weaviate_api_key=os.getenv("DIFY_LITE_WEAVIATE_API_KEY", ""),
            weaviate_class_name=os.getenv("DIFY_LITE_WEAVIATE_CLASS", "DifyLiteChunk"),
            embedding_engine=os.getenv("DIFY_LITE_EMBEDDING_ENGINE", "hash"),
            embedding_dimension=int(os.getenv("DIFY_LITE_EMBEDDING_DIMENSION", "384")),
            embedding_model_name=os.getenv("DIFY_LITE_EMBEDDING_MODEL", ""),
            model_base_url=os.getenv("DIFY_LITE_MODEL_BASE_URL", "").rstrip("/"),
            model_api_key=os.getenv("DIFY_LITE_MODEL_API_KEY", ""),
            model_name=os.getenv("DIFY_LITE_MODEL_NAME", ""),
            model_timeout_seconds=float(os.getenv("DIFY_LITE_MODEL_TIMEOUT", "180")),
            default_chunk_size=int(os.getenv("DIFY_LITE_CHUNK_SIZE", "800")),
            default_chunk_overlap=int(os.getenv("DIFY_LITE_CHUNK_OVERLAP", "120")),
            max_context_chunks=int(os.getenv("DIFY_LITE_MAX_CONTEXT_CHUNKS", "6")),
            cors_allow_origin=os.getenv("DIFY_LITE_CORS_ALLOW_ORIGIN", "*"),
        )

    def ensure_directories(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.uploads_dir.mkdir(parents=True, exist_ok=True)

    def public_config(self) -> dict:
        return {
            "app_name": self.app_name,
            "embedding_engine": self.embedding_engine,
            "embedding_dimension": self.embedding_dimension,
            "weaviate_url": self.weaviate_url,
            "model_enabled": bool(self.model_base_url and self.model_name),
            "default_chunk_size": self.default_chunk_size,
            "default_chunk_overlap": self.default_chunk_overlap,
            "max_context_chunks": self.max_context_chunks,
        }


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value
