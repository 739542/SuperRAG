/**
 * SuperRAG frontend API configuration.
 *
 * This file is intentionally small so the backend base URL can be changed
 * without touching page code. Do not put API keys in frontend files.
 */
(function () {
  const existing = window.SuperRagConfig || {};
  const sameOriginApi =
    window.location.protocol === "file:" ? "http://127.0.0.1:8088/api" : `${window.location.origin}/api`;

  window.SuperRagConfig = {
    API_BASE_URL: existing.API_BASE_URL || sameOriginApi,
    DOCUMENT_API_TIMEOUT_MS: existing.DOCUMENT_API_TIMEOUT_MS || 60000,
    CHAT_API_TIMEOUT_MS: existing.CHAT_API_TIMEOUT_MS || 240000,
    USE_REAL_DOCUMENT_API: existing.USE_REAL_DOCUMENT_API !== false,
  };

  function getConfig() {
    return window.SuperRagConfig;
  }

  async function requestJson(path, options = {}) {
    const config = getConfig();
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || config.DOCUMENT_API_TIMEOUT_MS || 5000;
    const timeoutId = setTimeout(() => controller.abort(`Request timed out after ${timeoutMs}ms`), timeoutMs);
    try {
      const { timeoutMs: _timeoutMs, ...fetchOptions } = options;
      const response = await fetch(`${config.API_BASE_URL}${path}`, {
        ...fetchOptions,
        signal: controller.signal,
      });
      const payload = await parseJson(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || `HTTP ${response.status}`);
      }
      return payload;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function parseJson(response) {
    const text = await response.text();
    if (!text) {
      return {};
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      return { message: text };
    }
  }

  function nowText() {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .format(new Date())
      .replace(/\//g, "-");
  }

  function getHistoryRecords() {
    try {
      return JSON.parse(localStorage.getItem("superrag_real_history") || "[]");
    } catch (error) {
      return [];
    }
  }

  async function fetchHistoryRecords(params = {}) {
    const query = new URLSearchParams();
    if (params.keyword) {
      query.set("keyword", params.keyword);
    }
    if (params.sceneMode) {
      query.set("scene", params.sceneMode === "chat" ? "general" : params.sceneMode);
    }
    if (params.project) {
      query.set("project", params.project);
    }
    const path = `/artifacts${query.toString() ? `?${query.toString()}` : ""}`;
    const response = await requestJson(path, {
      timeoutMs: window.SuperRagConfig?.DOCUMENT_API_TIMEOUT_MS || 60000,
    });
    return Array.isArray(response.items) ? response.items : [];
  }

  async function fetchHistoryRecord(id) {
    return requestJson(`/artifacts/${encodeURIComponent(id)}`, {
      timeoutMs: window.SuperRagConfig?.DOCUMENT_API_TIMEOUT_MS || 60000,
    });
  }

  async function updateHistoryReview(id, payload = {}) {
    const saved = await requestJson(`/artifacts/${encodeURIComponent(id)}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      timeoutMs: window.SuperRagConfig?.DOCUMENT_API_TIMEOUT_MS || 60000,
      body: JSON.stringify(payload),
    });
    const normalized = mapArtifactToLocalHistory(saved);
    const records = [normalized, ...getHistoryRecords().filter((item) => item.id !== normalized.id)].slice(0, 80);
    localStorage.setItem("superrag_real_history", JSON.stringify(records));
    return saved;
  }

  function appendHistoryRecord(record) {
    const normalized = normalizeArtifactRecord(record);
    const records = [normalized, ...getHistoryRecords().filter((item) => item.id !== normalized.id)].slice(0, 80);
    localStorage.setItem("superrag_real_history", JSON.stringify(records));
    requestJson("/artifacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeoutMs: window.SuperRagConfig?.DOCUMENT_API_TIMEOUT_MS || 60000,
      body: JSON.stringify(normalized),
    })
      .then((saved) => {
        const next = [mapArtifactToLocalHistory(saved), ...getHistoryRecords().filter((item) => item.id !== saved.id)].slice(0, 80);
        localStorage.setItem("superrag_real_history", JSON.stringify(next));
      })
      .catch((error) => {
        console.warn(`[SuperRAG Backend] artifact persistence fallback to localStorage: ${error.message || error}`);
      });
    return normalized;
  }

  function deleteHistoryRecord(id) {
    const records = getHistoryRecords().filter((record) => record.id !== id);
    localStorage.setItem("superrag_real_history", JSON.stringify(records));
    requestJson(`/artifacts/${encodeURIComponent(id)}`, {
      method: "DELETE",
      timeoutMs: window.SuperRagConfig?.DOCUMENT_API_TIMEOUT_MS || 60000,
    }).catch((error) => {
      console.warn(`[SuperRAG Backend] artifact delete fallback to localStorage only: ${error.message || error}`);
    });
  }

  function normalizeArtifactRecord(record = {}) {
    const createdAt = record.createdAt || nowText();
    const sceneMode = record.sceneMode || record.scene || "chat";
    const scene = sceneMode === "chat" ? "general" : sceneMode;
    const id = record.id || record.artifactId || `artifact-${Date.now()}`;
    return {
      id,
      artifactId: id,
      artifactType: record.artifactType || `${scene}-output`,
      scene,
      sceneMode,
      title: record.title || "SuperRAG 历史产物",
      query: record.query || record.originalQuestion || "",
      originalQuestion: record.originalQuestion || record.query || "",
      project: record.project || "SuperRAG",
      summary: record.summary || record.outputSummary || "",
      outputSummary: record.outputSummary || record.summary || "",
      structuredOutput: record.structuredOutput || record.structuredAnswer || {},
      citations: normalizeCitations(record.citations || [], {
        scene,
        artifactId: id,
        artifactType: record.artifactType || `${scene}-output`,
        createdAt,
      }),
      qualityAssessment: record.qualityAssessment || {},
      reviewStatus: record.reviewStatus || "草稿",
      humanNotes: record.humanNotes || "",
      creator: record.creator || "course-demo-user",
      createdAt,
      updatedAt: record.updatedAt || record.updated_at || createdAt,
      versionRecords: normalizeVersionRecords(record.versionRecords || record.version_records || []),
    };
  }

  function normalizeCitations(citations = [], context = {}) {
    return (Array.isArray(citations) ? citations : [])
      .filter(Boolean)
      .map((item, index) => {
        if (typeof item !== "object") {
          item = { id: String(item), chunkId: String(item) };
        }
        const chunkId = item.chunkId || item.chunk_id || item.segmentId || item.segment_id || item.id || "";
        const score = Number(item.score ?? item.relevanceScore ?? item.relevance_score ?? 0);
        return {
          id: item.id || chunkId || `citation-${index + 1}`,
          documentId: item.documentId || item.document_id || "",
          documentTitle: item.documentTitle || item.document_title || item.title || item.sourceName || item.source_name || "知识库片段",
          chunkId,
          chunkIndex: item.chunkIndex ?? item.chunk_index ?? item.position ?? "",
          snippet: item.snippet || item.content || "",
          score,
          relevanceScore: score,
          vectorScore: Number(item.vectorScore ?? item.vector_score ?? 0),
          lexicalScore: Number(item.lexicalScore ?? item.lexical_score ?? 0),
          scene: context.scene || item.scene || "general",
          artifactId: context.artifactId || item.artifactId || item.artifact_id || "",
          artifactType: context.artifactType || item.artifactType || item.artifact_type || "",
          createdAt: context.createdAt || item.createdAt || item.created_at || "",
          sourceName: item.sourceName || item.source_name || item.documentTitle || item.document_title || item.title || "",
          segmentId: item.segmentId || item.segment_id || chunkId,
        };
      });
  }

  function mapArtifactToLocalHistory(raw = {}) {
    return {
      id: raw.id || raw.artifactId || raw.artifact_id,
      artifactId: raw.artifactId || raw.artifact_id || raw.id,
      artifactType: raw.artifactType || raw.artifact_type || "",
      scene: raw.scene || "",
      sceneMode: raw.sceneMode || raw.scene_mode || (raw.scene === "general" ? "chat" : raw.scene || "chat"),
      title: raw.title || "SuperRAG 历史产物",
      query: raw.query || raw.originalQuestion || raw.original_question || "",
      originalQuestion: raw.originalQuestion || raw.original_question || raw.query || "",
      project: raw.project || "SuperRAG",
      summary: raw.summary || raw.outputSummary || raw.output_summary || "",
      outputSummary: raw.outputSummary || raw.output_summary || raw.summary || "",
      structuredOutput: raw.structuredOutput || raw.structured_output || {},
      citations: normalizeCitations(raw.citations || [], {
        scene: raw.scene || "general",
        artifactId: raw.id || raw.artifactId || "",
        artifactType: raw.artifactType || raw.artifact_type || "",
        createdAt: raw.createdAt || raw.created_at || "",
      }),
      qualityAssessment: raw.qualityAssessment || raw.quality_assessment || {},
      reviewStatus: raw.reviewStatus || raw.review_status || "草稿",
      humanNotes: raw.humanNotes || raw.human_notes || "",
      creator: raw.creator || "course-demo-user",
      createdAt: raw.createdAt || raw.created_at || nowText(),
      updatedAt: raw.updatedAt || raw.updated_at || raw.createdAt || raw.created_at || nowText(),
      versionRecords: normalizeVersionRecords(raw.versionRecords || raw.version_records || []),
    };
  }

  function normalizeVersionRecords(items = []) {
    return (Array.isArray(items) ? items : [])
      .filter(Boolean)
      .map((item, index) => ({
        id: item.id || `version-${index + 1}`,
        artifactId: item.artifactId || item.artifact_id || "",
        version: item.version || `v${index + 1}`,
        time: item.time || item.createdAt || item.created_at || "",
        operator: item.operator || "course-demo-user",
        change: item.change || item.changeSummary || item.change_summary || "保存产物版本快照",
        snapshot: item.snapshot || {},
      }));
  }

  window.SuperRagBackend = {
    getConfig,
    requestJson,
    nowText,
    getHistoryRecords,
    fetchHistoryRecords,
    fetchHistoryRecord,
    updateHistoryReview,
    appendHistoryRecord,
    deleteHistoryRecord,
    normalizeCitations,
    normalizeVersionRecords,
    normalizeArtifactRecord,
    mapArtifactToLocalHistory,
  };
})();
