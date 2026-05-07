from __future__ import annotations

from flask import Blueprint, current_app, jsonify, render_template, request

api_blueprint = Blueprint("dify_lite", __name__)


def _json() -> dict:
    return request.get_json(silent=True) or {}


@api_blueprint.route("/", methods=["GET"])
def index():
    settings = current_app.config["SETTINGS"]
    return render_template("index.html", settings=settings.public_config())


@api_blueprint.route("/api/health", methods=["GET"])
def health():
    frontend_service = current_app.config["FRONTEND_SERVICE"]
    return jsonify(frontend_service.health())


@api_blueprint.route("/api/config", methods=["GET"])
def config():
    settings = current_app.config["SETTINGS"]
    return jsonify(settings.public_config())


@api_blueprint.route("/api/collections", methods=["GET", "POST", "OPTIONS"])
def collections():
    repository = current_app.config["REPOSITORY"]
    ingestion_service = current_app.config["INGESTION_SERVICE"]

    if request.method == "OPTIONS":
        return ("", 204)
    if request.method == "GET":
        return jsonify({"items": repository.list_collections()})

    payload = _json()
    name = (payload.get("name") or "").strip()
    description = payload.get("description") or ""
    if not name:
        return jsonify({"error": "name is required"}), 400

    try:
        item = ingestion_service.create_collection(name=name, description=description)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(item), 201


@api_blueprint.route("/api/documents", methods=["GET"])
def documents():
    frontend_service = current_app.config["FRONTEND_SERVICE"]
    collection_id = request.args.get("collection_id")
    if collection_id:
        repository = current_app.config["REPOSITORY"]
        items = repository.list_documents(collection_id=collection_id)
        return jsonify({"items": items})
    return jsonify({"items": frontend_service.list_documents()})


@api_blueprint.route("/api/documents/import", methods=["POST", "OPTIONS"])
def import_document():
    frontend_service = current_app.config["FRONTEND_SERVICE"]
    if request.method == "OPTIONS":
        return ("", 204)

    upload = request.files.get("file")
    clean_enabled = request.form.get("clean_enabled", "true").lower() == "true"
    chunk_size = request.form.get("chunk_size")
    chunk_overlap = request.form.get("chunk_overlap")
    title = request.form.get("title", "").strip()
    doc_type = request.form.get("type", "").strip()
    project = request.form.get("project", "").strip()
    version = request.form.get("version", "").strip()
    scene = request.form.get("scene", "").strip()
    summary = request.form.get("summary", "").strip()

    try:
        result = frontend_service.import_document(
            title=title,
            doc_type=doc_type,
            project=project,
            version=version,
            scene=scene,
            summary=summary,
            upload=upload,
            clean_enabled=clean_enabled,
            chunk_size=int(chunk_size) if chunk_size else None,
            chunk_overlap=int(chunk_overlap) if chunk_overlap else None,
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(result), 201


@api_blueprint.route("/api/scenes/<scene>", methods=["POST", "OPTIONS"])
def run_scene(scene: str):
    frontend_service = current_app.config["FRONTEND_SERVICE"]
    if request.method == "OPTIONS":
        return ("", 204)

    if scene not in {"general", "training", "handover", "design"}:
        return jsonify({"error": "unsupported scene"}), 404

    payload = _json()
    try:
        result = frontend_service.run_scene(scene, payload)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(result)


@api_blueprint.route("/api/retrieval/query", methods=["POST", "OPTIONS"])
def retrieval_query():
    retrieval_service = current_app.config["RETRIEVAL_SERVICE"]
    if request.method == "OPTIONS":
        return ("", 204)

    payload = _json()
    try:
        result = retrieval_service.retrieve(
            collection_id=(payload.get("collection_id") or "").strip(),
            query=(payload.get("query") or "").strip(),
            top_k=int(payload.get("top_k", 5)),
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(result)


@api_blueprint.route("/api/chat/completions", methods=["POST", "OPTIONS"])
def chat_completions():
    chat_service = current_app.config["CHAT_SERVICE"]
    if request.method == "OPTIONS":
        return ("", 204)

    payload = _json()
    try:
        result = chat_service.answer(
            collection_id=(payload.get("collection_id") or "").strip(),
            query=(payload.get("query") or "").strip(),
            top_k=int(payload.get("top_k", 5)),
            history=payload.get("history") or [],
            model_name=payload.get("model"),
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(result)
