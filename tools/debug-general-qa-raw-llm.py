from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = ROOT / "dify-lite"
sys.path.insert(0, str(BACKEND_ROOT))

from app import create_app  # noqa: E402


def infer_stage(messages: list[dict[str, str]], call_index: int) -> str:
    if messages:
        system_text = str(messages[0].get("content") or "")
        if "You are Query Designer" in system_text:
            return "query_designer"
        if "You are Evidence Collector" in system_text:
            return "evidence_collector"
        if "You are Answer Generator" in system_text:
            return "answer_generator"
        if "You are Validator" in system_text:
            return "validator"
    return f"call_{call_index + 1}"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Capture raw LLM responses for the general QA pipeline without frontend mapping."
    )
    parser.add_argument("--query", required=True, help="Question to send into the general QA scene.")
    parser.add_argument("--project", default="", help="Optional project name.")
    parser.add_argument("--collection-id", default="", help="Optional collection id.")
    parser.add_argument(
        "--focus",
        default="evidence",
        choices=["concise", "detailed", "evidence"],
        help="Answer mode / focus value passed to the scene payload.",
    )
    parser.add_argument(
        "--include-final",
        action="store_true",
        help="Include the final backend assembled response for comparison.",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    app = create_app()
    chat_service = app.config["CHAT_SERVICE"]
    frontend_service = app.config["FRONTEND_SERVICE"]
    settings = app.config["SETTINGS"]

    payload = {
        "query": args.query,
        "project": args.project,
        "collection_id": args.collection_id,
        "focus": args.focus,
        "user": "codex-raw-llm-debug",
    }

    traces: list[dict[str, Any]] = []
    original_call = chat_service._call_openai_compatible

    def wrapped_call(messages: list[dict[str, str]], model_name: str, **kwargs: Any) -> str:
        stage_index = len(traces)
        stage = infer_stage(messages, stage_index)
        raw_text = original_call(messages, model_name, **kwargs)
        traces.append(
            {
                "stage": stage,
                "model": model_name,
                "temperature": kwargs.get("temperature"),
                "max_tokens": kwargs.get("max_tokens"),
                "timeout_seconds": kwargs.get("timeout_seconds"),
                "messages": messages,
                "raw_response_text": raw_text,
            }
        )
        return raw_text

    chat_service._call_openai_compatible = wrapped_call

    try:
        result = frontend_service.run_scene("general", payload)
    finally:
        chat_service._call_openai_compatible = original_call

    output: dict[str, Any] = {
        "request_payload": payload,
        "model_enabled": bool(settings.model_base_url and settings.model_name),
        "raw_model_calls": traces,
    }

    if not traces:
        output["note"] = (
            "No raw LLM calls were captured. This usually means one of three things: "
            "1) the model is not configured, 2) the question hit a non-LLM shortcut path, "
            "or 3) the pipeline returned before entering model generation."
        )

    if args.include_final:
        output["final_backend_response"] = result

    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
