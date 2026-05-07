from __future__ import annotations

from flask import Flask

from .api.routes import api_blueprint
from .config import Settings
from .services.chat_service import ChatService
from .services.frontend_service import FrontendService
from .services.ingestion_service import IngestionService
from .services.retrieval_service import RetrievalService
from .storage.db import bootstrap_database
from .storage.repository import Repository


def create_app() -> Flask:
    settings = Settings.from_env()
    settings.ensure_directories()
    bootstrap_database(settings)

    repository = Repository(settings)
    retrieval_service = RetrievalService(settings, repository)
    ingestion_service = IngestionService(settings, repository)
    chat_service = ChatService(settings, retrieval_service)
    frontend_service = FrontendService(settings, repository, ingestion_service, retrieval_service, chat_service)

    app = Flask(__name__, static_folder="static", template_folder="templates")
    app.config["SETTINGS"] = settings
    app.config["REPOSITORY"] = repository
    app.config["RETRIEVAL_SERVICE"] = retrieval_service
    app.config["INGESTION_SERVICE"] = ingestion_service
    app.config["CHAT_SERVICE"] = chat_service
    app.config["FRONTEND_SERVICE"] = frontend_service

    @app.after_request
    def add_cors_headers(response):
        response.headers["Access-Control-Allow-Origin"] = settings.cors_allow_origin
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        return response

    app.register_blueprint(api_blueprint)
    return app
