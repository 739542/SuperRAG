from __future__ import annotations

from flask import Blueprint, current_app, jsonify, render_template, request, send_from_directory

api_blueprint = Blueprint("dify_lite", __name__)


def _json() -> dict:
    return request.get_json(silent=True) or {}


@api_blueprint.route("/", methods=["GET"])
def index():
    settings = current_app.config["SETTINGS"]
    frontend_dir = settings.base_dir.parent / "第一版"
    if (frontend_dir / "index.html").is_file():
        return send_from_directory(frontend_dir, "index.html")
    return render_template("index.html", settings=settings.public_config())


@api_blueprint.route("/<path:asset_path>", methods=["GET"])
def frontend_asset(asset_path: str):
    settings = current_app.config["SETTINGS"]
    frontend_dir = settings.base_dir.parent / "第一版"
    target_path = (frontend_dir / asset_path).resolve()
    if frontend_dir.is_dir() and target_path.is_file() and frontend_dir.resolve() in target_path.parents:
        return send_from_directory(frontend_dir, asset_path)
    return jsonify({"error": "not found"}), 404


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


@api_blueprint.route("/api/documents/source", methods=["GET", "OPTIONS"])
def document_source():
    frontend_service = current_app.config["FRONTEND_SERVICE"]
    if request.method == "OPTIONS":
        return ("", 204)

    try:
        result = frontend_service.get_document_source(
            document_id=(request.args.get("document_id") or "").strip(),
            chunk_id=(request.args.get("chunk_id") or "").strip(),
            source_name=(request.args.get("source_name") or "").strip(),
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(result)


@api_blueprint.route("/api/documents/<document_id>/chunks", methods=["GET", "OPTIONS"])
def document_chunks(document_id: str):
    frontend_service = current_app.config["FRONTEND_SERVICE"]
    if request.method == "OPTIONS":
        return ("", 204)

    try:
        limit = int(request.args.get("limit", 20))
        result = frontend_service.get_document_chunks(document_id=document_id, limit=limit)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(result)


@api_blueprint.route("/api/documents/<document_id>/references", methods=["GET", "OPTIONS"])
def document_references(document_id: str):
    frontend_service = current_app.config["FRONTEND_SERVICE"]
    if request.method == "OPTIONS":
        return ("", 204)

    try:
        return jsonify(frontend_service.get_document_references(document_id))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 404


@api_blueprint.route("/api/documents/<document_id>", methods=["GET", "DELETE", "OPTIONS"])
def document_detail(document_id: str):
    if request.method == "OPTIONS":
        return ("", 204)

    if request.method == "GET":
        frontend_service = current_app.config["FRONTEND_SERVICE"]
        try:
            return jsonify(frontend_service.get_document_detail(document_id))
        except Exception as exc:
            return jsonify({"error": str(exc)}), 404

    repository = current_app.config["REPOSITORY"]
    settings = current_app.config["SETTINGS"]
    document = repository.delete_document(document_id)
    if not document:
        return jsonify({"error": "document not found"}), 404

    filename = document.get("filename") or ""
    if filename:
        upload_path = (settings.uploads_dir / filename).resolve()
        try:
            if upload_path.is_file() and settings.uploads_dir.resolve() in upload_path.parents:
                upload_path.unlink()
        except OSError:
            pass

    return jsonify({"success": True, "id": document_id})


@api_blueprint.route("/api/artifacts", methods=["GET", "POST", "OPTIONS"])
def artifacts():
    frontend_service = current_app.config["FRONTEND_SERVICE"]
    if request.method == "OPTIONS":
        return ("", 204)

    if request.method == "GET":
        return jsonify(
            {
                "items": frontend_service.list_artifacts(
                    {
                        "scene": request.args.get("scene", ""),
                        "sceneMode": request.args.get("sceneMode", ""),
                        "project": request.args.get("project", ""),
                        "keyword": request.args.get("keyword", ""),
                    }
                )
            }
        )

    try:
        result = frontend_service.create_artifact(_json())
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(result), 201


@api_blueprint.route("/api/artifacts/<artifact_id>", methods=["GET", "DELETE", "OPTIONS"])
def artifact_detail(artifact_id: str):
    frontend_service = current_app.config["FRONTEND_SERVICE"]
    if request.method == "OPTIONS":
        return ("", 204)

    if request.method == "GET":
        try:
            return jsonify(frontend_service.get_artifact(artifact_id))
        except Exception as exc:
            return jsonify({"error": str(exc)}), 404

    return jsonify(frontend_service.delete_artifact(artifact_id))


@api_blueprint.route("/api/artifacts/<artifact_id>/review", methods=["PATCH", "POST", "OPTIONS"])
def artifact_review(artifact_id: str):
    frontend_service = current_app.config["FRONTEND_SERVICE"]
    if request.method == "OPTIONS":
        return ("", 204)

    try:
        return jsonify(frontend_service.update_artifact_review(artifact_id, _json()))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 404


@api_blueprint.route("/api/artifacts/<artifact_id>/versions", methods=["GET", "OPTIONS"])
def artifact_versions(artifact_id: str):
    frontend_service = current_app.config["FRONTEND_SERVICE"]
    if request.method == "OPTIONS":
        return ("", 204)

    try:
        return jsonify({"items": frontend_service.get_artifact(artifact_id).get("versionRecords", [])})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 404


@api_blueprint.route("/api/knowledge-gaps", methods=["GET", "OPTIONS"])
def knowledge_gaps():
    frontend_service = current_app.config["FRONTEND_SERVICE"]
    if request.method == "OPTIONS":
        return ("", 204)
    return jsonify(frontend_service.get_knowledge_gaps())


@api_blueprint.route("/api/demo-center", methods=["GET", "OPTIONS"])
def demo_center():
    frontend_service = current_app.config["FRONTEND_SERVICE"]
    if request.method == "OPTIONS":
        return ("", 204)
    return jsonify(frontend_service.get_demo_center())


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
        queries = payload.get("queries") or []
        if queries:
            result = retrieval_service.retrieve_many(
                collection_id=(payload.get("collection_id") or "").strip(),
                queries=[str(item) for item in queries],
                top_k=int(payload.get("top_k", 5)),
            )
        else:
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
            scene=(payload.get("scene") or "general").strip() or "general",
            context=payload.get("context") if isinstance(payload.get("context"), dict) else None,
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(result)


@api_blueprint.route("/api/chat/suggestions", methods=["POST", "OPTIONS"])
def chat_suggestions():
    frontend_service = current_app.config["FRONTEND_SERVICE"]
    if request.method == "OPTIONS":
        return ("", 204)

    try:
        result = frontend_service.suggest_chat_questions(_json())
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(result)
