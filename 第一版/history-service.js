/**
 * History service and adapter layer.
 *
 * The history page calls window.historyService only. Current data is mock-based
 * and can be replaced with real backend APIs without changing page rendering.
 */
(function () {
  let records = clone((window.SuperRagMock || {}).mockHistoryRecords || []);

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

    const list = records
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
    const record = records.find((item) => item.id === id);
    if (!record) {
      return null;
    }
    return clone(mapBackendHistoryToHistoryDetail(record));
  }

  async function deleteHistoryRecord(id) {
    records = records.filter((item) => item.id !== id);
    return {
      success: true,
      id,
    };
  }

  async function getHistoryOptions() {
    return {
      sceneModes: ["chat", "training", "handover", "design"],
      projects: uniqueValues(records.map((record) => record.project)),
      creators: uniqueValues(records.map((record) => record.creator)),
    };
  }

  function mapBackendHistoryToHistory(raw = {}) {
    return {
      id: raw.id || raw.historyId || raw.history_id,
      title: raw.title || "未命名历史记录",
      sceneMode: raw.sceneMode || raw.scene_mode || raw.mode || "chat",
      project: raw.project || raw.projectName || raw.project_name || "企业知识库",
      creator: raw.creator || raw.createdByName || raw.created_by_name || "项目成员",
      createdAt: raw.createdAt || raw.created_at || "",
      summary: raw.summary || raw.outputSummary || raw.output_summary || "",
      citationCount: Number(raw.citationCount ?? raw.citation_count ?? raw.citations?.length ?? 0),
    };
  }

  function mapBackendHistoryToHistoryDetail(raw = {}) {
    const citationIds = new Set(raw.citations || []);
    const citations = ((window.SuperRagMock || {}).mockCitations || []).filter((citation) => citationIds.has(citation.id));
    return {
      ...mapBackendHistoryToHistory(raw),
      originalQuestion: raw.originalQuestion || raw.original_question || raw.input || "",
      outputSummary: raw.outputSummary || raw.output_summary || raw.summary || "",
      citations: citations.map(mapCitationToEvidence),
      versionRecords: raw.versionRecords || raw.version_records || [],
    };
  }

  function mapCitationToEvidence(raw = {}) {
    return {
      id: raw.id || raw.segmentId || raw.segment_id || "",
      documentTitle: raw.documentTitle || raw.document_title || raw.title || "知识库片段",
      snippet: raw.snippet || raw.content || "",
      relevanceScore: Number(raw.relevanceScore ?? raw.relevance_score ?? raw.score ?? 0),
      page: raw.page || raw.pageNo || raw.page_no || "",
      segmentId: raw.segmentId || raw.segment_id || raw.id || "",
    };
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
    getHistoryOptions,
    mapBackendHistoryToHistory,
    mapBackendHistoryToHistoryDetail,
  };

  window.historyApi = window.historyService;
})();
