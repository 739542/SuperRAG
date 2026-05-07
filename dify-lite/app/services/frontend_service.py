from __future__ import annotations

from typing import Any

from app.config import Settings
from app.services.chat_service import ChatService
from app.services.ingestion_service import IngestionService
from app.services.retrieval_service import RetrievalService
from app.storage.repository import Repository


class FrontendService:
    def __init__(
        self,
        settings: Settings,
        repository: Repository,
        ingestion_service: IngestionService,
        retrieval_service: RetrievalService,
        chat_service: ChatService,
    ):
        self._settings = settings
        self._repository = repository
        self._ingestion_service = ingestion_service
        self._retrieval_service = retrieval_service
        self._chat_service = chat_service

    def list_documents(self) -> list[dict[str, Any]]:
        return [self._normalize_document(item) for item in self._repository.list_documents()]

    def import_document(
        self,
        *,
        title: str,
        doc_type: str,
        project: str,
        version: str,
        scene: str,
        summary: str,
        upload: Any,
        clean_enabled: bool,
        chunk_size: int | None,
        chunk_overlap: int | None,
    ) -> dict[str, Any]:
        collection = self._resolve_or_create_collection(project)
        result = self._ingestion_service.import_document(
            collection_id=collection["id"],
            upload=upload,
            clean_enabled=clean_enabled,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            title=title,
            doc_type=doc_type,
            project=project,
            version=version,
            scene=scene,
            summary=summary,
        )
        return {
            "document": self._normalize_document(result["document"]),
            "collection": collection,
            "chunks_indexed": result["chunks_indexed"],
            "warnings": result.get("warnings", []),
        }

    def run_scene(self, scene: str, payload: dict[str, Any]) -> dict[str, Any]:
        query = (payload.get("query") or "").strip()
        if not query:
            raise ValueError("query is required")

        collection = self._resolve_collection((payload.get("project") or "").strip())
        retrieval = self._retrieval_service.retrieve(collection_id=collection["id"], query=query, top_k=5)
        answer = self._chat_service.answer(
            collection_id=collection["id"],
            query=query,
            top_k=5,
            system_prompt=self._build_system_prompt(scene, payload),
        )

        citations = self._build_citations(retrieval["hits"])
        result = {
            "scene": scene,
            "source": "Dify Lite",
            "title": f"{self._scene_label(scene)}结果",
            "summary": answer["answer"],
            "evidence": self._build_evidence(retrieval["hits"]),
            "risks": self._build_risks(scene),
            "nextActions": self._build_next_actions(scene, payload),
            "artifacts": self._build_artifacts(scene, payload, retrieval["hits"]),
            "citations": citations,
            "collection": {
                "id": collection["id"],
                "name": collection["name"],
            },
        }
        if retrieval.get("warning"):
            result["warning"] = retrieval["warning"]
        return result

    def health(self) -> dict[str, Any]:
        collections = self._repository.list_collections()
        documents = self._repository.list_documents()
        return {
            "status": "ok",
            "service": self._settings.app_name,
            "collections": len(collections),
            "documents": len(documents),
        }

    def _resolve_or_create_collection(self, project: str) -> dict[str, Any]:
        project_name = project.strip() or "默认项目"
        existing = self._repository.get_collection_by_name(project_name)
        if existing:
            return existing
        return self._repository.create_collection(project_name, f"{project_name} 的知识库")

    def _resolve_collection(self, project: str) -> dict[str, Any]:
        if project:
            collection = self._repository.get_collection_by_name(project)
            if collection:
                return collection
            raise ValueError(f"project '{project}' has no imported documents")

        collections = self._repository.list_collections()
        if not collections:
            raise ValueError("no collections available, please import documents first")
        return collections[0]

    def _normalize_document(self, item: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": item["id"],
            "collectionId": item["collection_id"],
            "collectionName": item.get("collection_name") or item.get("project") or "默认项目",
            "title": item.get("title") or item.get("original_name") or item.get("filename") or "未命名文档",
            "type": item.get("doc_type") or "未分类",
            "project": item.get("project") or item.get("collection_name") or "默认项目",
            "version": item.get("version") or "v1.0",
            "scene": item.get("scene") or "通用",
            "summary": item.get("summary") or "",
            "status": item.get("status") or "已入库",
            "originalName": item.get("original_name") or item.get("filename") or "",
            "chunkCount": item.get("chunk_count") or 0,
            "charCount": item.get("char_count") or 0,
            "createdAt": item.get("created_at") or "",
        }

    def _scene_label(self, scene: str) -> str:
        return {
            "general": "通用检索",
            "training": "培训模式",
            "handover": "交接模式",
            "design": "设计辅助",
        }.get(scene, scene)

    def _build_system_prompt(self, scene: str, payload: dict[str, Any]) -> str:
        focus = (payload.get("focus") or "").strip()
        role = (payload.get("role") or "").strip()
        module = (payload.get("module") or "").strip()
        instructions = {
            "general": "请用中文给出简洁结论，并明确引用到的关键信息。",
            "training": "请用中文回答，适合培训新人，先讲背景，再讲关键概念，最后给出学习建议。",
            "handover": "请用中文回答，强调当前进度、风险、待办和责任边界，适合项目交接。",
            "design": "请用中文回答，强调功能清单、文本用例、模块边界和设计风险。",
        }
        extra = " ".join(part for part in [f"对象：{role}" if role else "", f"模块：{module}" if module else "", f"重点：{focus}" if focus else ""] if part)
        return (
            "你是一个面向软件工程知识库的中文助手。"
            "请尽量只根据提供的检索上下文作答，信息不足时要明确说明。"
            f"{instructions.get(scene, instructions['general'])}"
            f"{extra}"
        )

    def _build_evidence(self, hits: list[dict[str, Any]]) -> list[str]:
        evidence = []
        for item in hits[:4]:
            source = item.get("metadata", {}).get("source_name") or "资料"
            excerpt = item.get("content", "").strip().replace("\n", " ")
            evidence.append(f"{source}: {excerpt[:140]}{'...' if len(excerpt) > 140 else ''}")
        if evidence:
            return evidence
        return ["当前知识库没有检索到相关片段，请先导入文档或调整问题表述。"]

    def _build_citations(self, hits: list[dict[str, Any]]) -> list[dict[str, str]]:
        citations = []
        for item in hits[:5]:
            metadata = item.get("metadata", {})
            source = metadata.get("source_name") or "知识库片段"
            snippet = item.get("content", "").strip().replace("\n", " ")
            citations.append({"title": source, "snippet": snippet[:220]})
        return citations

    def _build_risks(self, scene: str) -> list[str]:
        common = [
            "回答质量依赖当前已导入资料，资料不完整或过期时结论会受影响。",
            "如果相同主题分散在多份文档且命名不清晰，检索命中率会下降。",
        ]
        extras = {
            "training": ["培训输出如果缺少背景材料，新人会知道答案但不清楚上下文。"],
            "handover": ["交接输出如果没有最新进度文档，待办和风险可能不完整。"],
            "design": ["设计输出如果缺少需求和现有模块资料，功能边界容易漂移。"],
        }
        return common + extras.get(scene, [])

    def _build_next_actions(self, scene: str, payload: dict[str, Any]) -> list[str]:
        project = (payload.get("project") or "").strip() or "当前项目"
        common = [
            f"继续补充 {project} 的核心设计、交接和培训文档，提高检索覆盖率。",
            "将高频问题整理成固定模板，方便后续稳定复用。",
        ]
        extras = {
            "training": ["优先补充术语解释、系统主链路和新人上手资料。"],
            "handover": ["补齐当前进度、依赖接口、未完成事项和负责人信息。"],
            "design": ["把功能清单、文本用例和模块边界沉淀成结构化文档。"],
        }
        return common + extras.get(scene, [])

    def _build_artifacts(self, scene: str, payload: dict[str, Any], hits: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if scene != "design":
            return [
                {
                    "title": "相关资料",
                    "items": [item.get("metadata", {}).get("source_name") or "知识片段" for item in hits[:4]],
                }
            ]

        module_name = (payload.get("module") or "").strip() or "目标模块"
        feature_items = []
        for item in hits[:3]:
            excerpt = item.get("content", "").strip().replace("\n", " ")
            feature_items.append(excerpt[:80] + ("..." if len(excerpt) > 80 else ""))

        if not feature_items:
            feature_items = ["当前没有足够上下文，建议先导入需求、设计和交接资料。"]

        return [
            {"title": "功能清单候选", "items": feature_items},
            {
                "title": "文本用例建议",
                "items": [
                    f"用户进入 {module_name} 后输入目标问题并查看结构化结果。",
                    f"系统基于知识库检索 {module_name} 相关资料并生成设计草案。",
                    "用户根据输出继续补充模块边界、风险和后续动作。",
                ],
            },
            {
                "title": "模块边界建议",
                "items": ["前端页面交互", "检索与问答服务", "知识库文档治理", "结果记录与回看"],
            },
        ]
