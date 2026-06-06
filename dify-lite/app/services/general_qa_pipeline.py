from __future__ import annotations

import re
from typing import Any


class GeneralQAPipeline:
    version = "aucmr-general-qa-pipeline-v1"

    def __init__(self, frontend_service: Any):
        self._frontend = frontend_service

    def run(self, *, payload: dict[str, Any], collection: dict[str, Any], query: str) -> dict[str, Any]:
        if self._is_document_list_question(query):
            return self._build_document_list_result(payload=payload, collection=collection, query=query)

        scene_prompt = self._frontend._build_system_prompt("general", payload)
        scene_context = self._frontend._build_scene_context("general", payload)
        answer = self._frontend._chat_service.answer(
            collection_id=collection["id"],
            query=query,
            top_k=5,
            system_prompt=scene_prompt,
            scene="general",
            context=scene_context,
        )
        citations = answer.get("citations", [])
        structured_answer = self._build_structured_answer(
            query=query,
            collection=collection,
            payload=payload,
            answer=answer,
            citations=citations,
        )
        uncertainty_items = structured_answer.get("uncertaintyItems", [])
        quality_assessment = self._frontend._build_scene_quality_assessment(
            "general",
            {
                "summary": structured_answer.get("conclusion", ""),
                "openQuestions": uncertainty_items,
            },
            citations,
        )
        return {
            "scene": "general",
            "source": "Dify Lite + General QA Pipeline",
            "title": f"{self._frontend._scene_label('general')}结果",
            "summary": structured_answer.get("conclusion", ""),
            "answer": structured_answer.get("conclusion", ""),
            "evidence": structured_answer.get("evidenceItems", []),
            "risks": uncertainty_items,
            "nextActions": structured_answer.get("followUpItems", []) or structured_answer.get("suggestionItems", []),
            "citations": citations,
            "evidenceLevel": answer.get("evidenceLevel", "low"),
            "structuredAnswer": structured_answer,
            "pipelineVersion": self.version,
            "pipelineSteps": [
                "chat_answer",
                "general_scene_compiler",
            ],
            "pipeline": {
                "version": self.version,
                "steps": [
                    {
                        "name": "chat_answer",
                        "status": "completed",
                        "output": answer.get("pipeline", {}),
                    },
                    {
                        "name": "general_scene_compiler",
                        "status": "completed",
                        "output": {
                            "basisSummary": structured_answer.get("basisSummary", ""),
                            "evidenceItemCount": len(structured_answer.get("evidenceItems", [])),
                            "followUpCount": len(structured_answer.get("followUpItems", [])),
                        },
                    },
                ],
            },
            "queryDesigner": answer.get("query_designer", {}),
            "retriever": answer.get("retriever", {}),
            "evidenceCollector": answer.get("evidence_collector", {}),
            "answerGenerator": answer.get("answer_generator", {}),
            "validator": answer.get("validator", {}),
            "missingInformation": answer.get("missing_information", []),
            "implementationSuggestions": answer.get("implementation_suggestions", []),
            "uncertainPoints": uncertainty_items,
            "collection": {
                "id": collection["id"],
                "name": collection["name"],
            },
            "qualityAssessment": quality_assessment,
            "generationMode": "model" if answer.get("provider") == "openai-compatible" else "retrieval-fallback",
            "warning": answer.get("warning", ""),
        }

    def _build_document_list_result(self, *, payload: dict[str, Any], collection: dict[str, Any], query: str) -> dict[str, Any]:
        documents = [
            self._frontend._normalize_document(item)
            for item in self._frontend._repository.list_documents(collection_id=collection["id"])
        ]
        documents = sorted(documents, key=lambda item: str(item.get("title") or ""))
        conclusion_lines = [f"当前知识库中可见的文档共有 {len(documents)} 个："]
        conclusion_lines.extend(
            [f"{index + 1}. {item.get('title') or '未命名文档'}" for index, item in enumerate(documents)]
        )
        conclusion_lines.append(f"以上结果来自 {collection['name']} 的实时文档列表。")

        evidence_items = [
            {
                "title": item.get("title") or "未命名文档",
                "summary": f"文档类型：{item.get('type') or '未分类'}；所属项目：{item.get('project') or collection['name']}；当前状态：{item.get('status') or '已入库'}。",
                "score": 1.0,
                "documentId": item.get("id", ""),
                "chunkId": "",
            }
            for item in documents[:8]
        ]
        citations = [
            {
                "id": item.get("id", ""),
                "title": item.get("title") or "未命名文档",
                "documentTitle": item.get("title") or "未命名文档",
                "documentId": item.get("id", ""),
                "chunkIndex": 0,
                "snippet": f"该文档当前已存在于 {collection['name']} 的实时文档列表中。",
                "score": 1.0,
                "relevanceScore": 1.0,
                "vectorScore": 0.0,
                "lexicalScore": 0.0,
                "chunkId": "",
                "sourceName": item.get("title") or "未命名文档",
                "segmentId": "",
            }
            for item in documents[:5]
        ]
        structured_answer = {
            "conclusion": "\n".join(conclusion_lines),
            "basisSummary": f"本次回答直接基于 {collection['name']} 的实时文档列表整理，不依赖前端二次归纳。",
            "evidence": "\n".join(
                f"{index + 1}. {item['title']}：{item['summary']}" for index, item in enumerate(evidence_items)
            ),
            "evidenceItems": evidence_items,
            "suggestion": "",
            "suggestionItems": [],
            "followUpItems": [
                "是否需要继续说明每个文档分别覆盖什么主题？",
                "是否需要整理这些文档之间的上下游关系？",
                "是否需要筛出与权限或金额规则最相关的文档？",
            ],
            "uncertainty": "当前回答基于文档列表接口，若后台文档刚新增或删除，请以文档知识库页面最终展示为准。",
            "uncertaintyItems": [
                "当前回答基于文档列表接口，若后台文档刚新增或删除，请以文档知识库页面最终展示为准。"
            ],
        }
        quality_assessment = self._frontend._build_scene_quality_assessment(
            "general",
            {
                "summary": structured_answer["conclusion"],
                "openQuestions": structured_answer["uncertaintyItems"],
            },
            citations,
        )
        return {
            "scene": "general",
            "source": "Dify Lite + General QA Pipeline",
            "title": "通用检索结果",
            "summary": structured_answer["conclusion"],
            "answer": structured_answer["conclusion"],
            "evidence": evidence_items,
            "risks": structured_answer["uncertaintyItems"],
            "nextActions": structured_answer["followUpItems"],
            "citations": citations,
            "evidenceLevel": "partial",
            "structuredAnswer": structured_answer,
            "pipelineVersion": self.version,
            "pipelineSteps": [
                "document_registry_lookup",
                "general_scene_compiler",
            ],
            "pipeline": {
                "version": self.version,
                "steps": [
                    {
                        "name": "document_registry_lookup",
                        "status": "completed",
                        "output": {
                            "documentCount": len(documents),
                            "collection": collection["name"],
                        },
                    },
                    {
                        "name": "general_scene_compiler",
                        "status": "completed",
                        "output": {
                            "query": query,
                            "evidenceItemCount": len(evidence_items),
                        },
                    },
                ],
            },
            "queryDesigner": {
                "queries": [query],
                "reason": "文档清单问题直接走知识库文档列表查询。",
            },
            "retriever": {
                "queries": [query],
                "groups": [],
                "hit_count": len(documents),
                "warning": "",
            },
            "evidenceCollector": {
                "groups": [],
                "evidence": evidence_items,
                "missing_information": [],
            },
            "answerGenerator": {
                "provider": "document-registry",
                "raw_answer": structured_answer["conclusion"],
                "fallback_used": False,
            },
            "validator": {
                "valid_claims": [f"当前知识库可见文档数量：{len(documents)}"],
                "unsupported_claims": [],
                "uncertain_claims": structured_answer["uncertaintyItems"],
                "final_revision_advice": "如需核对最新状态，请以文档知识库页面为准。",
                "qualityAssessment": quality_assessment,
            },
            "missingInformation": [],
            "implementationSuggestions": [],
            "uncertainPoints": structured_answer["uncertaintyItems"],
            "collection": {
                "id": collection["id"],
                "name": collection["name"],
            },
            "qualityAssessment": quality_assessment,
            "generationMode": "document-registry",
        }

    def _build_structured_answer(
        self,
        *,
        query: str,
        collection: dict[str, Any],
        payload: dict[str, Any],
        answer: dict[str, Any],
        citations: list[dict[str, Any]],
    ) -> dict[str, Any]:
        backend_structured = answer.get("structured_answer") if isinstance(answer.get("structured_answer"), dict) else {}
        conclusion = str(backend_structured.get("conclusion") or answer.get("answer") or "").strip()
        evidence_items = self._build_evidence_items(citations)
        suggestion_items = self._dedupe_texts(
            [
                str(item).strip()
                for item in answer.get("implementation_suggestions", [])
                if str(item).strip()
            ]
        )
        follow_up_items = self._build_follow_up_questions(
            query=query,
            citations=citations,
            collection_name=collection["name"],
            project=self._frontend._payload_text(payload, "project"),
        )
        uncertainty_items = self._dedupe_texts(
            [
                *[str(item).strip() for item in answer.get("uncertain_points", []) if str(item).strip()],
                *[str(item).strip() for item in answer.get("missing_information", []) if str(item).strip()],
                *[
                    str(item).strip()
                    for item in (answer.get("validator", {}) or {}).get("unsupported_claims", [])
                    if str(item).strip()
                ],
                *[
                    str(item).strip()
                    for item in (answer.get("validator", {}) or {}).get("uncertain_claims", [])
                    if str(item).strip()
                ],
            ]
        )
        uncertainty_text = "\n".join(uncertainty_items) if uncertainty_items else "当前没有识别到明显的不确定项。"
        evidence_text = "\n".join(
            f"{index + 1}. {item['title']}：{item['summary']}" for index, item in enumerate(evidence_items)
        )
        suggestion_text = "\n".join(suggestion_items)
        return {
            "conclusion": conclusion or "当前暂无明确结论。",
            "basisSummary": self._build_basis_summary(
                collection_name=collection["name"],
                citations=citations,
                evidence_level=str(answer.get("evidenceLevel") or "low"),
            ),
            "evidence": evidence_text or str(backend_structured.get("evidence") or ""),
            "evidenceItems": evidence_items,
            "suggestion": suggestion_text or str(backend_structured.get("suggestion") or ""),
            "suggestionItems": suggestion_items,
            "followUpItems": follow_up_items,
            "uncertainty": uncertainty_text,
            "uncertaintyItems": uncertainty_items,
        }

    def _build_basis_summary(self, *, collection_name: str, citations: list[dict[str, Any]], evidence_level: str) -> str:
        if not citations:
            return f"本次回答主要基于 {collection_name} 的检索结果整理，但当前没有返回可直接引用的证据片段。"

        grouped: dict[str, int] = {}
        for item in citations:
            title = str(item.get("documentTitle") or item.get("title") or item.get("sourceName") or "知识库片段").strip()
            grouped[title] = grouped.get(title, 0) + 1
        docs_text = "、".join(f"{title}（{count} 个片段）" for title, count in list(grouped.items())[:4])
        if evidence_level in {"sufficient", "high"}:
            status_text = "当前证据可支撑初步回答，但正式使用前仍建议核对原文。"
        elif evidence_level in {"partial", "medium"}:
            status_text = "当前证据部分可支撑回答，仍需结合原文确认关键细节。"
        else:
            status_text = "当前证据偏弱，正式使用前建议继续补充资料并人工复核。"
        return f"本次回答主要基于 {collection_name} 中的 {docs_text}。{status_text}"

    def _build_evidence_items(self, citations: list[dict[str, Any]]) -> list[dict[str, Any]]:
        items = []
        for citation in citations[:5]:
            items.append(
                {
                    "title": citation.get("documentTitle") or citation.get("title") or citation.get("sourceName") or "知识库片段",
                    "summary": str(citation.get("snippet") or citation.get("content") or "").strip()
                    or "该文档命中当前问题相关证据。",
                    "score": float(citation.get("relevanceScore") or citation.get("score") or 0),
                    "documentId": citation.get("documentId") or "",
                    "chunkId": citation.get("chunkId") or citation.get("segmentId") or citation.get("id") or "",
                }
            )
        return items

    def _build_follow_up_questions(
        self,
        *,
        query: str,
        citations: list[dict[str, Any]],
        collection_name: str,
        project: str,
    ) -> list[str]:
        text = " ".join(
            [
                query,
                collection_name,
                project,
                *[
                    f"{item.get('documentTitle', '')} {item.get('snippet', '')}"
                    for item in citations[:6]
                ],
            ]
        )
        if re.search(r"客户|商机|合同|回款|发票|CRM", text, re.IGNORECASE):
            return [
                "是否需要继续说明这些模块之间的业务关系？",
                "是否需要整理权限、金额、状态流转相关规则？",
                "是否需要转入需求设计辅助生成结构化结果？",
            ]
        return [
            "是否需要继续查看相关文档原文？",
            "是否需要把当前结论整理成功能清单或流程说明？",
            "是否需要列出当前知识库中仍缺少哪些关键文档？",
        ]

    def _dedupe_texts(self, items: list[str]) -> list[str]:
        seen: set[str] = set()
        result: list[str] = []
        for item in items:
            text = str(item or "").strip()
            if not text or text in seen:
                continue
            seen.add(text)
            result.append(text)
        return result

    def _is_document_list_question(self, query: str) -> bool:
        return bool(re.search(r"(有哪些|有哪几个|有几个|目前有哪些|当前有哪些|收录了哪些)(文档|文件|资料)", query))
