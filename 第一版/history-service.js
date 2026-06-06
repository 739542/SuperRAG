/**
 * History service and adapter layer.
 * Combines backend artifacts with locally cached real-run records only.
 */
(function () {
  let records = [];

  function clone(value) {
    return structuredClone(value);
  }

  async function getHistoryRecords(params = {}) {
    const keyword = String(params.keyword || "").trim().toLowerCase();
    const sceneMode = String(params.sceneMode || "");
    const project = String(params.project || "");
    const creator = String(params.creator || "");
    const dateFrom = String(params.dateFrom || "");
    const dateTo = String(params.dateTo || "");

    const list = (await getCombinedRecords(params))
      .filter((record) => {
        const haystack = [record.title, record.summary, record.originalQuestion, record.outputSummary]
          .join(" ")
          .toLowerCase();
        return (
          (!keyword || haystack.includes(keyword)) &&
          (!sceneMode || record.sceneMode === sceneMode) &&
          (!project || record.project === project) &&
          (!creator || record.creator === creator) &&
          (!dateFrom || toDateText(record.createdAt) >= dateFrom) &&
          (!dateTo || toDateText(record.createdAt) <= dateTo)
        );
      })
      .sort((a, b) => getTimeValue(b.createdAt) - getTimeValue(a.createdAt))
      .map(mapBackendHistoryToHistory);

    return {
      total: list.length,
      list: clone(list),
    };
  }

  async function getHistoryRecordDetail(id) {
    const record = await getHistoryRecordFromSources(id);
    if (!record) {
      return null;
    }
    return clone(mapBackendHistoryToHistoryDetail(record));
  }

  async function deleteHistoryRecord(id) {
    window.SuperRagBackend?.deleteHistoryRecord?.(id);
    records = records.filter((item) => item.id !== id);
    return {
      success: true,
      id,
    };
  }

  async function updateHistoryReview(id, payload = {}) {
    try {
      const saved = await window.SuperRagBackend?.updateHistoryReview?.(id, payload);
      if (saved) {
        return clone(mapBackendHistoryToHistoryDetail(mapArtifactLikeRecord(saved)));
      }
    } catch (error) {
      console.warn(`[SuperRAG HistoryService] backend review update fallback: ${error.message || error}`);
    }

    const localRecords = window.SuperRagBackend?.getHistoryRecords?.() || [];
    const target = localRecords.find((item) => item.id === id);
    if (target) {
      target.reviewStatus = payload.reviewStatus || payload.review_status || target.reviewStatus || "待复核";
      target.humanNotes = payload.humanNotes || payload.human_notes || target.humanNotes || "";
      target.updatedAt = window.SuperRagBackend?.nowText?.() || new Date().toISOString();
      target.versionRecords = [
        {
          id: `local-version-${Date.now()}`,
          version: `v${(target.versionRecords || []).length + 1}`,
          time: target.updatedAt,
          operator: payload.operator || target.creator || "course-demo-user",
          change: payload.changeSummary || `人工复核状态更新为：${target.reviewStatus}`,
          snapshot: {
            reviewStatus: target.reviewStatus,
            humanNotes: target.humanNotes,
            title: target.title,
          },
        },
        ...(target.versionRecords || []),
      ];
      window.SuperRagBackend?.setHistoryRecords?.(localRecords);
      return clone(mapBackendHistoryToHistoryDetail(target));
    }

    return null;
  }

  async function getHistoryOptions() {
    const sourceRecords = await getCombinedRecords();
    return {
      sceneModes: ["chat", "training", "handover", "design"],
      projects: uniqueValues(sourceRecords.map((record) => record.project)),
      creators: uniqueValues(sourceRecords.map((record) => record.creator)),
    };
  }

  function mapBackendHistoryToHistory(raw = {}) {
    return {
      id: raw.id || raw.historyId || raw.history_id,
      title: raw.title || raw.originalQuestion || raw.original_question || "SuperRAG record",
      sceneMode: raw.sceneMode || raw.scene_mode || raw.mode || (raw.scene === "general" ? "chat" : raw.scene) || "chat",
      project: raw.project || raw.projectName || raw.project_name || "SuperRAG",
      creator: raw.creator || raw.createdByName || raw.created_by_name || "course-demo-user",
      createdAt: raw.createdAt || raw.created_at || "",
      updatedAt: raw.updatedAt || raw.updated_at || raw.createdAt || raw.created_at || "",
      summary: raw.summary || raw.outputSummary || raw.output_summary || "",
      citationCount: Number(raw.citationCount ?? raw.citation_count ?? raw.citations?.length ?? 0),
      reviewStatus: raw.reviewStatus || raw.review_status || "草稿",
      manualEdited: Boolean(raw.manualEdited || raw.manual_edited || raw.structuredOutput?.manualEdited || raw.structured_output?.manualEdited),
      modifiedAt: raw.modifiedAt || raw.modified_at || raw.structuredOutput?.modifiedAt || raw.structured_output?.modifiedAt || "",
    };
  }

  function mapBackendHistoryToHistoryDetail(raw = {}) {
    const citations = (raw.citations || []).filter((item) => item && typeof item === "object");
    return {
      ...mapBackendHistoryToHistory(raw),
      originalQuestion: raw.originalQuestion || raw.original_question || raw.query || raw.input || "",
      outputSummary: raw.outputSummary || raw.output_summary || raw.summary || "",
      citations: citations.map(mapCitationToEvidence),
      structuredOutput: raw.structuredOutput || raw.structured_output || {},
      qualityAssessment: raw.qualityAssessment || raw.quality_assessment || {},
      reviewStatus: raw.reviewStatus || raw.review_status || "草稿",
      humanNotes: raw.humanNotes || raw.human_notes || "",
      manualEdited: Boolean(raw.manualEdited || raw.manual_edited || raw.structuredOutput?.manualEdited || raw.structured_output?.manualEdited),
      modifiedAt: raw.modifiedAt || raw.modified_at || raw.structuredOutput?.modifiedAt || raw.structured_output?.modifiedAt || "",
      updatedAt: raw.updatedAt || raw.updated_at || raw.createdAt || raw.created_at || "",
      versionRecords: window.SuperRagBackend?.normalizeVersionRecords?.(raw.versionRecords || raw.version_records || []) || [],
    };
  }

  function mapCitationToEvidence(raw = {}) {
    return {
      id: raw.id || raw.segmentId || raw.segment_id || "",
      documentTitle: raw.documentTitle || raw.document_title || raw.title || "知识片段",
      snippet: raw.snippet || raw.content || "",
      relevanceScore: Number(raw.relevanceScore ?? raw.relevance_score ?? raw.score ?? 0),
      score: Number(raw.score ?? raw.relevanceScore ?? raw.relevance_score ?? 0),
      page: raw.page || raw.pageNo || raw.page_no || "",
      segmentId: raw.segmentId || raw.segment_id || raw.id || "",
      chunkId: raw.chunkId || raw.chunk_id || raw.segmentId || raw.segment_id || raw.id || "",
      chunkIndex: raw.chunkIndex || raw.chunk_index || "",
      documentId: raw.documentId || raw.document_id || "",
      sourceName: raw.sourceName || raw.source_name || raw.documentTitle || raw.document_title || raw.title || "",
      artifactId: raw.artifactId || raw.artifact_id || "",
      artifactType: raw.artifactType || raw.artifact_type || "",
    };
  }

  async function getCombinedRecords(params = {}) {
    let backendRecords = [];
    try {
      backendRecords = await window.SuperRagBackend?.fetchHistoryRecords?.(params) || [];
    } catch (error) {
      console.warn(`[SuperRAG HistoryService] backend history unavailable: ${error.message || error}`);
    }
    const localRecords = window.SuperRagBackend?.getHistoryRecords?.() || [];
    const seen = new Set();
    return [
      ...backendRecords.map(mapArtifactLikeRecord),
      ...localRecords.map(mapArtifactLikeRecord),
      ...records,
    ].filter((record) => {
      const id = record.id || `${record.sceneMode}-${record.createdAt}-${record.title}`;
      if (seen.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    });
  }

  async function getHistoryRecordFromSources(id) {
    try {
      const backendRecord = await window.SuperRagBackend?.fetchHistoryRecord?.(id);
      if (backendRecord) {
        return mapArtifactLikeRecord(backendRecord);
      }
    } catch (error) {
      console.warn(`[SuperRAG HistoryService] backend history detail unavailable: ${error.message || error}`);
    }
    return (await getCombinedRecords()).find((item) => item.id === id);
  }

  function mapArtifactLikeRecord(raw = {}) {
    return window.SuperRagBackend?.mapArtifactToLocalHistory
      ? window.SuperRagBackend.mapArtifactToLocalHistory(raw)
      : raw;
  }

  function uniqueValues(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }

  function toDateText(value) {
    return String(value || "").slice(0, 10);
  }

  function getTimeValue(value) {
    const normalized = String(value || "").replace(" ", "T");
    const time = new Date(normalized).getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  window.historyService = {
    getHistoryRecords,
    getHistoryRecordDetail,
    deleteHistoryRecord,
    updateHistoryReview,
    getHistoryOptions,
  };

  window.historyApi = window.historyService;
})();
